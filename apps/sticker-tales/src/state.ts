import { BehaviorSubject } from "rxjs";
import { getApiKeys } from "./services/api-keys.service";
import { embedStickerImage } from "./services/gemini.service";
import { loadDbBinary, loadSubmissionsMetadata, resetOpfsStorage, saveDbBinary, saveSubmissionsMetadata } from "./services/opfs.service";
import { runSamSegmentation } from "./services/sam.service";
import { addStickerVectorsBatch, exportDbBinaryBuffer, getVectorDb, loadDbFromBinary, querySimilarStickersByVector } from "./services/vector-db.service";
import type { ConnectionItem, LaptopSubmission, StickerMask, StickerStory, ViewMode } from "./types";

export interface UploadState {
  imageDataUrl: string | null;
  imageWidth: number;
  imageHeight: number;
  isScanning: boolean;
  scanProgress: string;
  stickers: StickerMask[];
  stories: Record<string, StickerStory>;
  isSubmitting: boolean;
  submitProgress: string;
  error?: string;
}

const initialUploadState: UploadState = {
  imageDataUrl: null,
  imageWidth: 0,
  imageHeight: 0,
  isScanning: false,
  scanProgress: "",
  stickers: [],
  stories: {},
  isSubmitting: false,
  submitProgress: "",
};

export const currentView$ = new BehaviorSubject<ViewMode>("upload");
export const isApiKeysModalOpen$ = new BehaviorSubject<boolean>(false);
export const submissions$ = new BehaviorSubject<LaptopSubmission[]>([]);
export const latestSubmittedId$ = new BehaviorSubject<string | null>(null);
export const uploadState$ = new BehaviorSubject<UploadState>(initialUploadState);
export const selectedStickerId$ = new BehaviorSubject<string | null>(null);
export const connections$ = new BehaviorSubject<ConnectionItem[]>([]);
export const currentPlayingAudio$ = new BehaviorSubject<{ stickerId: string; laptopId?: string } | null>(null);

export async function initAppState(): Promise<void> {
  // Load saved submissions from OPFS
  const loadedSubmissions = await loadSubmissionsMetadata();
  submissions$.next(loadedSubmissions);

  // Load saved DB binary if present
  const dbBuf = await loadDbBinary();
  if (dbBuf && dbBuf.byteLength > 0) {
    try {
      await loadDbFromBinary(dbBuf);
    } catch (e) {
      console.warn("Could not load saved DB binary from OPFS", e);
      await getVectorDb();
    }
  } else {
    await getVectorDb();
  }
}

export function setView(mode: ViewMode): void {
  currentView$.next(mode);
}

export function setApiKeysModalOpen(open: boolean): void {
  isApiKeysModalOpen$.next(open);
}

export function resetUploadState(): void {
  uploadState$.next(initialUploadState);
  selectedStickerId$.next(null);
}

export function setUploadImageData(imageDataUrl: string): void {
  uploadState$.next({
    ...initialUploadState,
    imageDataUrl,
  });
  selectedStickerId$.next(null);
}

