const statusEl = document.getElementById("status");
const sourceListEl = document.getElementById("source-list");
const hintEl = document.getElementById("ingest-hint");
const answerArea = document.getElementById("answer-area");
const askForm = document.getElementById("form-ask");
const askButton = document.getElementById("ask-button");
const questionInput = document.getElementById("question-input");

// ---- Tabs ----
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.querySelector(`.tab-panel[data-panel="${tab.dataset.tab}"]`).classList.add("active");
    hintEl.textContent = "";
    hintEl.className = "hint";
  });
});

function setHint(message, kind) {
  hintEl.textContent = message;
  hintEl.className = "hint" + (kind ? ` ${kind}` : "");
}

function formatBytesAsChunks(count) {
  return `${count} chunk${count === 1 ? "" : "s"}`;
}

async function refreshSources() {
  const res = await fetch("/api/sources");
  const data = await res.json();
  renderSources(data.sources);
}

function renderSources(sources) {
  statusEl.textContent = `${sources.length} source${sources.length === 1 ? "" : "s"} indexed`;

  if (sources.length === 0) {
    sourceListEl.innerHTML = `<li class="empty-state">No sources yet — add one above.</li>`;
    return;
  }

  sourceListEl.innerHTML = "";
  sources.forEach((s, i) => {
    const li = document.createElement("li");
    li.className = "source-item";
    li.innerHTML = `
      <span class="index">${String(i + 1).padStart(2, "0")}</span>
      <span class="meta">
        <div class="name" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</div>
        <div class="detail">${s.type} · ${formatBytesAsChunks(s.chunkCount)}</div>
      </span>
      <button class="remove" title="Remove source" data-id="${s.id}">✕</button>
    `;
    sourceListEl.appendChild(li);
  });

  sourceListEl.querySelectorAll(".remove").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      await fetch(`/api/sources/${btn.dataset.id}`, { method: "DELETE" });
      refreshSources();
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---- Add source: URL ----
document.getElementById("form-url").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("url-input");
  const url = input.value.trim();
  if (!url) return;

  await withHint(async () => {
    const res = await fetch("/api/sources/url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to add URL.");
    input.value = "";
    return `Added “${data.source.name}” (${formatBytesAsChunks(data.source.chunkCount)}).`;
  });
});

// ---- Add source: File ----
document.getElementById("form-file").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("file-input");
  const file = input.files[0];
  if (!file) return;

  await withHint(async () => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/sources/document", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to add document.");
    input.value = "";
    return `Added “${data.source.name}” (${formatBytesAsChunks(data.source.chunkCount)}).`;
  });
});

// ---- Add source: Note ----
document.getElementById("form-note").addEventListener("submit", async (e) => {
  e.preventDefault();
  const nameInput = document.getElementById("note-name");
  const textInput = document.getElementById("note-text");
  const text = textInput.value.trim();
  if (!text) return;

  await withHint(async () => {
    const res = await fetch("/api/sources/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameInput.value.trim(), text }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to add note.");
    nameInput.value = "";
    textInput.value = "";
    return `Added “${data.source.name}” (${formatBytesAsChunks(data.source.chunkCount)}).`;
  });
});

async function withHint(action) {
  const submitButtons = document.querySelectorAll(".add-source button[type='submit'], .add-source button");
  submitButtons.forEach((b) => (b.disabled = true));
  setHint("Reading and embedding…");
  try {
    const message = await action();
    setHint(message, "success");
    refreshSources();
  } catch (err) {
    setHint(err.message, "error");
  } finally {
    submitButtons.forEach((b) => (b.disabled = false));
  }
}

// ---- Ask ----
askForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const question = questionInput.value.trim();
  if (!question) return;

  askButton.disabled = true;
  questionInput.disabled = true;

  const block = document.createElement("div");
  block.className = "qa-block";
  block.innerHTML = `
    <p class="qa-question">${escapeHtml(question)}</p>
    <div class="qa-answer">Thinking…</div>
  `;
  document.querySelector(".placeholder")?.remove();
  answerArea.appendChild(block);
  block.scrollIntoView({ behavior: "smooth", block: "end" });

  try {
    const res = await fetch("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Something went wrong.");

    const answerEl = block.querySelector(".qa-answer");
    answerEl.textContent = data.answer;

    if (data.citations && data.citations.length > 0) {
      const citeWrap = document.createElement("div");
      citeWrap.className = "citations";
      data.citations.forEach((c) => {
        const chip = document.createElement("span");
        chip.className = "citation-chip";
        chip.title = c.snippet;
        chip.innerHTML = `<span class="n">[${c.marker}]</span>${escapeHtml(c.sourceName)}`;
        citeWrap.appendChild(chip);
      });
      block.appendChild(citeWrap);
    }
  } catch (err) {
    block.querySelector(".qa-answer").textContent = `Error: ${err.message}`;
  } finally {
    askButton.disabled = false;
    questionInput.disabled = false;
    questionInput.value = "";
    questionInput.focus();
  }
});

refreshSources();
