import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runResearchAgent } from "./src/agent.js";
import { createResearchPdf, validatePdfRequest } from "./src/pdf.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    name: "ARA",
    configured: Boolean(process.env.OPENROUTER_API_KEY),
    capabilities: ["agent-loop", "openalex-literature-search"]
  });
});

app.post("/api/reports/pdf", (req, res) => {
  try {
    const report = validatePdfRequest(req.body);
    const filename = report.title
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 70) || "ara-research-report";

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}.pdf"`);
    res.setHeader("Cache-Control", "no-store");
    createResearchPdf(report).pipe(res);
  } catch (error) {
    if (!res.headersSent) {
      res.status(error.status || 500).json({ error: error.message || "Could not create the PDF." });
    } else {
      res.end();
    }
  }
});

app.post("/api/chat", async (req, res) => {
  const { messages } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Please provide a conversation message." });
  }

  const normalizedMessages = messages
    .filter((item) => item && ["user", "assistant"].includes(item.role) && typeof item.content === "string")
    .slice(-20)
    .map(({ role, content }) => ({ role, content: content.trim().slice(0, 12000) }))
    .filter((item) => item.content.length > 0);

  if (!normalizedMessages.length || normalizedMessages.at(-1).role !== "user") {
    return res.status(400).json({ error: "The latest message must be from the user." });
  }

  try {
    const result = await runResearchAgent(normalizedMessages);
    return res.json({ answer: result.answer, research: result.trace });
  } catch (error) {
    console.error("ARA request failed:", error.message);
    const status = error.status === 401 ? 401 : 502;
    const message = status === 401
      ? "OpenRouter rejected the API key. Check your .env configuration."
      : "The research agent could not complete the request. Please try again.";
    return res.status(status).json({ error: message });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`ARA is running at http://localhost:${PORT}`);
});
