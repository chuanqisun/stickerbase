import { DB } from "eigen-db";
import fsSync from "fs";
import fs from "fs/promises";
import path from "path";

/** Output embedding dimensionality (1536 for Gemini embedding-2) */
const DIMENSIONS = 1536;

/**
 * Convert a ReadableStream<Uint8Array> into a Node.js Buffer.
 */
async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
    }
  }
  return Buffer.concat(chunks);
}

async function main(): Promise<void> {
  const rootDir = process.cwd();
  const stickersDir = path.join(rootDir, "stickers");
  const dataDir = path.join(rootDir, "data");
  const outputPath = path.join(dataDir, "embeddings.bin");

  if (!fsSync.existsSync(dataDir)) {
    await fs.mkdir(dataDir, { recursive: true });
  }

  if (!fsSync.existsSync(stickersDir)) {
    console.error(`Stickers directory does not exist at: ${stickersDir}`);
    process.exit(1);
  }

  const entries = await fs.readdir(stickersDir, { withFileTypes: true });
  const folders = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

  console.log(`========================================`);
  console.log(`EigenDB Indexing Script`);
  console.log(`Target Output: ${outputPath}`);
  console.log(`Total sticker folders found: ${folders.length}`);
  console.log(`Vector dimensions: ${DIMENSIONS}`);
  console.log(`========================================\n`);

  const db = await DB.open({
    dimensions: DIMENSIONS,
  });

  let totalFoldersProcessed = 0;
  let totalVectorsIndexed = 0;
  let skippedFoldersCount = 0;

  for (const folderName of folders) {
    const embeddingsPath = path.join(stickersDir, folderName, "embeddings.json");

    if (!fsSync.existsSync(embeddingsPath)) {
      skippedFoldersCount++;
      continue;
    }

    try {
      const content = await fs.readFile(embeddingsPath, "utf-8");
      const embeddingsMap: Record<string, number[]> = JSON.parse(content);

      const entriesToSet: [string, number[]][] = [];
      for (const [imageFileName, vector] of Object.entries(embeddingsMap)) {
        if (Array.isArray(vector) && vector.length === DIMENSIONS) {
          const key = `${folderName}/${imageFileName}`;
          entriesToSet.push([key, vector]);
        } else {
          console.warn(`⚠️ Skipping invalid vector in ${folderName}/${imageFileName}: expected ${DIMENSIONS} dimensions, got ${vector?.length}`);
        }
      }

      if (entriesToSet.length > 0) {
        db.setMany(entriesToSet);
        totalVectorsIndexed += entriesToSet.length;
        totalFoldersProcessed++;
      }
    } catch (err) {
      console.error(`Error reading ${embeddingsPath}:`, err);
    }
  }

  console.log(`Indexing summary:`);
  console.log(`- Total folders processed: ${totalFoldersProcessed}`);
  console.log(`- Folders skipped (missing embeddings.json): ${skippedFoldersCount}`);
  console.log(`- Total vectors indexed in DB: ${db.size}`);

  if (db.size === 0) {
    console.error("No vectors were indexed. Export aborted.");
    process.exit(1);
  }

  console.log(`\nExporting binary database index...`);
  const stream = await db.export();
  const buffer = await streamToBuffer(stream);

  await fs.writeFile(outputPath, buffer);

  console.log(`========================================`);
  console.log(`Export Complete!`);
  console.log(`Saved index to: ${outputPath}`);
  console.log(`File size: ${(buffer.byteLength / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`========================================`);
}

main().catch((err) => {
  console.error("Fatal error during indexing process:", err);
  process.exit(1);
});
