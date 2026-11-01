const elements = {
  fileInput: document.querySelector("#pdf-input"), documentList: document.querySelector("#document-list"),
  documentCount: document.querySelector("#document-count"), emptyLibrary: document.querySelector("#empty-library"),
  uploadStatus: document.querySelector("#upload-status"), welcome: document.querySelector("#welcome"),
  conversation: document.querySelector("#conversation"), selectedDocument: document.querySelector("#selected-document"),
  messageList: document.querySelector("#message-list"), breadcrumbDocument: document.querySelector("#breadcrumb-document"),
  chatForm: document.querySelector("#chat-form"), questionInput: document.querySelector("#question-input"),
  noDocumentNote: document.querySelector("#no-document-note"), chatError: document.querySelector("#chat-error"),
  sendButton: document.querySelector(".send-button"),
  previewDialog: document.querySelector("#pdf-preview-dialog"),
  previewFrame: document.querySelector("#pdf-preview-frame"),
  previewTitle: document.querySelector("#pdf-preview-title"),
};

let documents = [];
let selectedDocumentId = null;
let sending = false;

function setUploadMessage(message, isError = false) {
  elements.uploadStatus.textContent = message;
  elements.uploadStatus.classList.toggle("error", isError);
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  if (!response.ok) {
    let message = "Something went wrong. Please try again.";
    try {
      const body = await response.json();
      if (typeof body.detail === "string") message = body.detail;
    } catch (_) { /* Keep the generic message if the server response isn't JSON. */ }
    throw new Error(message);
  }
  if (response.status === 204) return null;
  return response.json();
}

function renderDocuments() {
  elements.documentList.replaceChildren();
  elements.documentCount.textContent = String(documents.length);
  elements.emptyLibrary.hidden = documents.length > 0;
  for (const item of documents) {
    const card = document.createElement("div");
    card.className = `document-card${item.id === selectedDocumentId ? " selected" : ""}`;
    card.setAttribute("role", "group");
    const select = document.createElement("button");
    select.className = "document-card-select";
    select.type = "button";
    select.style.cssText = "display:flex;align-items:center;gap:9px;min-width:0;flex:1;padding:0;border:0;background:transparent;text-align:left;cursor:pointer;color:inherit";
    select.setAttribute("aria-label", `Select ${item.filename}`);
    select.setAttribute("aria-pressed", String(item.id === selectedDocumentId));
    const icon = document.createElement("span"); icon.className = "pdf-icon"; icon.textContent = "PDF";
    const meta = document.createElement("span"); meta.className = "document-meta";
    const name = document.createElement("span"); name.className = "document-name"; name.textContent = item.filename;
    const detail = document.createElement("span"); detail.className = "document-sub";
    detail.textContent = `${item.page_count} ${item.page_count === 1 ? "page" : "pages"} · PDF`;
    meta.append(name, detail); select.append(icon, meta);
    select.addEventListener("click", () => selectDocument(item.id));
    const actions = document.createElement("span"); actions.className = "document-actions";
    const preview = document.createElement("button"); preview.className = "preview-button"; preview.type = "button";
    preview.textContent = "View"; preview.title = `Preview ${item.filename}`;
    preview.setAttribute("aria-label", `Preview ${item.filename}`);
    preview.addEventListener("click", () => openPreview(item));
    const remove = document.createElement("button"); remove.className = "delete-button"; remove.type = "button";
    remove.title = `Delete ${item.filename}`; remove.setAttribute("aria-label", `Delete ${item.filename}`); remove.textContent = "Delete";
    remove.addEventListener("click", () => deleteDocument(item));
    actions.append(preview, remove); card.append(select, actions); elements.documentList.append(card);
  }
}

function setSelectedDocument(item) {
  selectedDocumentId = item?.id ?? null;
  elements.breadcrumbDocument.textContent = item?.filename ?? "New conversation";
  elements.welcome.hidden = Boolean(item);
  elements.conversation.hidden = !item;
  document.body.classList.toggle("is-chat", Boolean(item));
  elements.chatForm.hidden = !item;
  elements.noDocumentNote.hidden = Boolean(item);
  elements.messageList.replaceChildren();
  elements.chatError.hidden = true;
  if (item) {
    elements.selectedDocument.replaceChildren();
    const icon = document.createElement("span"); icon.className = "selected-file"; icon.textContent = "PDF";
    const text = document.createElement("div");
    const title = document.createElement("div"); title.className = "selected-title"; title.textContent = item.filename;
    const details = document.createElement("div"); details.className = "selected-details";
    details.textContent = `${item.page_count} ${item.page_count === 1 ? "page" : "pages"} · Ready to chat`;
    text.append(title, details);
    const check = document.createElement("span"); check.className = "selected-check"; check.textContent = "● Ready";
    const preview = document.createElement("button"); preview.className = "selected-preview";
    preview.type = "button"; preview.textContent = "Preview PDF";
    preview.addEventListener("click", () => openPreview(item));
    elements.selectedDocument.append(icon, text, check, preview);
  }
  renderDocuments();
}

