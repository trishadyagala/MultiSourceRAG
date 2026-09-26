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

function buildPrompt(question, passages) {
  const context = passages
    .map((p, i) => `[${i + 1}] Source: ${p.sourceName}\n${p.text}`)
    .join("\n\n---\n\n");

  return [
    "You are a careful research assistant. Answer the question using ONLY the",
    "numbered source passages below. If the passages don't contain the answer,",
    "say so plainly instead of guessing. When you use a passage, cite it inline",
    "with its bracketed number, e.g. [1] or [2][3].",
    "",
    "SOURCE PASSAGES:",
    context,
    "",
    `QUESTION: ${question}`,
  ].join("\n");
}

/**
 * Ask Gemini to answer a question grounded in the retrieved passages.
 * Returns { answer, citations } where citations map [n] back to the
 * source name/id so the frontend can render them.
 */
export async function answerWithContext(question, passages) {
  const apiKey = requireApiKey();
  const model = process.env.GEMINI_GENERATION_MODEL || "gemini-flash-latest";

  if (passages.length === 0) {
    return {
      answer:
        "No sources have been ingested yet, so there's nothing to search. Add a document or URL first.",
      citations: [],
    };
  }

  const prompt = buildPrompt(question, passages);

  const res = await fetch(
    `${GEMINI_BASE}/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 },
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini generation request failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  const answer =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ||
    "The model returned no text.";

  const citations = passages.map((p, i) => ({
    marker: i + 1,
    sourceName: p.sourceName,
    sourceId: p.sourceId,
    snippet: p.text.slice(0, 220) + (p.text.length > 220 ? "…" : ""),
    score: Math.round(p.score * 1000) / 1000,
  }));

  return { answer, citations };
}
