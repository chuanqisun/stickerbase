import { fal } from "@fal-ai/client";
import type { Point, StickerMask } from "../types";

export interface SamProgressCallback {
  (message: string): void;
}

interface SAMImage {
  url: string;
  width?: number;
  height?: number;
}

interface SAMOutput {
  masks?: SAMImage[];
  scores?: number[];
  boxes?: number[][];
}

/**
 * Helper to convert Blob / File to Data URL
 */
export function fileToDataUrl(file: Blob | File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Helper to load HTMLImageElement from URL or Data URL
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(new Error("Failed to load image: " + err));
    img.src = src;
  });
}

const MOORE_NEIGHBORS: Point[] = [
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
];

function traceContour(mask: Uint8Array, width: number, height: number, start: Point): Point[] {
  const isForeground = (x: number, y: number) => x >= 0 && x < width && y >= 0 && y < height && mask[y * width + x] === 1;
  const contour: Point[] = [];
  let current = start;
  let backtrack = { x: start.x - 1, y: start.y };
  const initialState = `${current.x},${current.y}:${backtrack.x},${backtrack.y}`;
  const visitedStates = new Set<string>();

  while (contour.length < width * height) {
    const state = `${current.x},${current.y}:${backtrack.x},${backtrack.y}`;
    if (visitedStates.has(state)) break;
    visitedStates.add(state);
    contour.push(current);

    const relativeX = backtrack.x - current.x;
    const relativeY = backtrack.y - current.y;
    const backtrackIndex = MOORE_NEIGHBORS.findIndex((neighbor) => neighbor.x === relativeX && neighbor.y === relativeY);
    const scanStart = backtrackIndex >= 0 ? backtrackIndex : 6;
    let next: Point | undefined;
    let nextBacktrack = backtrack;

    for (let offset = 1; offset <= MOORE_NEIGHBORS.length; offset++) {
      const neighborIndex = (scanStart + offset) % MOORE_NEIGHBORS.length;
      const neighbor = MOORE_NEIGHBORS[neighborIndex];
      const candidate = { x: current.x + neighbor.x, y: current.y + neighbor.y };
      if (isForeground(candidate.x, candidate.y)) {
        const precedingNeighbor = MOORE_NEIGHBORS[(neighborIndex + MOORE_NEIGHBORS.length - 1) % MOORE_NEIGHBORS.length];
        nextBacktrack = { x: current.x + precedingNeighbor.x, y: current.y + precedingNeighbor.y };
        next = candidate;
        break;
      }
    }

    if (!next) break;
    current = next;
    backtrack = nextBacktrack;

    if (`${current.x},${current.y}:${backtrack.x},${backtrack.y}` === initialState) break;
  }

  return contour;
}

function perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
  const deltaX = lineEnd.x - lineStart.x;
  const deltaY = lineEnd.y - lineStart.y;
  if (deltaX === 0 && deltaY === 0) return Math.hypot(point.x - lineStart.x, point.y - lineStart.y);

  return Math.abs(deltaY * point.x - deltaX * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x) / Math.hypot(deltaX, deltaY);
}

function simplifyOpenPoints(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points;

  let maxDistance = 0;
  let maxIndex = 0;
  for (let index = 1; index < points.length - 1; index++) {
    const distance = perpendicularDistance(points[index], points[0], points[points.length - 1]);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = index;
    }
  }

  if (maxDistance <= epsilon) return [points[0], points[points.length - 1]];

  const firstHalf = simplifyOpenPoints(points.slice(0, maxIndex + 1), epsilon);
  const secondHalf = simplifyOpenPoints(points.slice(maxIndex), epsilon);
  return [...firstHalf.slice(0, -1), ...secondHalf];
}

function simplifyClosedPolygon(points: Point[], epsilon: number): Point[] {
  if (points.length <= 4) return points;

  let splitIndex = 1;
  let farthestDistance = 0;
  for (let index = 1; index < points.length; index++) {
    const distance = Math.hypot(points[index].x - points[0].x, points[index].y - points[0].y);
    if (distance > farthestDistance) {
      farthestDistance = distance;
      splitIndex = index;
    }
  }

  const firstHalf = simplifyOpenPoints(points.slice(0, splitIndex + 1), epsilon);
  const secondHalf = simplifyOpenPoints([...points.slice(splitIndex), points[0]], epsilon);
  return [...firstHalf.slice(0, -1), ...secondHalf.slice(0, -1)];
}

function calculateCentroid(points: Point[], fallback: Point): Point {
  let signedAreaTwice = 0;
  let centroidX = 0;
  let centroidY = 0;

  for (let index = 0; index < points.length; index++) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const crossProduct = current.x * next.y - next.x * current.y;
    signedAreaTwice += crossProduct;
    centroidX += (current.x + next.x) * crossProduct;
    centroidY += (current.y + next.y) * crossProduct;
  }

  if (Math.abs(signedAreaTwice) < Number.EPSILON) return fallback;

  return {
    x: centroidX / (3 * signedAreaTwice),
    y: centroidY / (3 * signedAreaTwice),
  };
}

