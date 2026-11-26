import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";

const FONT_CANDIDATES = [
  "C:/Windows/Fonts/Nirmala.ttf",
  "C:/Windows/Fonts/NirmalaS.ttf",
  "/usr/share/fonts/truetype/noto/NotoSansBengali-Regular.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
];

function chooseFont() {
  return FONT_CANDIDATES.find((fontPath) => fs.existsSync(fontPath)) || "Helvetica";
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\u0000/g, "").trim().slice(0, maxLength);
}

function addMarkdownContent(doc, content) {
  const lines = content.replace(/\r/g, "").split("\n");
  let inCode = false;

  for (const originalLine of lines) {
    const line = originalLine.trimEnd();
    if (line.trim().startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    if (!line.trim()) {
      doc.moveDown(0.45);
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      doc.moveDown(level === 1 ? 0.8 : 0.5);
      doc.font(level === 1 ? "Bold" : "Bold")
        .fontSize(level === 1 ? 17 : level === 2 ? 14 : 12)
        .fillColor(level === 1 ? "#28234a" : "#34384a")
        .text(heading[2], { paragraphGap: 5 });
      doc.moveDown(0.25);
      continue;
    }

    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const item = line.replace(/^\s*(?:[-*]|\d+[.)])\s+/, "");
      doc.font(inCode ? "Code" : "Regular").fontSize(10.5).fillColor("#222222")
        .text("•  " + item, { indent: 12, hanging: 4, paragraphGap: 3 });
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      doc.font("Italic").fontSize(10.5).fillColor("#555555")
        .text(quote[1], { indent: 18, paragraphGap: 4 });
      continue;
    }

    const text = line
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/`(.*?)`/g, "$1");
    doc.font(inCode ? "Code" : "Regular").fontSize(10.5).fillColor("#222222")
      .text(text, { paragraphGap: 4, lineGap: 2 });
  }
}

export function createResearchPdf({ title, content }) {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 58, bottom: 58, left: 62, right: 62 },
    info: {
      Title: title,
      Author: "ARA - Autonomous Research Assistant",
      Subject: "Research report"
    },
    bufferPages: true
  });

  const fontPath = chooseFont();
  const customFont = fontPath !== "Helvetica";
  if (customFont) {
    doc.registerFont("Regular", fontPath);
    doc.registerFont("Bold", fontPath);
    doc.registerFont("Italic", fontPath);
    doc.registerFont("Code", fontPath);
  } else {
    doc.registerFont("Regular", "Helvetica");
    doc.registerFont("Bold", "Helvetica-Bold");
    doc.registerFont("Italic", "Helvetica-Oblique");
    doc.registerFont("Code", "Courier");
  }

  doc.font("Bold").fontSize(23).fillColor("#29244b")
    .text("ARA", { characterSpacing: 1.5 });
  doc.moveDown(0.25);
  doc.font("Regular").fontSize(9).fillColor("#777777")
    .text("AUTONOMOUS RESEARCH ASSISTANT");
  doc.moveDown(1.3);
  doc.moveTo(62, doc.y).lineTo(533, doc.y).strokeColor("#d9d7e8").lineWidth(1).stroke();
  doc.moveDown(1.1);
  doc.font("Bold").fontSize(20).fillColor("#222222").text(title, { lineGap: 3 });
  doc.moveDown(0.5);
  doc.font("Regular").fontSize(8.5).fillColor("#777777")
    .text("Generated " + new Date().toLocaleString("en-GB"));
  doc.moveDown(1.2);

  addMarkdownContent(doc, content);

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const bottom = doc.page.height - 35;
    doc.font("Regular").fontSize(8).fillColor("#888888")
      .text("ARA | Research report", 62, bottom, { lineBreak: false });
    doc.text("Page " + (i + 1), 485, bottom, { width: 48, align: "right", lineBreak: false });
  }

  doc.end();
  return doc;
}

export function validatePdfRequest(body) {
  const title = cleanText(body?.title, 140) || "ARA Research Report";
  const content = cleanText(body?.content, 80000);
  if (!content) {
    const error = new Error("There is no report content to export.");
    error.status = 400;
    throw error;
  }
  return { title, content };
}
