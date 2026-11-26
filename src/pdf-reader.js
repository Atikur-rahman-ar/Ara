import { extractText, getDocumentProxy } from "unpdf";

const MAX_PAGES = 40;
const MAX_TEXT_CHARS = 12000;

export async function extractPdfDocument(file) {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw new Error("Invalid PDF upload.");
  }
  if (file.buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error(file.originalname + " is not a valid PDF file.");
  }

  const pdf = await getDocumentProxy(new Uint8Array(file.buffer));
  try {
    if (pdf.numPages > MAX_PAGES) {
      throw new Error(file.originalname + " has " + pdf.numPages +
        " pages. The current limit is " + MAX_PAGES + " pages per PDF.");
    }
    const extracted = await extractText(pdf, { mergePages: true });
    const text = (Array.isArray(extracted.text) ? extracted.text.join("\n") : extracted.text)
      .replace(/\u0000/g, "")
      .trim()
      .slice(0, MAX_TEXT_CHARS);

    if (!text) {
      throw new Error(file.originalname + " contains no selectable text. Scanned PDFs need OCR, which is not available yet.");
    }

    return {
      filename: String(file.originalname || "document.pdf").slice(0, 180),
      pages: extracted.totalPages,
      text,
      truncated: text.length >= MAX_TEXT_CHARS
    };
  } finally {
    await pdf.destroy();
  }
}
