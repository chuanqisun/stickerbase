import fsSync from "fs";
import fs from "fs/promises";
import path from "path";

async function main(): Promise<void> {
  const rootDir = process.cwd();
  const stickersDir = path.join(rootDir, "stickers");

  if (!fsSync.existsSync(stickersDir)) {
    console.error(`Stickers directory does not exist at: ${stickersDir}`);
    process.exit(1);
  }

  const entries = await fs.readdir(stickersDir, { withFileTypes: true });
  const folders = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

  console.log(`========================================`);
  console.log(`Condensing embeddings.json files...`);
  console.log(`Total sticker folders found: ${folders.length}`);
  console.log(`========================================\n`);

  let condensedCount = 0;
  let skippedCount = 0;

  for (const folderName of folders) {
    const embeddingsPath = path.join(stickersDir, folderName, "embeddings.json");

    if (!fsSync.existsSync(embeddingsPath)) {
      skippedCount++;
      continue;
    }

    try {
      const content = await fs.readFile(embeddingsPath, "utf-8");
      const parsed = JSON.parse(content);
      const minified = JSON.stringify(parsed);

      // Only rewrite if content actually changed (saving disk write cycles)
      if (content !== minified) {
        await fs.writeFile(embeddingsPath, minified, "utf-8");
        condensedCount++;
      }
    } catch (err) {
      console.error(`Failed to process ${embeddingsPath}:`, err);
    }
  }

  console.log(`========================================`);
  console.log(`Condense Complete!`);
  console.log(`Files minified: ${condensedCount}`);
  console.log(`Folders skipped (missing embeddings.json): ${skippedCount}`);
  console.log(`========================================`);
}

main().catch((err) => {
  console.error("Fatal error during condense process:", err);
  process.exit(1);
});
