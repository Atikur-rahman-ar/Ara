import "dotenv/config";
import express from "express";
import multer from "multer";
import { createOfficeExport } from "./src/office-exports.js";
import { analyzeCsv } from "./src/data-analysis.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runResearchAgent } from "./src/agent.js";
import { askResearchModel } from "./src/openrouter.js";
import { createResearchPdf, validatePdfRequest } from "./src/pdf.js";
import { extractPdfDocument } from "./src/pdf-reader.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT) || 3000;
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024, files: 1 } });
const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 3 }
});

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    name: "ARA",
    configured: Boolean(process.env.OPENROUTER_API_KEY),
    capabilities: ["agent-loop", "openalex-literature-search", "crossref-search", "specialist-review", "pdf-report-export", "pdf-text-extraction", "docx-export", "xlsx-export", "pptx-export", "csv-statistical-analysis", "image-understanding"]
  });
});

app.post("/api/vision/analyze", (req, res) => {
  imageUpload.single("image")(req, res, async (uploadError) => {
    if (uploadError) return res.status(400).json({ error: uploadError.message || "Image upload failed." });
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: "Choose an image file." });
      const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      if (!allowed.includes(file.mimetype)) return res.status(400).json({ error: "Use a JPG, PNG, WEBP, or GIF image." });
      const prompt = String(req.body?.prompt || "Describe and analyze this image carefully.").slice(0, 12000);
      const imageUrl = "data:" + file.mimetype + ";base64," + file.buffer.toString("base64");
      const answer = await askResearchModel([
        { role: "system", content: "You are ARA's visual analysis specialist. Analyze only what is visible. Distinguish observation from inference, note uncertainty, and never identify a real person in an image. Answer in the user's language." },
        { role: "user", content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageUrl } }
        ] }
      ]);
      return res.json({ answer });
    } catch (error) {
      return res.status(502).json({ error: "Image analysis failed. Confirm that the selected OpenRouter model supports vision. " + error.message });
    }
  });
});

app.post("/api/data/analyze", (req, res) => {
  pdfUpload.single("file")(req, res, (uploadError) => {
    if (uploadError) return res.status(400).json({ error: uploadError.message || "CSV upload failed." });
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: "Choose a CSV file." });
      if (!file.originalname.toLowerCase().endsWith(".csv")) return res.status(400).json({ error: "Please upload a .csv file." });
      const result = analyzeCsv(file.buffer, file.originalname);
      return res.json({ analysis: result });
    } catch (error) {
      return res.status(400).json({ error: error.message || "Could not analyze the CSV." });
    }
  });
});

app.post("/api/documents/extract", (req, res, next) => {
  pdfUpload.array("files", 3)(req, res, async (uploadError) => {
    if (uploadError) {
      const message = uploadError.code === "LIMIT_FILE_SIZE"
        ? "Each PDF must be 8 MB or smaller."
        : uploadError.code === "LIMIT_FILE_COUNT"
          ? "Upload no more than 3 PDFs at a time."
          : uploadError.message;
      return res.status(400).json({ error: message });
    }
    try {
      const files = req.files || [];
      if (!files.length) return res.status(400).json({ error: "Choose at least one PDF file." });
      const documents = [];
      for (const file of files) documents.push(await extractPdfDocument(file));
      return res.json({ documents });
    } catch (error) {
      return res.status(400).json({ error: error.message || "Could not read the PDF." });
    }
  });
});

app.post("/api/reports/:format", async (req, res) => {
  try {
    const format = String(req.params.format || "").toLowerCase();
    const report = validatePdfRequest(req.body);
    if (format === "pdf") {
      const filename = report.title.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "ara-research-report";
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}.pdf"`);
      res.setHeader("Cache-Control", "no-store");
      return createResearchPdf(report).pipe(res);
    }
    const file = await createOfficeExport(format, report);
    const filename = report.title.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "ara-research-report";
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}.${file.extension}"`);
    res.setHeader("Cache-Control", "no-store");
    return res.send(file.buffer);
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message || "Could not export the report." });
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
    .map(({ role, content }) => ({ role, content: content.trim().slice(0, 40000) }))
    .filter((item) => item.content.length > 0);

  if (!normalizedMessages.length || normalizedMessages.at(-1).role !== "user") {
    return res.status(400).json({ error: "The latest message must be from the user." });
  }

  try {
    const mode = ["quick", "research", "deep"].includes(req.body?.mode) ? req.body.mode : "research";
    const result = await runResearchAgent(normalizedMessages, mode);
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
