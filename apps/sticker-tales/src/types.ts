export interface Point {
  x: number;
  y: number;
}

export interface StickerMask {
  id: string;
  polygon: Point[];
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  cropDataUrl: string;
  score?: number;
}

export interface StickerStory {
  stickerId: string;
  title: string;
  audioDataUrl: string;
  durationSeconds: number;
  createdAt: string;
}

export interface LaptopSubmission {
  id: string;
  title: string;
  laptopImageDataUrl: string;
  imageWidth: number;
  imageHeight: number;
  stickers: StickerMask[];
  stories: Record<string, StickerStory>; // stickerId -> StickerStory
  createdAt: string;
}

export interface ConnectionItem {
  queryStickerId: string;
  targetKey: string;
  targetLaptopId: string;
  targetStickerId: string;
  targetLaptopTitle: string;
  targetLaptopImageDataUrl: string;
  targetStickerCropDataUrl: string;
  similarity: number;
  story?: StickerStory;
}

export interface ApiKeys {
  geminiApiKey: string;
  falApiKey: string;
}

export type ViewMode = "upload" | "connections" | "all-stories" | "my-stories";
