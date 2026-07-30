import { GoogleGenAI } from "@google/genai";

const embeddingCache = new Map<string, number[]>();

export async function embedQueryText(apiKey: string, text: string): Promise<number[]> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Query text is empty");
  }

  const cacheKey = `${apiKey.slice(-6)}:${trimmed}`;
  if (embeddingCache.has(cacheKey)) {
    return embeddingCache.get(cacheKey)!;
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.embedContent({
    model: "gemini-embedding-2",
    contents: trimmed,
    config: {
      outputDimensionality: 1536,
      taskType: "RETRIEVAL_QUERY",
    },
  });

  const embeddingValues = response.embeddings?.[0]?.values;

  if (!embeddingValues || embeddingValues.length === 0) {
    throw new Error("Gemini API returned an empty embedding result.");
  }

  embeddingCache.set(cacheKey, embeddingValues);
  return embeddingValues;
}
