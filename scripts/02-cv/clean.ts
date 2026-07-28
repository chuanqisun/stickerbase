/// <reference types="node" />
import fsSync from "fs";
import fs from "fs/promises";
import path from "path";

async function main() {
  const rootDir = process.cwd();
  const stickersDir = path.join(rootDir, "stickers");

  if (!fsSync.existsSync(stickersDir)) {
    console.log(`Stickers directory does not exist: ${stickersDir}`);
    return;
  }

  const entries = await fs.readdir(stickersDir, { withFileTypes: true });
  const folders = entries.filter((entry) => entry.isDirectory());

  console.log(`Checking ${folders.length} folder(s) in ${stickersDir}...\n`);

  let removedCount = 0;

  for (const folder of folders) {
    const folderPath = path.join(stickersDir, folder.name);
    const indexPath = path.join(folderPath, "index.json");

    if (!fsSync.existsSync(indexPath)) {
      console.log(`Removing incomplete folder (missing index.json): ${folder.name}`);
      await fs.rm(folderPath, { recursive: true, force: true });
      removedCount++;
    }
  }

  console.log(`\nCleanup complete: Removed ${removedCount} incomplete folder(s).`);
}

main().catch((err) => {
  console.error("Fatal error during cleanup:", err);
  process.exit(1);
});
