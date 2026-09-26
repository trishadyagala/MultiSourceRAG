import "dotenv/config";
import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

import { extractTextFromPDF, extractTextFromURL, chunkText } from "./src/ingest.js";
import { embedBatch, embedText } from "./src/embeddings.js";
import {
  loadStore,
  listSources,
  addSource,
  addChunks,
  removeSource,
  search,
  isEmpty,
} from "./src/vectorstore.js";
import { answerWithContext } from "./src/generate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

await loadStore();

// ---- Health (used by Railway's healthcheck) --------------------------------

app.get("/health", (req, res) => {
  res.status(200).json({ status: "healthy", timestamp: new Date().toISOString() });
});

// ---- Sources -------------------------------------------------------------

app.get("/api/sources", (req, res) => {
  res.json({ sources: listSources() });
});

app.delete("/api/sources/:id", async (req, res) => {
  await removeSource(req.params.id);
  res.json({ ok: true });
});

app.post("/api/sources/document", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file uploaded." });

    const isPDF = file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf");
    const rawText = isPDF
      ? await extractTextFromPDF(file.buffer)
      : file.buffer.toString("utf-8");

    const chunks = chunkText(rawText);
    if (chunks.length === 0) {
      return res.status(422).json({ error: "Couldn't extract any usable text from that file." });
    }

    const embeddings = await embedBatch(chunks, "RETRIEVAL_DOCUMENT");

    const source = await addSource({
      name: file.originalname,
      type: isPDF ? "pdf" : "text",
    });
    await addChunks(source.id, chunks, embeddings);

    res.json({ source: { ...source, chunkCount: chunks.length } });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post("/api/sources/url", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "Missing url." });

    const { title, text } = await extractTextFromURL(url);
    const chunks = chunkText(text);
    if (chunks.length === 0) {
      return res.status(422).json({ error: "Couldn't extract any usable text from that page." });
    }

    const embeddings = await embedBatch(chunks, "RETRIEVAL_DOCUMENT");

    const source = await addSource({
      name: title || url,
      type: "url",
      origin: url,
    });
    await addChunks(source.id, chunks, embeddings);

    res.json({ source: { ...source, chunkCount: chunks.length } });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post("/api/sources/text", async (req, res) => {
  try {
    const { name, text } = req.body;
    if (!text) return res.status(400).json({ error: "Missing text." });

    const chunks = chunkText(text);
    if (chunks.length === 0) {
      return res.status(422).json({ error: "That text was too short to index." });
    }

    const embeddings = await embedBatch(chunks, "RETRIEVAL_DOCUMENT");

    const source = await addSource({ name: name || "Pasted note", type: "text" });
    await addChunks(source.id, chunks, embeddings);

    res.json({ source: { ...source, chunkCount: chunks.length } });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ---- Query ----------------------------------------------------------------

app.post("/api/query", async (req, res) => {
  try {
    const { question, topK } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ error: "Missing question." });
    }
    if (isEmpty()) {
      return res.json({
        answer: "No sources have been ingested yet. Add a document, URL, or note first.",
        citations: [],
      });
    }

    const queryEmbedding = await embedText(question, "RETRIEVAL_QUERY");
    const passages = search(queryEmbedding, topK || 6);
    const result = await answerWithContext(question, passages);

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Multi-source RAG server running at http://localhost:${PORT}`);
});
