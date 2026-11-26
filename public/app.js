const form = document.querySelector("#chat-form");
const input = document.querySelector("#message-input");
const sendButton = document.querySelector("#send-button");
const messagesElement = document.querySelector("#messages");
const welcome = document.querySelector("#welcome");
const connectionStatus = document.querySelector("#connection-status");
const newChatButton = document.querySelector("#new-chat");
const pdfInput = document.querySelector("#pdf-input");
const pdfStatus = document.querySelector("#pdf-status");
const pdfList = document.querySelector("#pdf-list");
const clearPdfsButton = document.querySelector("#clear-pdfs");
const researchMode = document.querySelector("#research-mode");
const csvInput = document.querySelector("#csv-input");
const csvList = document.querySelector("#csv-list");
const imageInput = document.querySelector("#image-input");
const imageList = document.querySelector("#image-list");
let attachedImageFile = null;
let attachedDataset = null;
let sentDataset = false;
const STORAGE_KEY = "ara.conversation.v1";

function saveConversation() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(conversation.slice(-30))); } catch {}
}

function restoreConversation() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(saved)) {
      conversation = saved.filter((item) => item && ["user", "assistant"].includes(item.role) && typeof item.content === "string").slice(-30);
      for (const item of conversation) addMessage(item.role, item.content);
      if (conversation.length) welcome.hidden = true;
    }
  } catch { conversation = []; }
}

let conversation = [];
let busy = false;
let attachedDocuments = [];
let sentDocumentCount = 0;

function renderPdfList() {
  pdfList.replaceChildren();
  for (const doc of attachedDocuments) {
    const item = document.createElement("span");
    item.className = "pdf-chip";
    item.textContent = doc.filename + " · " + doc.pages + " pages";
    pdfList.append(item);
  }
  clearPdfsButton.hidden = attachedDocuments.length === 0;
  pdfStatus.textContent = attachedDocuments.length
    ? attachedDocuments.length + " PDF(s) ready — ask ARA to summarize, critique, compare, or extract references"
    : "Up to 3 PDFs · 8 MB each · 40 pages each";
}

pdfInput.addEventListener("change", async () => {
  const files = Array.from(pdfInput.files || []);
  if (!files.length) return;
  if (files.length + attachedDocuments.length > 3) {
    pdfStatus.textContent = "Maximum 3 PDFs. Clear existing files first.";
    pdfInput.value = "";
    return;
  }
  if (files.some((file) => file.size > 8 * 1024 * 1024)) {
    pdfStatus.textContent = "Each PDF must be 8 MB or smaller.";
    pdfInput.value = "";
    return;
  }

  pdfStatus.textContent = "Extracting PDF text…";
  const payload = new FormData();
  files.forEach((file) => payload.append("files", file));
  try {
    const response = await fetch("/api/documents/extract", { method: "POST", body: payload });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "PDF extraction failed.");
    attachedDocuments.push(...data.documents);
    renderPdfList();
  } catch (error) {
    pdfStatus.textContent = "Could not read PDF: " + error.message;
  } finally {
    pdfInput.value = "";
  }
});

clearPdfsButton.addEventListener("click", () => {
  attachedDocuments = [];
  sentDocumentCount = 0;
  renderPdfList();
});


function renderImageList() {
  imageList.replaceChildren();
  if (!attachedImageFile) return;
  const chip = document.createElement("span");
  chip.className = "pdf-chip";
  chip.textContent = attachedImageFile.name;
  imageList.append(chip);
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "clear-pdfs";
  clear.textContent = "Remove image";
  clear.addEventListener("click", () => { attachedImageFile = null; renderImageList(); });
  imageList.append(clear);
}

imageInput.addEventListener("change", () => {
  const file = imageInput.files?.[0];
  if (!file) return;
  if (file.size > 4 * 1024 * 1024) { imageList.textContent = "Image must be 4 MB or smaller."; imageInput.value = ""; return; }
  attachedImageFile = file;
  renderImageList();
  imageInput.value = "";
});

