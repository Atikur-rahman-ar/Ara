const form = document.querySelector("#chat-form");
const input = document.querySelector("#message-input");
const sendButton = document.querySelector("#send-button");
const messagesElement = document.querySelector("#messages");
const welcome = document.querySelector("#welcome");
const connectionStatus = document.querySelector("#connection-status");
const newChatButton = document.querySelector("#new-chat");

let conversation = [];
let busy = false;

function addMessage(role, content) {
  const article = document.createElement("article");
  article.className = `message ${role}`;

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

function setBusy(value) {
  busy = value;
  sendButton.disabled = value;
  sendButton.querySelector("span").textContent = value ? "Thinking" : "Send";
}

async function sendMessage(rawMessage) {
  const content = rawMessage.trim();
  if (!content || busy) return;

  welcome.hidden = true;
  addMessage("user", content);
  conversation.push({ role: "user", content });
  input.value = "";
  input.style.height = "auto";
  setBusy(true);

  const loading = addMessage("assistant", "Thinking through your question…");
  loading.classList.add("typing");

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: conversation })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Something went wrong.");

    loading.classList.remove("typing");
    loading.textContent = data.answer;
    conversation.push({ role: "assistant", content: data.answer });
  } catch (error) {
    loading.classList.remove("typing");
    loading.textContent = `Sorry — ${error.message}`;
    conversation.pop();
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
  input.style.height = `${Math.min(input.scrollHeight, 170)}px`;
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
    input.style.height = `${Math.min(input.scrollHeight, 170)}px`;
  });
});

newChatButton.addEventListener("click", () => {
  if (busy) return;
  conversation = [];
  messagesElement.replaceChildren();
  welcome.hidden = false;
  input.value = "";
  input.focus();
});

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    connectionStatus.textContent = data.configured
      ? "API connected"
      : "API key not configured";
    if (!data.configured) {
      connectionStatus.style.color = "#e5b46d";
    }
  } catch {
    connectionStatus.textContent = "Server unavailable";
    connectionStatus.style.color = "#e58c8c";
  }
}

checkHealth();