export async function startSamScanning(): Promise<void> {
  const state = uploadState$.value;
  if (!state.imageDataUrl) return;

  const { falApiKey } = getApiKeys();
  if (!falApiKey) {
    setApiKeysModalOpen(true);
    return;
  }

  uploadState$.next({
    ...state,
    isScanning: true,
    scanProgress: "Initializing SAM 3.1...",
    error: undefined,
  });

  try {
    const result = await runSamSegmentation(falApiKey, state.imageDataUrl, (progress) => {
      uploadState$.next({
        ...uploadState$.value,
        scanProgress: progress,
      });
    });

    uploadState$.next({
      ...uploadState$.value,
      isScanning: false,
      scanProgress: "",
      stickers: result.stickers,
      imageWidth: result.width,
      imageHeight: result.height,
    });

    if (result.stickers.length > 0) {
      selectedStickerId$.next(result.stickers[0].id);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    uploadState$.next({
      ...uploadState$.value,
      isScanning: false,
      scanProgress: "",
      error: `Scanning failed: ${msg}`,
    });
  }
}

export function selectSticker(stickerId: string | null): void {
  selectedStickerId$.next(stickerId);
}

export function setStickerStory(stickerId: string, story: StickerStory): void {
  const currentStories = { ...uploadState$.value.stories };
  currentStories[stickerId] = story;
  uploadState$.next({
    ...uploadState$.value,
    stories: currentStories,
  });
}

export function deleteStickerStory(stickerId: string): void {
  const currentStories = { ...uploadState$.value.stories };
  delete currentStories[stickerId];
  uploadState$.next({
    ...uploadState$.value,
    stories: currentStories,
  });
}

export async function submitLaptopStory(title = "My Laptop"): Promise<void> {
  const state = uploadState$.value;
  if (!state.imageDataUrl || state.stickers.length === 0) return;

  const { geminiApiKey } = getApiKeys();
  if (!geminiApiKey) {
    setApiKeysModalOpen(true);
    return;
  }

  uploadState$.next({
    ...state,
    isSubmitting: true,
    submitProgress: "Generating sticker embeddings with Gemini 2...",
  });

  try {
    const laptopId = `laptop_${Date.now()}`;
    const vectorEntries: [string, number[]][] = [];
    const stickerEmbeddingsMap: Record<string, number[]> = {};

    for (let i = 0; i < state.stickers.length; i++) {
      const sticker = state.stickers[i];
      uploadState$.next({
        ...uploadState$.value,
        submitProgress: `Embedding sticker ${i + 1}/${state.stickers.length} with Gemini...`,
      });

      const vector = await embedStickerImage(geminiApiKey, sticker.cropDataUrl);
      const dbKey = `${laptopId}/${sticker.id}`;
      vectorEntries.push([dbKey, vector]);
      stickerEmbeddingsMap[sticker.id] = vector;
    }

    uploadState$.next({
      ...uploadState$.value,
      submitProgress: "Updating vector database...",
    });

    await addStickerVectorsBatch(vectorEntries);

    // Save DB export to OPFS
    const dbBinary = await exportDbBinaryBuffer();
    await saveDbBinary(dbBinary);

    const submission: LaptopSubmission = {
      id: laptopId,
      title,
      laptopImageDataUrl: state.imageDataUrl,
      imageWidth: state.imageWidth,
      imageHeight: state.imageHeight,
      stickers: state.stickers,
      stories: state.stories,
      createdAt: new Date().toISOString(),
    };

    const newSubmissions = [submission, ...submissions$.value];
    submissions$.next(newSubmissions);
    await saveSubmissionsMetadata(newSubmissions);

    latestSubmittedId$.next(laptopId);

    // Build connections for this submission
    findConnectionsForSubmission(submission, stickerEmbeddingsMap);

    uploadState$.next({
      ...uploadState$.value,
      isSubmitting: false,
      submitProgress: "",
    });

    // Reset upload & go to connections view
    resetUploadState();
    setView("connections");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    uploadState$.next({
      ...uploadState$.value,
      isSubmitting: false,
      submitProgress: "",
      error: `Submission failed: ${msg}`,
    });
  }
}

export function findConnectionsForSubmission(submission: LaptopSubmission, embeddingsMap?: Record<string, number[]>): void {
  const allSubs = submissions$.value;
  const connectionItems: ConnectionItem[] = [];

  for (const sticker of submission.stickers) {
    const vec = embeddingsMap?.[sticker.id];
    if (!vec) continue;

    // Query similar vectors in DB
    const results = querySimilarStickersByVector(vec, 6, 0.15);

    for (const res of results) {
      // res.key is "laptopId/stickerId"
      const [targetLaptopId, targetStickerId] = res.key.split("/");
      if (targetLaptopId === submission.id) continue; // Skip self

      const targetSub = allSubs.find((s) => s.id === targetLaptopId);
      if (!targetSub) continue;

      const targetSticker = targetSub.stickers.find((st) => st.id === targetStickerId);
      if (!targetSticker) continue;

      connectionItems.push({
        queryStickerId: sticker.id,
        targetKey: res.key,
        targetLaptopId,
        targetStickerId,
        targetLaptopTitle: targetSub.title,
        targetLaptopImageDataUrl: targetSub.laptopImageDataUrl,
        targetStickerCropDataUrl: targetSticker.cropDataUrl,
        similarity: res.similarity,
        story: targetSub.stories[targetStickerId],
      });
    }
  }

  // Sort by similarity descending
  connectionItems.sort((a, b) => b.similarity - a.similarity);
  connections$.next(connectionItems);
}

export async function deleteSubmission(id: string): Promise<void> {
  const filtered = submissions$.value.filter((s) => s.id !== id);
  submissions$.next(filtered);
  await saveSubmissionsMetadata(filtered);
}

export async function resetAllData(): Promise<void> {
  await resetOpfsStorage();
  submissions$.next([]);
  latestSubmittedId$.next(null);
  connections$.next([]);
  resetUploadState();
  window.location.reload();
}