function renderCsvList() {
  csvList.replaceChildren();
  if (!attachedDataset) return;
  const chip = document.createElement("span");
  chip.className = "pdf-chip";
  chip.textContent = attachedDataset.filename + " · " + attachedDataset.rows + " rows · " + attachedDataset.columns + " columns";
  csvList.append(chip);
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "clear-pdfs";
  clear.textContent = "Remove dataset";
  clear.addEventListener("click", () => {
    attachedDataset = null;
    sentDataset = false;
    renderCsvList();
  });
  csvList.append(clear);
}

csvInput.addEventListener("change", async () => {
  const file = csvInput.files?.[0];
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) {
    csvList.textContent = "CSV must be 8 MB or smaller.";
    csvInput.value = "";
    return;
  }
  csvList.textContent = "Analyzing dataset…";
  const payload = new FormData();
  payload.append("file", file);
  try {
    const response = await fetch("/api/data/analyze", { method: "POST", body: payload });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "CSV analysis failed.");
    attachedDataset = data.analysis;
    sentDataset = false;
    renderCsvList();
  } catch (error) {
    csvList.textContent = "Could not analyze CSV: " + error.message;
  } finally {
    csvInput.value = "";
  }
});

function addMessage(role, content) {
  const article = document.createElement("article");
  article.className = "message " + role;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = role === "user" ? "Y" : "A";

  const body = document.createElement("div");
  body.className = "message-body";

  const label = document.createElement("div");
  label.className = "message-label";
  label.textContent = role === "user" ? "YOU" : "ARA";

  const text = document.createElement("div");
  text.className = "message-content";
  text.textContent = content;

  body.append(label, text);
  article.append(avatar, body);
  messagesElement.append(article);
  article.scrollIntoView({ behavior: "smooth", block: "end" });
  return text;
}


function renderSources(parent, research) {
  const records = (Array.isArray(research) ? research : [])
    .flatMap((item) => Array.isArray(item.records) ? item.records : []);
  const unique = [];
  const seen = new Set();
  for (const record of records) {
    const key = record.doi || record.title;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(record);
  }
  if (!unique.length) return;

  const section = document.createElement("section");
  section.className = "source-list";
  const heading = document.createElement("strong");
  heading.textContent = "Retrieved scholarly records";
  section.append(heading);

  for (const record of unique.slice(0, 12)) {
    const item = document.createElement("div");
    item.className = "source-item";
    const title = document.createElement("a");
    title.textContent = record.title || "Untitled record";
    title.href = record.url || (record.doi ? "https://doi.org/" + record.doi : "#");
    try {
      const parsed = new URL(title.href);
      if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("Unsafe link");
    } catch {
      title.removeAttribute("href");
    }
    title.target = "_blank";
    title.rel = "noopener noreferrer";
    item.append(title);

    const meta = document.createElement("span");
    const authors = Array.isArray(record.authors) ? record.authors.join(", ") : "";
    meta.textContent = [authors, record.year, record.journal, record.doi ? "DOI: " + record.doi : "", record.source]
      .filter(Boolean).join(" · ");
    item.append(meta);
    section.append(item);
  }
  parent.append(section);
}

function setBusy(value) {
  busy = value;
  sendButton.disabled = value;
  sendButton.querySelector("span").textContent = value ? "Thinking" : "Send";
}