function selectDocument(id) {
  const item = documents.find((document) => document.id === id);
  if (!item) return;
  setSelectedDocument(item);
  elements.questionInput.focus();
}

async function loadDocuments() {
  try { documents = await api("/api/documents"); renderDocuments(); }
  catch (error) {
    if (error.message !== "Please sign in to continue.") setUploadMessage(error.message, true);
  }
}

async function uploadDocument(file) {
  if (!file) return;
  setUploadMessage("Checking and reading your PDF…");
  document.querySelector(".sidebar").classList.add("uploading");
  const form = new FormData(); form.append("file", file);
  try {
    const uploaded = await api("/api/documents", { method: "POST", body: form });
    documents.unshift(uploaded);
    setUploadMessage(`${uploaded.filename} is ready to chat.`);
    selectDocument(uploaded.id);
  } catch (error) { setUploadMessage(error.message, true); }
  finally {
    document.querySelector(".sidebar").classList.remove("uploading");
    elements.fileInput.value = "";
  }
}

async function deleteDocument(item) {
  if (!window.confirm(`Delete “${item.filename}” and its stored copy?`)) return;
  try {
    await api(`/api/documents/${encodeURIComponent(item.id)}`, { method: "DELETE" });
    documents = documents.filter((document) => document.id !== item.id);
    if (selectedDocumentId === item.id) setSelectedDocument(null); else renderDocuments();
    setUploadMessage(`${item.filename} deleted.`);
  } catch (error) { setUploadMessage(error.message, true); }
}

function openPreview(item) {
  elements.previewTitle.textContent = item.filename;
  elements.previewFrame.src = `/api/documents/${encodeURIComponent(item.id)}/file`;
  elements.previewDialog.showModal();
}

function closePreview() {
  elements.previewDialog.close();
  elements.previewFrame.src = "about:blank";
}

document.querySelector("#close-pdf-preview").addEventListener("click", closePreview);
elements.previewDialog.addEventListener("click", (event) => {
  if (event.target === elements.previewDialog) closePreview();
});
elements.previewDialog.addEventListener("close", () => { elements.previewFrame.src = "about:blank"; });

function appendMessage(role, content, isTyping = false) {
  const row = document.createElement("div"); row.className = `message ${role}`;
  const avatar = document.createElement("span"); avatar.className = "avatar"; avatar.textContent = role === "user" ? "Y" : "D";
  const messageContent = document.createElement("div"); messageContent.className = "message-content";
  const label = document.createElement("div"); label.className = "message-label"; label.textContent = role === "user" ? "You" : "DocGuard AI";
  const text = document.createElement("div"); text.className = "message-text";
  if (isTyping) {
    text.classList.add("typing"); text.setAttribute("aria-label", "DocGuard AI is thinking");
    text.innerHTML = "<i></i><i></i><i></i>";
  } else text.textContent = content;
  messageContent.append(label, text); row.append(avatar, messageContent); elements.messageList.append(row);
  row.scrollIntoView({ block: "nearest", behavior: "smooth" });
  return row;
}

async function sendQuestion(question) {
  const cleanQuestion = question.trim();
  if (!cleanQuestion || !selectedDocumentId || sending) return;
  const documentId = selectedDocumentId; sending = true;
  elements.questionInput.value = ""; elements.questionInput.style.height = "auto"; elements.chatError.hidden = true;
  appendMessage("user", cleanQuestion);
  const pending = appendMessage("assistant", "", true); elements.sendButton.disabled = true;
  try {
    const result = await api("/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document_id: documentId, question: cleanQuestion }),
    });
    if (selectedDocumentId === documentId) {
      const text = pending.querySelector(".message-text"); text.classList.remove("typing");
      text.removeAttribute("aria-label"); text.replaceChildren(document.createTextNode(result.answer));
    }
  } catch (error) {
    pending.remove();
    if (selectedDocumentId === documentId) { elements.chatError.textContent = error.message; elements.chatError.hidden = false; }
  } finally { sending = false; elements.sendButton.disabled = false; elements.questionInput.focus(); }
}

elements.fileInput.addEventListener("change", (event) => uploadDocument(event.target.files[0]));
elements.chatForm.addEventListener("submit", (event) => { event.preventDefault(); sendQuestion(elements.questionInput.value); });
elements.questionInput.addEventListener("input", () => {
  elements.questionInput.style.height = "auto";
  elements.questionInput.style.height = `${Math.min(elements.questionInput.scrollHeight, 120)}px`;
});
elements.questionInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); elements.chatForm.requestSubmit(); }
});
document.querySelectorAll(".suggestion").forEach((button) => button.addEventListener("click", () => {
  if (document.body.classList.contains("signed-out")) { window.location.assign("/login"); return; }
  if (!selectedDocumentId) { setUploadMessage("Upload and select a PDF to ask questions."); return; }
  sendQuestion(button.dataset.question);
}));

loadDocuments();
