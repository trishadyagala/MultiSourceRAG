const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

function requireApiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "your_gemini_api_key_here") {
    const err = new Error(
      "GEMINI_API_KEY is not set. Add it to your .env file (see .env.example)."
    );
    err.status = 401;
    throw err;
  }
  return key;
}

/**
 * Embed a single piece of text with the Gemini embedding model.
 * taskType steers the embedding space: use "RETRIEVAL_DOCUMENT" when
 * indexing source chunks, and "RETRIEVAL_QUERY" when embedding a user
 * question, which measurably improves retrieval quality for Gemini's
 * embedding models.
 */
export async function embedText(text, taskType = "RETRIEVAL_DOCUMENT") {
  const apiKey = requireApiKey();
  const model = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";

  const res = await fetch(
    `${GEMINI_BASE}/models/${model}:embedContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        taskType,
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini embedding request failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return data.embedding.values;
}

/**
 * Embed many chunks, sequentially with light concurrency, so a large
 * document doesn't fire hundreds of simultaneous requests at once.
 */
export async function embedBatch(texts, taskType = "RETRIEVAL_DOCUMENT", concurrency = 4) {
  const results = new Array(texts.length);
  let next = 0;

  async function worker() {
    while (next < texts.length) {
      const i = next++;
      results[i] = await embedText(texts[i], taskType);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, texts.length) }, worker));
  return results;
}