async function sendMessage(rawMessage) {
  const content = rawMessage.trim();
  if (!content || busy) return;

  const newDocuments = attachedDocuments.slice(sentDocumentCount);
  const documentContext = newDocuments.length
    ? "\n\nUSER-UPLOADED PDF DOCUMENTS (use as source material; distinguish their claims from independently verified facts):\n" +
      newDocuments.map((doc) =>
        "FILE: " + doc.filename + " (" + doc.pages + " pages)\n" + doc.text
      ).join("\n\n")
    : "";
  sentDocumentCount = attachedDocuments.length;
  const datasetContext = attachedDataset && !sentDataset
    ? "\n\nUSER-UPLOADED DATASET ANALYSIS (descriptive statistics, not causal inference):\n" + JSON.stringify(attachedDataset)
    : "";
  sentDataset = Boolean(attachedDataset);
  const imageToAnalyze = attachedImageFile;
  const requestContent = content + documentContext + datasetContext;

  welcome.hidden = true;
  addMessage("user", content);
  conversation.push({ role: "user", content: requestContent });
  saveConversation();
  input.value = "";
  input.style.height = "auto";
  setBusy(true);

  const loading = addMessage("assistant", "Thinking through your question…");
  loading.classList.add("typing");

  try {
    let response;
    if (imageToAnalyze) {
      const payload = new FormData();
      payload.append("image", imageToAnalyze);
      payload.append("prompt", requestContent);
      response = await fetch("/api/vision/analyze", { method: "POST", body: payload });
    } else {
      response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: conversation, mode: researchMode.value })
      });
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Something went wrong.");

    loading.classList.remove("typing");
    const researchNote = Array.isArray(data.research) && data.research.length
      ? "\n\n---\nResearch activity: " + data.research.map((item) =>
          item.error
            ? item.tool + " search failed (" + item.error + ")"
            : item.tool + " searched \\"" + item.query + "\\" (" + item.resultCount + " records)"
        ).join("; ")
      : "";
    loading.textContent = data.answer + researchNote;
    conversation.push({ role: "assistant", content: data.answer + researchNote });
    if (imageToAnalyze) { attachedImageFile = null; renderImageList(); }
    saveConversation();

    const exportGroup = document.createElement("div");
    exportGroup.className = "export-group";
    for (const format of ["pdf", "docx", "xlsx", "pptx"]) {
      const exportButton = document.createElement("button");
      exportButton.type = "button";
      exportButton.className = "export-pdf";
      exportButton.textContent = "↓ " + format.toUpperCase();
      exportButton.addEventListener("click", async () => {
        exportButton.disabled = true;
        const originalLabel = exportButton.textContent;
        exportButton.textContent = "Preparing…";
        try {
          const fileResponse = await fetch("/api/reports/" + format, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: "ARA Research Report", content: data.answer + researchNote })
          });
          if (!fileResponse.ok) {
            const errorData = await fileResponse.json().catch(() => ({}));
            throw new Error(errorData.error || "Export failed.");
          }
          const blob = await fileResponse.blob();
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = "ARA-Research-Report." + format;
          document.body.append(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(url);
          exportButton.textContent = "✓ " + format.toUpperCase();
        } catch (error) {
          exportButton.textContent = "Failed";
          exportButton.title = error.message;
        } finally {
          exportButton.disabled = false;
          if (exportButton.textContent === "Failed") setTimeout(() => { exportButton.textContent = originalLabel; }, 3500);
        }
      });
      exportGroup.append(exportButton);
    }
    loading.parentElement.append(exportGroup);
    renderSources(loading.parentElement, data.research);
  } catch (error) {
    loading.classList.remove("typing");
    loading.textContent = "Sorry — " + error.message;
    conversation.pop();
    sentDocumentCount = Math.max(0, sentDocumentCount - newDocuments.length);
    if (datasetContext) sentDataset = false;
    saveConversation();
  } finally {
    setBusy(false);
    input.focus();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(input.value);
});

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 170) + "px";
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

document.querySelectorAll(".suggestion").forEach((button) => {
  button.addEventListener("click", () => {
    input.value = button.dataset.prompt || "";
    input.focus();
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 170) + "px";
  });
});

newChatButton.addEventListener("click", () => {
  if (busy) return;
  conversation = [];
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  attachedDocuments = [];
  sentDocumentCount = 0;
  attachedDataset = null;
  sentDataset = false;
  attachedImageFile = null;
  messagesElement.replaceChildren();
  welcome.hidden = false;
  input.value = "";
  renderPdfList();
  renderCsvList();
  renderImageList();
  input.focus();
});

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    connectionStatus.textContent = data.configured ? "API connected" : "API key not configured";
    if (!data.configured) connectionStatus.style.color = "#e5b46d";
  } catch {
    connectionStatus.textContent = "Server unavailable";
    connectionStatus.style.color = "#e58c8c";
  }
}

renderPdfList();
renderCsvList();
renderImageList();
restoreConversation();
checkHealth();
