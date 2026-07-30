import { GoogleGenAI } from "@google/genai";
import fsSync from "fs";
import fs from "fs/promises";
import path from "path";
import { from, lastValueFrom, mergeMap } from "rxjs";
import sharp from "sharp";

/** Max images to embed in a single Gemini API call */
const BATCH_SIZE = 6;

/** Number of parallel folder processing pipelines */
const CONCURRENCY = 10;

/** Output embedding dimension */
const OUTPUT_DIMENSIONALITY = 1536;

/** Target model name */
const MODEL_NAME = "gemini-embedding-2";

/** Supported image extensions */
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp"]);

/**
 * Load environment variables from .env if not already set in process.env.
 */
async function loadEnv(envPath: string): Promise<void> {
  try {
    const content = await fs.readFile(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        if (key && !process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  } catch {
    // Ignore if .env file is missing
  }
}

/**
 * Embed a batch of image parts with exponential backoff retries.
 */
async function embedBatchWithRetry(
  ai: GoogleGenAI,
  batchParts: { parts: { inlineData: { data: string; mimeType: string } }[] }[],
  maxRetries = 5,
): Promise<number[][]> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const response = await ai.models.embedContent({
        model: MODEL_NAME,
        contents: batchParts,
        config: {
          outputDimensionality: OUTPUT_DIMENSIONALITY,
        },
      });

      if (!response.embeddings || response.embeddings.length === 0) {
        throw new Error("API returned no embeddings.");
      }

      return response.embeddings.map((emb, idx) => {
        if (!emb.values) {
          throw new Error(`Embedding at index ${idx} is missing values.`);
        }
        return emb.values;
      });
    } catch (err: unknown) {
      attempt++;
      if (attempt >= maxRetries) {
        throw err;
      }
      const errorMessage = err instanceof Error ? err.message : String(err);
      const backoffMs = Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 500);
      console.warn(`  ⚠️ [Retry ${attempt}/${maxRetries}] Embed API error: ${errorMessage}. Retrying in ${Math.round(backoffMs)}ms...`);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  throw new Error("Failed to embed batch after maximum retries.");
}

async function main(): Promise<void> {
  const rootDir = process.cwd();
  await loadEnv(path.join(rootDir, ".env"));

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY environment variable is missing.");
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });
  const stickersDir = path.join(rootDir, "stickers");

  if (!fsSync.existsSync(stickersDir)) {
    console.error(`Stickers directory does not exist at: ${stickersDir}`);
    process.exit(1);
  }

  const entries = await fs.readdir(stickersDir, { withFileTypes: true });
  const allFolders = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

  // Identify folders that need processing vs skipped
  const foldersToProcess: string[] = [];
  let skippedFoldersCount = 0;

  for (const folderName of allFolders) {
    const embeddingsPath = path.join(stickersDir, folderName, "embeddings.json");
    if (fsSync.existsSync(embeddingsPath)) {
      skippedFoldersCount++;
    } else {
      foldersToProcess.push(folderName);
    }
  }

  console.log(`========================================`);
  console.log(`Gemini Image Embedding Script`);
  console.log(`Model: ${MODEL_NAME} (${OUTPUT_DIMENSIONALITY} dimensions)`);
  console.log(`Total folders found: ${allFolders.length}`);
  console.log(`Folders already processed (skipped): ${skippedFoldersCount}`);
  console.log(`Folders to process: ${foldersToProcess.length}`);
  console.log(`Concurrency: ${CONCURRENCY} parallel pipelines, Batch size: ${BATCH_SIZE}`);
  console.log(`========================================\n`);

  if (foldersToProcess.length === 0) {
    console.log("All folders already contain embeddings.json. Nothing to do!");
    return;
  }

  let completedFoldersCount = 0;
  let totalImagesProcessed = 0;
  const startTime = Date.now();

  await lastValueFrom(
    from(foldersToProcess).pipe(
      mergeMap(async (folderName) => {
        const folderPath = path.join(stickersDir, folderName);
        const folderFiles = await fs.readdir(folderPath);

        // Filter for image files only
        const imageFiles = folderFiles
          .filter((file) => IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        const folderEmbeddings: Record<string, number[]> = {};

        if (imageFiles.length > 0) {
          // Chunk images into batches of up to BATCH_SIZE (6)
          for (let i = 0; i < imageFiles.length; i += BATCH_SIZE) {
            const batchFiles = imageFiles.slice(i, i + BATCH_SIZE);

            // Convert images to JPEG in memory and prepare Base64 payloads
            const batchPayloads = await Promise.all(
              batchFiles.map(async (fileName) => {
                const filePath = path.join(folderPath, fileName);
                const fileBuffer = await fs.readFile(filePath);
                const jpegBuffer = await sharp(fileBuffer).toFormat("jpeg").toBuffer();
                return {
                  fileName,
                  base64: jpegBuffer.toString("base64"),
                };
              }),
            );

            const batchContents = batchPayloads.map((item) => ({
              parts: [
                {
                  inlineData: {
                    data: item.base64,
                    mimeType: "image/jpeg",
                  },
                },
              ],
            }));

            const embeddings = await embedBatchWithRetry(ai, batchContents);

            for (let j = 0; j < batchPayloads.length; j++) {
              folderEmbeddings[batchPayloads[j].fileName] = embeddings[j];
            }
          }
        }

        // Save embeddings.json
        const outputPath = path.join(folderPath, "embeddings.json");
        await fs.writeFile(outputPath, JSON.stringify(folderEmbeddings, null, 2), "utf-8");

        completedFoldersCount++;
        totalImagesProcessed += imageFiles.length;

        console.log(`[${completedFoldersCount}/${foldersToProcess.length}] Embedded ${imageFiles.length} image(s) in folder: ${folderName}`);
      }, CONCURRENCY),
    ),
  );

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n========================================`);
  console.log(`Embedding Process Complete!`);
  console.log(`Total folders embedded: ${completedFoldersCount}`);
  console.log(`Total images embedded: ${totalImagesProcessed}`);
  console.log(`Time taken: ${durationSec}s`);
  console.log(`========================================`);
}

main().catch((err) => {
  console.error("Fatal error during embedding process:", err);
  process.exit(1);
});
