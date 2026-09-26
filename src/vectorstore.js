import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "vectorstore.json");

let state = {
  sources: [],   // { id, name, type, addedAt, chunkCount }
  vectors: [],   // { id, sourceId, text, embedding }
};

export async function loadStore() {
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
  if (existsSync(STORE_PATH)) {
    const raw = await readFile(STORE_PATH, "utf-8");
    try {
      state = JSON.parse(raw);
    } catch {
      state = { sources: [], vectors: [] };
    }
  }
  return state;
}

async function persist() {
  await writeFile(STORE_PATH, JSON.stringify(state), "utf-8");
}

export function listSources() {
  return state.sources;
}

export async function addSource({ name, type, origin }) {
  const source = {
    id: randomUUID(),
    name,
    type, // "pdf" | "text" | "url"
    origin: origin || null,
    addedAt: new Date().toISOString(),
    chunkCount: 0,
  };
  state.sources.push(source);
  await persist();
  return source;
}

export async function addChunks(sourceId, chunkTexts, embeddings) {
  const source = state.sources.find((s) => s.id === sourceId);
  if (!source) throw new Error("Unknown source id");

  for (let i = 0; i < chunkTexts.length; i++) {
    state.vectors.push({
      id: randomUUID(),
      sourceId,
      text: chunkTexts[i],
      embedding: embeddings[i],
    });
  }
  source.chunkCount += chunkTexts.length;
  await persist();
}

export async function removeSource(sourceId) {
  state.sources = state.sources.filter((s) => s.id !== sourceId);
  state.vectors = state.vectors.filter((v) => v.sourceId !== sourceId);
  await persist();
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Return the topK chunks most similar to queryEmbedding, each annotated
 * with its source name so answers can be cited.
 */
export function search(queryEmbedding, topK = 6) {
  const scored = state.vectors.map((v) => ({
    ...v,
    score: cosineSimilarity(queryEmbedding, v.embedding),
  }));
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, topK);

  return top.map((v) => {
    const source = state.sources.find((s) => s.id === v.sourceId);
    return {
      text: v.text,
      score: v.score,
      sourceId: v.sourceId,
      sourceName: source ? source.name : "Unknown source",
    };
  });
}

export function isEmpty() {
  return state.vectors.length === 0;
}