function createSvgPath(points: Point[]): string {
  if (points.length === 0) return "";
  return `M ${points.map((point) => `${point.x} ${point.y}`).join(" L ")} Z`;
}

/**
 * Traces and simplifies the outer contour of non-transparent mask pixels.
 */
function extractContourPoints(ctx: CanvasRenderingContext2D, width: number, height: number): { points: Point[]; pixelCount: number } {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const mask = new Uint8Array(width * height);
  let hasTransparency = false;
  let start: Point | undefined;
  let pixelCount = 0;

  for (let index = 3; index < data.length; index += 4) {
    if (data[index] <= 20) {
      hasTransparency = true;
      break;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIndex = (y * width + x) * 4;
      const alpha = data[pixelIndex + 3];
      const luminance = 0.2126 * data[pixelIndex] + 0.7152 * data[pixelIndex + 1] + 0.0722 * data[pixelIndex + 2];
      const isForeground = hasTransparency ? alpha > 20 : alpha > 20 && luminance > 20;
      if (isForeground) {
        mask[y * width + x] = 1;
        start ??= { x, y };
        pixelCount++;
      }
    }
  }

  if (!start) return { points: [], pixelCount: 0 };
  return { points: simplifyClosedPolygon(traceContour(mask, width, height, start), 1.75), pixelCount };
}

/**
 * Process SAM 3.1 segmentation result and extract sticker crops and bounding boxes
 */
export async function runSamSegmentation(
  falApiKey: string,
  imageDataUrl: string,
  onProgress?: SamProgressCallback,
): Promise<{ stickers: StickerMask[]; width: number; height: number }> {
  fal.config({
    credentials: falApiKey.trim(),
  });

  onProgress?.("Sending image to SAM 3.1...");

  const result = await fal.subscribe("fal-ai/sam-3-1/image", {
    input: {
      image_url: imageDataUrl,
      prompt: "sticker",
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
        update.logs.forEach((log) => {
          onProgress?.(log.message);
        });
      }
    },
  });

  const samData = result.data as SAMOutput;
  if (!samData.masks || samData.masks.length === 0) {
    throw new Error("No sticker masks found by SAM 3.1.");
  }

  onProgress?.(`Processing ${samData.masks.length} segmented masks...`);

  const originalImg = await loadImage(imageDataUrl);
  const origWidth = originalImg.naturalWidth || originalImg.width;
  const origHeight = originalImg.naturalHeight || originalImg.height;

  const stickers: StickerMask[] = [];

  for (let i = 0; i < samData.masks.length; i++) {
    const maskInfo = samData.masks[i];
    if (!maskInfo.url) continue;

    try {
      const maskImg = await loadImage(maskInfo.url);
      const canvas = document.createElement("canvas");
      canvas.width = origWidth;
      canvas.height = origHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;

      ctx.drawImage(maskImg, 0, 0, origWidth, origHeight);

      const contour = extractContourPoints(ctx, origWidth, origHeight);
      if (contour.pixelCount < 50 || contour.points.length < 3) continue;

      const minX = Math.min(...contour.points.map((point) => point.x));
      const maxX = Math.max(...contour.points.map((point) => point.x));
      const minY = Math.min(...contour.points.map((point) => point.y));
      const maxY = Math.max(...contour.points.map((point) => point.y));

      const boxWidth = maxX - minX + 1;
      const boxHeight = maxY - minY + 1;

      // Skip if covers > 85% of total image (likely full laptop frame instead of sticker)
      if (boxWidth * boxHeight > origWidth * origHeight * 0.85) continue;
      if (boxWidth < 15 || boxHeight < 15) continue;

      // Crop the sticker mask to a smaller canvas
      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = boxWidth;
      cropCanvas.height = boxHeight;
      const cropCtx = cropCanvas.getContext("2d");
      if (!cropCtx) continue;

      cropCtx.drawImage(canvas, minX, minY, boxWidth, boxHeight, 0, 0, boxWidth, boxHeight);

      const cropDataUrl = cropCanvas.toDataURL("image/png");
      const fallbackCentroid = { x: minX + boxWidth / 2, y: minY + boxHeight / 2 };

      stickers.push({
        id: `sticker_${Date.now()}_${i}`,
        polygon: contour.points,
        svgPath: createSvgPath(contour.points),
        centroid: calculateCentroid(contour.points, fallbackCentroid),
        box: {
          x: minX,
          y: minY,
          width: boxWidth,
          height: boxHeight,
        },
        cropDataUrl,
        score: samData.scores?.[i] ?? 1.0,
      });
    } catch (e) {
      console.warn(`Failed to process mask ${i}:`, e);
    }
  }

  onProgress?.(`Successfully extracted ${stickers.length} stickers.`);

  return {
    stickers,
    width: origWidth,
    height: origHeight,
  };
}
