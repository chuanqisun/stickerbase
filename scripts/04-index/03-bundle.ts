import { ZipArchive } from "archiver";
import { createWriteStream, existsSync } from "fs";
import fs from "fs/promises";
import path from "path";

async function createZip(sourceDir: string, outputPath: string): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);
    archive.on("warning", (warning) => {
      if (warning.code === "ENOENT") {
        console.warn(warning.message);
        return;
      }

      reject(warning);
    });

    archive.pipe(output);
    archive.directory(sourceDir, "public");
    void archive.finalize();
  });

  const outputStats = await fs.stat(outputPath);
  return outputStats.size;
}

async function main(): Promise<void> {
  const rootDir = process.cwd();
  const sourceDir = path.join(rootDir, "apps", "stickers-web", "public");
  const outputDir = path.join(rootDir, "data");
  const outputPath = path.join(outputDir, "public.zip");

  if (!existsSync(sourceDir)) {
    console.error(`Public directory does not exist: ${sourceDir}`);
    process.exit(1);
  }

  await fs.mkdir(outputDir, { recursive: true });

  console.log(`Creating archive from: ${sourceDir}`);
  const outputSize = await createZip(sourceDir, outputPath);

  console.log(`Archive saved to: ${outputPath}`);
  console.log(`Archive size: ${(outputSize / (1024 * 1024)).toFixed(2)} MB`);
}

main().catch((err) => {
  console.error("Fatal error while creating public.zip:", err);
  process.exit(1);
});
