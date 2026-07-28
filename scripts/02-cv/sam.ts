/// <reference types="node" />
import { fal } from "@fal-ai/client";
import fsSync from "fs";
import fs from "fs/promises";
import path from "path";
import { from, lastValueFrom, mergeMap } from "rxjs";

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
 * Upload a local image file to fal storage.
 */
async function uploadLocalImage(imagePath: string): Promise<string> {
  const fileBuffer = await fs.readFile(imagePath);
  const mimeType = getMimeType(imagePath);
  const fileName = path.basename(imagePath);

  const fileObject = typeof File !== "undefined" ? new File([fileBuffer], fileName, { type: mimeType }) : new Blob([fileBuffer], { type: mimeType });

  return await fal.storage.upload(fileObject);
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
 * Download a file from URL and save to local path.
 */
async function downloadAndSave(url: string, outputPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download from ${url}: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  await fs.writeFile(outputPath, Buffer.from(arrayBuffer));
}

/**
 * Process a single image task: upload, segment, and save sticker masks.
 */
async function processImage(imageName: string, index: number, total: number, imagesDir: string, stickersDir: string): Promise<void> {
  const imagePath = path.join(imagesDir, imageName);
  const targetStickersDir = path.join(stickersDir, imageName);

  // Skip if already processed and contains files
  if (fsSync.existsSync(targetStickersDir)) {
    const existingFiles = await fs.readdir(targetStickersDir);
    if (existingFiles.length > 0) {
      console.log(`[${index + 1}/${total}] Skipping ${imageName} (already processed: ${existingFiles.length} sticker(s) found)`);
      return;
    }
  }

  console.log(`[${index + 1}/${total}] Processing ${imageName}...`);

  try {
    // 1. Upload local image to fal storage
    console.log(`  Uploading ${imageName} to fal storage...`);
    const imageUrl = await uploadLocalImage(imagePath);

    // 2. Segment stickers using SAM 3.1
    console.log(`  Running SAM 3.1 segmentation for stickers...`);
    const samResult = await segmentStickers(imageUrl, "sticker");

    const masks = samResult.masks || [];
    console.log(`  Identified ${masks.length} sticker mask(s).`);

    // 3. Ensure target directory exists: stickers/<name-of-image.ext>/
    await fs.mkdir(targetStickersDir, { recursive: true });

    // 4. Download and save each sticker mask as stickers/<name-of-image.ext>/<sticker-index.ext>
    for (let stickerIdx = 0; stickerIdx < masks.length; stickerIdx++) {
      const mask = masks[stickerIdx];

      // Determine file extension (default png)
      let ext = "png";
      if (mask.content_type?.includes("jpeg") || mask.content_type?.includes("jpg")) {
        ext = "jpg";
      } else if (mask.content_type?.includes("webp")) {
        ext = "webp";
      } else if (mask.file_name) {
        const parsedExt = path.extname(mask.file_name).slice(1);
        if (parsedExt) ext = parsedExt;
      }

      const stickerFileName = `${stickerIdx}.${ext}`;
      const outputPath = path.join(targetStickersDir, stickerFileName);

      await downloadAndSave(mask.url, outputPath);
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
