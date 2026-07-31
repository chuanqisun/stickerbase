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

/**
 * Traces outer contour of non-transparent pixels in canvasImageData
 */
function extractContourPoints(ctx: CanvasRenderingContext2D, width: number, height: number, step = 4): Point[] {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  let xMin = width;
  let xMax = 0;
  let yMin = height;
  let yMax = 0;
  let hasPixels = false;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 20) {
        hasPixels = true;
        if (x < xMin) xMin = x;
        if (x > xMax) xMax = x;
        if (y < yMin) yMin = y;
        if (y > yMax) yMax = y;
      }
    }
  }

  if (!hasPixels) return [];

  // Generate bounding box polygon
  return [
    { x: xMin, y: yMin },
    { x: xMax, y: yMin },
    { x: xMax, y: yMax },
    { x: xMin, y: yMax },
  ];
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

      // Find bounding box of non-transparent pixels
      const imgData = ctx.getImageData(0, 0, origWidth, origHeight);
      const data = imgData.data;

      let minX = origWidth;
      let maxX = 0;
      let minY = origHeight;
      let maxY = 0;
      let pixelCount = 0;

      for (let y = 0; y < origHeight; y += 2) {
        for (let x = 0; x < origWidth; x += 2) {
          const alpha = data[(y * origWidth + x) * 4 + 3];
          if (alpha > 20) {
            pixelCount++;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (pixelCount < 50) continue; // Skip tiny noise

      const boxWidth = maxX - minX;
      const boxHeight = maxY - minY;

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
      const polygon = extractContourPoints(ctx, origWidth, origHeight);

      stickers.push({
        id: `sticker_${Date.now()}_${i}`,
        polygon:
          polygon.length > 0
            ? polygon
            : [
                { x: minX, y: minY },
                { x: maxX, y: minY },
                { x: maxX, y: maxY },
                { x: minX, y: maxY },
              ],
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
