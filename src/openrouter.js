import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
    "X-Title": "ARA — Autonomous Research Assistant"
  }
});

export async function askResearchModel(messages) {
  if (!process.env.OPENROUTER_API_KEY) {
    const error = new Error("OPENROUTER_API_KEY is not configured.");
    error.status = 500;
    throw error;
  }

  const completion = await client.chat.completions.create({
    model: process.env.OPENROUTER_MODEL || "openrouter/free",
    messages,
    temperature: 0.3
  });

  const answer = completion.choices?.[0]?.message?.content;
  if (typeof answer !== "string" || !answer.trim()) {
    throw new Error("The model returned an empty response.");
  }

  return answer.trim();
}
