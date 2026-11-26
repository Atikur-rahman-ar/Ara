import { askResearchModel } from "./openrouter.js";

const AGENT_SYSTEM = [
  "You are ARA, an autonomous academic research agent coordinating a small specialist research team.",
  "Available free tools: search_literature(query) via OpenAlex and search_crossref(query) via Crossref.",
  "Return exactly one JSON object, without markdown fences:",
  '{"action":"search_literature","query":"..."} OR {"action":"search_crossref","query":"..."} OR {"action":"final","answer":"..."}',
  "Search at most 4 times total. Search when scholarly evidence materially improves the answer.",
  "Never invent papers, authors, years, DOI values, quotations, page numbers, findings, or URLs. Cite only retrieved works.",
  "Distinguish established findings, interpretations, contested claims, and speculation. Explain assumptions and limitations.",
  "For philosophy, make premises and inferences explicit and consider serious objections. For science, distinguish empirical evidence from interpretation.",
  "If documents are supplied, treat their extracted text as user-provided material, not independently verified evidence.",
  "Answer in the user's language, with academic rigor and clear structure."
].join("\n");

function parseAction(raw) {
  const cleaned = raw.trim().replace(/^\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`$/, "");
  try { return JSON.parse(cleaned); } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) { try { return JSON.parse(match[0]); } catch {} }
    return null;
  }
}

async function searchOpenAlex(query) {
  const url = new URL("https://api.openalex.org/works");
  url.searchParams.set("search", query);
  url.searchParams.set("per-page", "6");
  url.searchParams.set("select", "id,doi,title,publication_year,authorships,cited_by_count,type");
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error("OpenAlex returned HTTP " + response.status);
  const data = await response.json();
  return (data.results || []).map((work) => ({
    title: work.title || "Untitled",
    year: work.publication_year || null,
    authors: (work.authorships || []).slice(0, 5).map((a) => a.author?.display_name).filter(Boolean),
    doi: work.doi || null,
    url: work.doi || work.id || null,
    cited_by: work.cited_by_count ?? null,
    type: work.type || null,
    source: "OpenAlex"
  }));
}

async function searchCrossref(query) {
  const url = new URL("https://api.crossref.org/works");
  url.searchParams.set("query.bibliographic", query);
  url.searchParams.set("rows", "6");
  url.searchParams.set("select", "DOI,title,author,published,container-title,type,URL,is-referenced-by-count");
  const response = await fetch(url, {
    headers: { "User-Agent": "ARA-Research-Agent/0.2 (mailto:contact@ara.local)" },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error("Crossref returned HTTP " + response.status);
  const data = await response.json();
  return (data.message?.items || []).map((work) => ({
    title: work.title?.[0] || "Untitled",
    year: work.published?.["date-parts"]?.[0]?.[0] || null,
    authors: (work.author || []).slice(0, 5).map((a) => [a.given, a.family].filter(Boolean).join(" ")),
    doi: work.DOI || null,
    url: work.URL || (work.DOI ? "https://doi.org/" + work.DOI : null),
    cited_by: work["is-referenced-by-count"] ?? null,
    type: work.type || null,
    journal: work["container-title"]?.[0] || null,
    source: "Crossref"
  }));
}

async function specialistReview(role, question, draft, evidence) {
  return askResearchModel([
    { role: "system", content: "You are a specialist academic reviewer. " + role + " Do not invent external facts. Identify concrete strengths, errors, unsupported claims, missing caveats, and improvements." },
    { role: "user", content: "QUESTION:\n" + question + "\n\nDRAFT:\n" + draft + "\n\nRETRIEVED RECORDS:\n" + JSON.stringify(evidence).slice(0, 16000) + "\n\nGive concise, actionable review notes in the user's language." }
  ]);
}

async function teamReview(question, draft, evidence, trace) {
  const [logic, evidenceAudit] = await Promise.all([
    specialistReview("Focus on logic, argument structure, assumptions, conceptual precision, and counterarguments.", question, draft, evidence),
    specialistReview("Focus on factual accuracy, methodology, source support, and citation integrity.", question, draft, evidence)
  ]);
  trace.push({ tool: "ARA Review Team", roles: ["Logic & Methodology Reviewer", "Evidence & Citation Reviewer", "Lead Synthesizer"] });
  return askResearchModel([
    { role: "system", content: "You are ARA's lead editor. Revise the draft using the specialist reviews. Correct genuine problems, reject mistaken suggestions, preserve nuance, and never invent citations. State limitations honestly. Answer in the user's language." },
    { role: "user", content: "QUESTION:\n" + question + "\n\nDRAFT:\n" + draft + "\n\nLOGIC REVIEW:\n" + logic + "\n\nEVIDENCE REVIEW:\n" + evidenceAudit + "\n\nWrite the final answer." }
  ]);
}

export async function runResearchAgent(conversation, mode = "research") {
  const latestQuestion = [...conversation].reverse().find((item) => item.role === "user")?.content || "";
  const modeInstructions = {
    quick: "Use no external searches. Answer concisely but accurately.",
    research: "Conduct careful scholarly research when useful, then synthesize.",
    deep: "Conduct deeper research with multiple source searches when useful. Examine objections, alternative explanations, and methodological limitations."
  };
  const messages = [
    { role: "system", content: AGENT_SYSTEM + "\nMODE: " + (modeInstructions[mode] || modeInstructions.research) },
    ...conversation
  ];
  const trace = [];
  const evidence = [];
  let searches = 0;
  // Keep ordinary research responsive; reserve the full review pipeline for Deep Research.
  const searchLimit = mode === "deep" ? 3 : 1;
  let draft = "";

  if (mode !== "quick") {
    for (let step = 0; step < 4; step += 1) {
      const raw = await askResearchModel(messages);
      const action = parseAction(raw);
      if (!action || typeof action !== "object") { draft = raw; break; }
      if (action.action === "final" && typeof action.answer === "string") { draft = action.answer; break; }

      if ((action.action === "search_literature" || action.action === "search_crossref") && searches < searchLimit) {
        searches += 1;
        const query = String(action.query || "").trim().slice(0, 300);
        const tool = action.action === "search_literature" ? "OpenAlex" : "Crossref";
        try {
          const records = action.action === "search_literature" ? await searchOpenAlex(query) : await searchCrossref(query);
          evidence.push(...records);
          trace.push({ tool, query, resultCount: records.length, records });
          messages.push({ role: "assistant", content: JSON.stringify(action) });
          messages.push({ role: "user", content: "TOOL RESULT from " + tool + " for query: " + query + "\n" + JSON.stringify(records) + "\nUse only retrieved records as bibliographic evidence. Search again if necessary or answer now as JSON." });
        } catch (error) {
          trace.push({ tool, query, error: error.message });
          messages.push({ role: "assistant", content: JSON.stringify(action) });
          messages.push({ role: "user", content: "TOOL ERROR: " + error.message + ". Continue honestly." });
        }
        continue;
      }
      messages.push({ role: "assistant", content: raw });
      messages.push({ role: "user", content: "Search limit reached. Return the final answer as JSON." });
    }
  }

  if (!draft) {
    draft = await askResearchModel([
      { role: "system", content: "Answer based only on the conversation and retrieved records. Do not claim unperformed searches." },
      ...messages,
      { role: "user", content: "Provide the final answer in the user's language." }
    ]);
  }

  // Quick and Research return directly after drafting. Deep Research adds the
  // slower independent specialist-review and synthesis passes.
  if (mode !== "deep") return { answer: draft, trace, evidenceCount: evidence.length };

  try {
    const answer = await teamReview(latestQuestion, draft, evidence, trace);
    return { answer, trace, evidenceCount: evidence.length };
  } catch (error) {
    trace.push({ tool: "ARA Review Team", error: error.message });
    return { answer: draft, trace, evidenceCount: evidence.length };
  }
}
