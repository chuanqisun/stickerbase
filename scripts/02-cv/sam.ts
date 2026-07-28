/// <reference types="node" />
import { fal } from "@fal-ai/client";
import fsSync from "fs";
import fs from "fs/promises";
import path from "path";
import { from, lastValueFrom, mergeMap } from "rxjs";
import sharp from "sharp";

// Interfaces for Fal SAM 3.1 output
interface SAMImage {
  url: string;
  content_type?: string;
  file_name?: string;
  file_size?: number;
  width?: number;
  height?: number;
}

interface SAMOutput {
  image?: SAMImage;
  masks?: SAMImage[];
  metadata?: Record<string, unknown>[];
  scores?: number[];
  boxes?: number[][];
}

/**
 * Load environment variables from .env if not already set.
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
 * Infer MIME type from file extension.
 */
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".bmp":
      return "image/bmp";
    default:
      return "application/octet-stream";
  }
}

/**
 * Convert a local image file to a Data URI.
 */
async function imageToDataUri(imagePath: string): Promise<string> {
  const fileBuffer = await fs.readFile(imagePath);
  const mimeType = getMimeType(imagePath);
  const base64Data = fileBuffer.toString("base64");
  return `data:${mimeType};base64,${base64Data}`;
}

/**
 * Call Fal SAM 3.1 API to segment laptop stickers.
 */
async function segmentStickers(imageUrl: string, prompt = "sticker"): Promise<SAMOutput> {
  const result = await fal.subscribe("fal-ai/sam-3-1/image", {
    input: {
      image_url: imageUrl,
      prompt: prompt,
      return_multiple_masks: true,
      max_masks: 32,
      apply_mask: true,
      output_format: "png",
    },
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === "IN_PROGRESS") {
        update.logs
          .map((log) => log.message)
          .forEach((msg) => {
            console.log(`    [SAM 3.1] ${msg}`);
          });
      }
    },
  });

  return result.data as SAMOutput;
}

/**
 * Download mask image from URL, crop bounding box, resize to 400x400 with object-fit: contain logic,
 * and save in WEBP format.
 */
async function processAndSaveSticker(url: string, outputPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download from ${url}: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const inputBuffer = Buffer.from(arrayBuffer);

  let pipeline = sharp(inputBuffer);

  try {
    // Crop: Trim surrounding transparent / background pixels tight to sticker content
    const trimmedBuffer = await pipeline.trim().toBuffer();
    pipeline = sharp(trimmedBuffer);
  } catch {
    // If trimming fails (e.g. uniform color or empty mask), fallback to original image
  }

  // Resize to standard 400x400 square shape with object-fit: contain logic and save as webp
  await pipeline
    .resize(400, 400, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp()
    .toFile(outputPath);
}

/**
 * Process a single image task: upload, segment, and save sticker masks.
 */
async function processImage(imageName: string, index: number, total: number, imagesDir: string, stickersDir: string): Promise<void> {
  const imagePath = path.join(imagesDir, imageName);
  const targetStickersDir = path.join(stickersDir, imageName);

  // Skip if output folder already exists
  if (fsSync.existsSync(targetStickersDir)) {
    console.log(`[${index + 1}/${total}] Skipping ${imageName} (output folder already exists: ${targetStickersDir})`);
    return;
  }

  console.log(`[${index + 1}/${total}] Processing ${imageName}...`);

  try {
    // 1. Convert local image to Data URI
    console.log(`  Converting ${imageName} to Data URI...`);
    const imageUrl = await imageToDataUri(imagePath);

    // 2. Segment stickers using SAM 3.1
    console.log(`  Running SAM 3.1 segmentation for stickers...`);
    const samResult = await segmentStickers(imageUrl, "sticker");

    const masks = samResult.masks || [];
    console.log(`  Identified ${masks.length} sticker mask(s).`);

    // 3. Ensure target directory exists: stickers/<name-of-image.ext>/
    await fs.mkdir(targetStickersDir, { recursive: true });

    // 4. Crop, resize, and save each sticker mask in webp format as stickers/<name-of-image.ext>/<sticker-index>.webp
    for (let stickerIdx = 0; stickerIdx < masks.length; stickerIdx++) {
      const mask = masks[stickerIdx];
      const stickerFileName = `${stickerIdx}.webp`;
      const outputPath = path.join(targetStickersDir, stickerFileName);

      await processAndSaveSticker(mask.url, outputPath);
      console.log(`    Saved: stickers/${imageName}/${stickerFileName}`);
    }

    console.log(`  Finished ${imageName}: Saved ${masks.length} sticker(s).\n`);
  } catch (error) {
    console.error(`  [ERROR] Failed to process ${imageName}:`, error);
    console.log();
  }
}

async function main() {
  const rootDir = process.cwd();
  await loadEnv(path.join(rootDir, ".env"));

  if (!process.env.FAL_KEY) {
    console.warn("WARNING: FAL_KEY is not set in environment or .env file.");
    console.warn("Please add your FAL_KEY to .env before running this script.");
  }

  const imagesDir = path.join(rootDir, "images");
  const stickersDir = path.join(rootDir, "stickers");

  await fs.mkdir(stickersDir, { recursive: true });

  if (!fsSync.existsSync(imagesDir)) {
    console.error(`Images directory does not exist: ${imagesDir}`);
    process.exit(1);
  }

  const files = await fs.readdir(imagesDir);
  const validExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"]);
  const imageFiles = files.filter((file: string) => validExtensions.has(path.extname(file).toLowerCase())).sort();

  console.log(`Found ${imageFiles.length} image(s) in ${imagesDir}\n`);

  // Parallelism concurrency control using RxJS mergeMap
  const PARALLELISM = 1;

  const tasks = imageFiles.map((imageName, index) => ({
    imageName,
    index,
    total: imageFiles.length,
  }));

  if (tasks.length > 0) {
    await lastValueFrom(from(tasks).pipe(mergeMap((task) => processImage(task.imageName, task.index, task.total, imagesDir, stickersDir), PARALLELISM)));
  }

  console.log("Sticker segmentation process completed!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
