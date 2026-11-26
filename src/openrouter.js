export async function askResearchModel(messages) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    const error = new Error("OPENROUTER_API_KEY is not configured. Check the .env file.");
    error.status = 500;
    throw error;
  }

  const model = process.env.OPENROUTER_MODEL || "openrouter/free";

  let response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
        "X-Title": "ARA — Autonomous Research Assistant"
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3
      }),
      signal: AbortSignal.timeout(90000)
    });
  } catch (cause) {
    const error = new Error(`Could not connect to OpenRouter: ${cause.message}`);
    error.cause = cause;
    throw error;
  }

  const rawBody = await response.text();
  let data;
  try {
    data = JSON.parse(rawBody);
  } catch {
    throw new Error(`OpenRouter returned non-JSON data (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    const message = data?.error?.message || data?.message || rawBody;
    const error = new Error(`OpenRouter HTTP ${response.status}: ${message}`);
    error.status = response.status;
    throw error;
  }

  const answer = data?.choices?.[0]?.message?.content;
  if (typeof answer !== "string" || !answer.trim()) {
    throw new Error("The model returned an empty or unsupported response.");
  }

  return answer.trim();
}
