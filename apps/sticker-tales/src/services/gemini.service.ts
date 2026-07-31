import { GoogleGenAI } from "@google/genai";

const embeddingCache = new Map<string, number[]>();

export async function embedStickerImage(apiKey: string, base64DataUrl: string): Promise<number[]> {
  const base64Data = base64DataUrl.includes(",") ? base64DataUrl.split(",")[1] : base64DataUrl;
  const mimeTypeMatch = base64DataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,/);
  const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : "image/png";

  // Cache lookup
  const cacheKey = `${apiKey.slice(-6)}:${base64Data.slice(0, 100)}`;
  if (embeddingCache.has(cacheKey)) {
    return embeddingCache.get(cacheKey)!;
  }

  const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
  const response = await ai.models.embedContent({
    model: "gemini-embedding-2",
    contents: [
      {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType,
            },
          },
        ],
      },
    ],
    config: {
      outputDimensionality: 1536,
    },
  });

  const values = response.embeddings?.[0]?.values;
  if (!values || values.length === 0) {
    throw new Error("Gemini Embedding API returned empty values.");
  }

  embeddingCache.set(cacheKey, values);
  return values;
}
