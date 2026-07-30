import type { ResultItem } from "eigen-db";
import { BehaviorSubject, Subject } from "rxjs";

const LOCAL_STORAGE_KEY = "gemini_api_key";

export interface StickerMatch {
  stickerName: string;
  similarity: number;
}

export interface LaptopMatchGroup {
  laptopName: string;
  maxSimilarity: number;
  stickers: StickerMatch[];
}

// Initial state from localStorage
const initialApiKey = localStorage.getItem(LOCAL_STORAGE_KEY) || "";

export const apiKey$ = new BehaviorSubject<string>(initialApiKey);
export const showApiKey$ = new BehaviorSubject<boolean>(false);

export const queryText$ = new BehaviorSubject<string>("");
export const topK$ = new BehaviorSubject<number>(20);
export const minSimilarity$ = new BehaviorSubject<number>(0.2);

export const searchResults$ = new BehaviorSubject<LaptopMatchGroup[]>([]);
export const isSearching$ = new BehaviorSubject<boolean>(false);
export const searchError$ = new BehaviorSubject<string | null>(null);

export const triggerMatch$ = new Subject<void>();

// Sync API key to localStorage whenever it changes
apiKey$.subscribe((key) => {
  if (key) {
    localStorage.setItem(LOCAL_STORAGE_KEY, key);
  } else {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  }
});

/**
 * Group raw sticker search items into laptop images and sort by highest similarity score.
 */
export function groupResultsByLaptop(
  items: ResultItem[],
  topK: number,
  minSimilarity: number
): LaptopMatchGroup[] {
  const groupsMap = new Map<string, StickerMatch[]>();

  for (const item of items) {
    if (item.similarity < minSimilarity) continue;

    const lastSlashIdx = item.key.lastIndexOf("/");
    if (lastSlashIdx === -1) continue;

    const laptopName = item.key.substring(0, lastSlashIdx);
    const stickerName = item.key.substring(lastSlashIdx + 1);

    if (!groupsMap.has(laptopName)) {
      groupsMap.set(laptopName, []);
    }
    groupsMap.get(laptopName)!.push({
      stickerName,
      similarity: item.similarity,
    });
  }

  const groups: LaptopMatchGroup[] = [];
  for (const [laptopName, stickers] of groupsMap.entries()) {
    stickers.sort((a, b) => b.similarity - a.similarity);
    const maxSimilarity = stickers[0]?.similarity ?? 0;
    groups.push({
      laptopName,
      maxSimilarity,
      stickers,
    });
  }

  // Sort laptops by highest sticker match score descending
  groups.sort((a, b) => b.maxSimilarity - a.maxSimilarity);
  return groups.slice(0, topK);
}
