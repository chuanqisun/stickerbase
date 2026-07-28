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

interface StickerCoordinates {
  x: number;
  y: number;
  width: number;
  height: number;
  mask: number[][];
}

interface Point {
  x: number;
  y: number;
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
      include_boxes: true,
      include_scores: true,
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

function isContentPixel(data: Buffer, x: number, y: number, width: number, height: number, channels: number): boolean {
  if (x < 0 || x >= width || y < 0 || y >= height) return false;
  const offset = (y * width + x) * channels;
  if (channels === 4) {
    return data[offset + 3] > 10;
  }
  return data[offset] > 10 || data[offset + 1] > 10 || data[offset + 2] > 10;
}

/**
 * Extract outer contour boundary points of non-transparent mask content using Moore-Neighbor tracing.
 */
function extractMaskContour(data: Buffer, width: number, height: number, channels: number): Point[] {
  let startX = -1;
  let startY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isContentPixel(data, x, y, width, height, channels)) {
        startX = x;
        startY = y;
        break;
      }
    }
    if (startX !== -1) break;
  }

  if (startX === -1) return [];

  const dx = [-1, -1, 0, 1, 1, 1, 0, -1];
  const dy = [0, -1, -1, -1, 0, 1, 1, 1];

  const contour: Point[] = [];
  let currX = startX;
  let currY = startY;
  contour.push({ x: currX, y: currY });

  let backtrackDir = 4; // East (came from West)
  const maxSteps = width * height;
  let steps = 0;

  while (steps < maxSteps) {
    steps++;
    let foundDir = -1;

    for (let i = 0; i < 8; i++) {
      const checkDir = (backtrackDir + 1 + i) % 8;
      const nx = currX + dx[checkDir];
      const ny = currY + dy[checkDir];
      if (isContentPixel(data, nx, ny, width, height, channels)) {
        foundDir = checkDir;
        break;
      }
    }

    if (foundDir === -1) break;

    const nextX = currX + dx[foundDir];
    const nextY = currY + dy[foundDir];

    if (nextX === startX && nextY === startY && contour.length > 1) {
      break;
    }

    contour.push({ x: nextX, y: nextY });
    currX = nextX;
    currY = nextY;
    backtrackDir = (foundDir + 4) % 8;
  }

  return contour;
}

function perpendicularDistance(p: Point, lineStart: Point, lineEnd: Point): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(p.x - lineStart.x, p.y - lineStart.y);
  }
  const num = Math.abs(dy * p.x - dx * p.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x);
  const den = Math.hypot(dx, dy);
  return num / den;
}

/**
 * Ramer-Douglas-Peucker polygon simplification algorithm.
 */
function ramerDouglasPeucker(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points;

  let dmax = 0;
  let index = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end]);
    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }

  if (dmax > epsilon) {
    const recResults1 = ramerDouglasPeucker(points.slice(0, index + 1), epsilon);
    const recResults2 = ramerDouglasPeucker(points.slice(index), epsilon);
    return recResults1.slice(0, recResults1.length - 1).concat(recResults2);
  } else {
    return [points[0], points[end]];
  }
}

/**
 * Compute the bounding box and polygon contour mask of non-transparent/foreground content in mask image buffer.
 */
async function getMaskBoundingBoxAndContour(inputBuffer: Buffer): Promise<StickerCoordinates> {
  const image = sharp(inputBuffer);
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isContentPixel(data, x, y, width, height, channels)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { x: 0, y: 0, width, height, mask: [] };
  }

  const rawContour = extractMaskContour(data, width, height, channels);
  const simplified = ramerDouglasPeucker(rawContour, 1.5);
  const maskPolygon = simplified.map((p) => [p.x, p.y]);

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    mask: maskPolygon,
  };
}

/**
 * Download mask image from URL, crop bounding box, resize to 400x400 with object-fit: contain logic,
 * save in WEBP format, and return bounding box coordinates in original image.
 */
async function processAndSaveSticker(url: string, outputPath: string): Promise<StickerCoordinates> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download from ${url}: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const inputBuffer = Buffer.from(arrayBuffer);

  const coords = await getMaskBoundingBoxAndContour(inputBuffer);

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

  return coords;
}

/**
 * Process a single image task: upload, segment, save sticker masks, and save index.json.
 */
async function processImage(imageName: string, index: number, total: number, imagesDir: string, stickersDir: string): Promise<void> {
  const imagePath = path.join(imagesDir, imageName);
  const targetStickersDir = path.join(stickersDir, imageName);
  const indexPath = path.join(targetStickersDir, "index.json");

  // Skip if output folder and index.json already exist
  if (fsSync.existsSync(targetStickersDir) && fsSync.existsSync(indexPath)) {
    console.log(`[${index + 1}/${total}] Skipping ${imageName} (output folder and index.json already exist: ${targetStickersDir})`);
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

    const indexMap: Record<string, StickerCoordinates> = {};

    // 4. Crop, resize, and save each sticker mask in webp format as stickers/<name-of-image.ext>/<sticker-index>.webp
    for (let stickerIdx = 0; stickerIdx < masks.length; stickerIdx++) {
      const mask = masks[stickerIdx];
      const stickerFileName = `${stickerIdx}.webp`;
      const outputPath = path.join(targetStickersDir, stickerFileName);

      const coords = await processAndSaveSticker(mask.url, outputPath);
      indexMap[stickerFileName] = coords;
      console.log(`    Saved: stickers/${imageName}/${stickerFileName}`);
    }

    // 5. Write index.json containing coordinates map for each sticker
    await fs.writeFile(indexPath, JSON.stringify(indexMap, null, 2), "utf-8");
    console.log(`    Saved index.json: stickers/${imageName}/index.json`);

    console.log(`  Finished ${imageName}: Saved ${masks.length} sticker(s) and index.json.\n`);
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
