import fsSync from "fs";
import fs from "fs/promises";
import path from "path";
import { from, lastValueFrom, mergeMap } from "rxjs";
import sharp from "sharp";

interface StickerInfo {
  x: number;
  y: number;
  width: number;
  height: number;
  mask?: number[][];
}

type IndexJson = Record<string, StickerInfo>;

const CONCURRENCY = 16;

async function processImage(
  imageName: string,
  imagesDir: string,
  stickersDir: string,
  outputImagesDir: string,
  totalImages: number,
  stats: { convertedCount: number; metadataCount: number },
): Promise<void> {
  const inputImagePath = path.join(imagesDir, imageName);
  const outputWebpPath = path.join(outputImagesDir, `${imageName}.webp`);
  const outputJsonPath = path.join(outputImagesDir, `${imageName}.json`);

  // 1. Convert image to WebP (without changing dimensions) with 75% quality compression
  try {
    await sharp(inputImagePath).webp({ quality: 75 }).toFile(outputWebpPath);
    stats.convertedCount++;
  } catch (err) {
    console.error(`Failed to convert image ${imageName} to webp:`, err);
    return;
  }

  // 2. Look for bounding box metadata in stickers/<filename.ext>/index.json
  const stickerFolder = path.join(stickersDir, imageName);
  const indexPath = path.join(stickerFolder, "index.json");

  const boundingBoxesMap: Record<string, [number, number, number, number]> = {};

  if (fsSync.existsSync(indexPath)) {
    try {
      const indexContent = await fs.readFile(indexPath, "utf-8");
      const indexData: IndexJson = JSON.parse(indexContent);

      for (const [stickerFileName, info] of Object.entries(indexData)) {
        if (typeof info.x === "number" && typeof info.y === "number" && typeof info.width === "number" && typeof info.height === "number") {
          boundingBoxesMap[stickerFileName] = [info.x, info.y, info.width, info.height];
        }
      }
    } catch (err) {
      console.warn(`Warning: Failed to parse ${indexPath}:`, err);
    }
  } else {
    console.warn(`Warning: Missing index.json for sticker folder: ${imageName}`);
  }

  // 3. Write metadata file
  await fs.writeFile(outputJsonPath, JSON.stringify(boundingBoxesMap), "utf-8");
  stats.metadataCount++;

  console.log(
    `[${stats.convertedCount}/${totalImages}] Processed ${imageName} -> ${imageName}.webp & ${imageName}.json (${Object.keys(boundingBoxesMap).length} sticker bounding box(es))`,
  );
}

async function main(): Promise<void> {
  const rootDir = process.cwd();
  const imagesDir = path.join(rootDir, "images");
  const stickersDir = path.join(rootDir, "stickers");
  const dataDir = path.join(rootDir, "data");
  const outputImagesDir = path.join(dataDir, "images");

  if (!fsSync.existsSync(imagesDir)) {
    console.error(`Images directory does not exist: ${imagesDir}`);
    process.exit(1);
  }

  // Ensure output directory exists and is clean
  if (fsSync.existsSync(outputImagesDir)) {
    console.log(`Cleaning existing output directory: ${outputImagesDir}`);
    await fs.rm(outputImagesDir, { recursive: true, force: true });
  }
  await fs.mkdir(outputImagesDir, { recursive: true });

  const entries = await fs.readdir(imagesDir, { withFileTypes: true });
  const imageFiles = entries.filter((entry) => entry.isFile() && !entry.name.startsWith(".")).map((entry) => entry.name);

  console.log(`========================================`);
  console.log(`Build Assets Script`);
  console.log(`Source images directory: ${imagesDir}`);
  console.log(`Output directory: ${outputImagesDir}`);
  console.log(`Found ${imageFiles.length} image(s) to process.`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log(`========================================\n`);

  const stats = { convertedCount: 0, metadataCount: 0 };

  if (imageFiles.length > 0) {
    await lastValueFrom(
      from(imageFiles).pipe(mergeMap((imageName) => processImage(imageName, imagesDir, stickersDir, outputImagesDir, imageFiles.length, stats), CONCURRENCY)),
    );
  }

  console.log(`\n========================================`);
  console.log(`Build Assets Complete!`);
  console.log(`Images converted to WebP: ${stats.convertedCount}`);
  console.log(`Metadata JSON files generated: ${stats.metadataCount}`);
  console.log(`========================================`);
}

main().catch((err) => {
  console.error("Fatal error during build-assets process:", err);
  process.exit(1);
});
