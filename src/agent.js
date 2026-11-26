import { askResearchModel } from "./openrouter.js";

const AGENT_SYSTEM = "You are ARA, an autonomous academic research agent.\n" +
  "You may use search_literature(query), a free OpenAlex scholarly metadata search tool.\n" +
  "Return exactly one JSON object, without markdown fences: " +
  "{\"action\":\"search_literature\",\"query\":\"...\"} OR " +
  "{\"action\":\"final\",\"answer\":\"...\"}.\n" +
  "Search at most 3 times, then provide a final answer. Search when evidence would materially improve the answer. " +
  "Never invent papers, authors, years, DOI values, findings, or URLs. Cite only retrieved works. " +
  "Disclose when search fails or results are incomplete. Answer in the user's language and be academically rigorous.";

function parseAction(raw) {
  const cleaned = raw.trim().replace(/^\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`$/, "");
  try { return JSON.parse(cleaned); } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) { try { return JSON.parse(match[0]); } catch {} }
    return null;
  }
}

async function searchLiterature(query) {
  const q = String(query || "").trim().slice(0, 300);
  if (!q) throw new Error("Search query was empty.");
  const url = new URL("https://api.openalex.org/works");
  url.searchParams.set("search", q);
  url.searchParams.set("per-page", "6");
  url.searchParams.set("select", "id,doi,title,publication_year,authorships,cited_by_count,type");
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error("OpenAlex returned HTTP " + response.status);
  const data = await response.json();
  return (data.results || []).map((work) => ({
    title: work.title || "Untitled",
    year: work.publication_year || null,
    authors: (work.authorships || []).slice(0, 5).map((a) => a.author && a.author.display_name).filter(Boolean),
    doi: work.doi || null,
    url: work.doi || work.id || null,
    cited_by: work.cited_by_count == null ? null : work.cited_by_count,
    type: work.type || null
  }));
}

export async function runResearchAgent(conversation) {
  const messages = [{ role: "system", content: AGENT_SYSTEM }, ...conversation];
  const trace = [];
  let searches = 0;

  for (let step = 0; step < 5; step += 1) {
    const raw = await askResearchModel(messages);
    const action = parseAction(raw);
    if (!action || typeof action !== "object") {
      if (step === 0) return { answer: raw, trace };
      messages.push({ role: "assistant", content: raw });
      messages.push({ role: "user", content: "Return the required JSON action object only." });
      continue;
    }
    if (action.action === "final" && typeof action.answer === "string") {
      return { answer: action.answer, trace };
    }
    if (action.action === "search_literature" && searches < 3) {
      searches += 1;
      const query = String(action.query || "").slice(0, 300);
      try {
        const results = await searchLiterature(query);
        trace.push({ tool: "OpenAlex", query, resultCount: results.length });
        messages.push({ role: "assistant", content: JSON.stringify(action) });
        messages.push({ role: "user", content: "TOOL RESULT from OpenAlex for query: " + query + "\n" +
          JSON.stringify(results) + "\nUse only these retrieved records as evidence. Decide whether to search again or answer." });
      } catch (error) {
        trace.push({ tool: "OpenAlex", query, error: error.message });
        messages.push({ role: "assistant", content: JSON.stringify(action) });
        messages.push({ role: "user", content: "TOOL ERROR: " + error.message + ". Continue honestly; do not claim successful search." });
      }
      continue;
    }
    messages.push({ role: "assistant", content: raw });
    messages.push({ role: "user", content: "Search limit reached or unsupported action. Provide your final answer now as JSON with action=final." });
  }

  const fallback = await askResearchModel([
    { role: "system", content: "Write the final answer based only on the conversation and tool results. Do not claim unperformed searches." },
    ...messages,
    { role: "user", content: "Provide the final answer now in the user's language." }
  ]);
  return { answer: fallback, trace };
}
