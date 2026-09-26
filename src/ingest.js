import pdfParse from "pdf-parse/lib/pdf-parse.js";
import * as cheerio from "cheerio";

/**
 * Extract plain text from a PDF file buffer.
 */
export async function extractTextFromPDF(buffer) {
  const data = await pdfParse(buffer);
  return data.text;
}

/**
 * Fetch a URL and extract readable text from the page body,
 * stripping scripts, styles, nav/footer chrome, and tags.
 */
export async function extractTextFromURL(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; multi-source-rag/1.0)" },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  $("script, style, nav, footer, header, noscript, svg, iframe").remove();

  const title = $("title").first().text().trim();
  const bodyText = $("body").text();

  const cleaned = bodyText
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

  return { title, text: cleaned };
}

/**
 * Split text into overlapping chunks for embedding.
 * Chunking by characters keeps this dependency-free and predictable;
 * chunkSize/overlap are tuned for typical prose paragraphs.
 */
export function chunkText(text, chunkSize = 1200, overlap = 150) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  // Prefer splitting on paragraph boundaries, then pack into chunks.
  const paragraphs = normalized.split(/\n{2,}/).filter((p) => p.trim());
  const chunks = [];
  let current = "";

  for (const para of paragraphs) {
    if ((current + "\n\n" + para).length > chunkSize && current) {
      chunks.push(current.trim());
      // Start next chunk with overlap from the end of the previous one
      const tail = current.slice(-overlap);
      current = tail + "\n\n" + para;
    } else {
      current = current ? current + "\n\n" + para : para;
    }

    // If a single paragraph is longer than chunkSize on its own, hard-split it.
    while (current.length > chunkSize * 1.5) {
      chunks.push(current.slice(0, chunkSize).trim());
      current = current.slice(chunkSize - overlap);
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks.filter((c) => c.length > 20); // drop tiny fragments
}
