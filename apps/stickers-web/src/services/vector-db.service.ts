import { DB, type ResultItem } from "eigen-db";
import { BehaviorSubject } from "rxjs";

export interface DbState {
  status: "uninitialized" | "downloading" | "importing" | "ready" | "error";
  progress: number; // 0 to 100
  loadedBytes: number;
  totalBytes: number;
  vectorCount: number;
  errorMessage?: string;
}

export const dbState$ = new BehaviorSubject<DbState>({
  status: "uninitialized",
  progress: 0,
  loadedBytes: 0,
  totalBytes: 0,
  vectorCount: 0,
});

let dbInstance: DB | null = null;

export async function initVectorDb(): Promise<DB> {
  if (dbInstance) return dbInstance;

  try {
    dbState$.next({
      status: "downloading",
      progress: 0,
      loadedBytes: 0,
      totalBytes: 0,
      vectorCount: 0,
    });

    const db = await DB.open({ dimensions: 1536 });
    const response = await fetch("/embeddings.bin");

    if (!response.ok) {
      throw new Error(`Failed to load embeddings index: ${response.status} ${response.statusText}`);
    }

    const contentLength = response.headers.get("content-length");
    const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
    let loadedBytes = 0;

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Unable to read response body stream");
    }

    const progressStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            break;
          }
          if (value) {
            loadedBytes += value.byteLength;
            const progress = totalBytes > 0 ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100)) : 0;
            dbState$.next({
              status: "downloading",
              progress,
              loadedBytes,
              totalBytes,
              vectorCount: 0,
            });
            controller.enqueue(value);
          }
        }
      },
    });

    dbState$.next({
      status: "importing",
      progress: 100,
      loadedBytes,
      totalBytes,
      vectorCount: 0,
    });

    await db.import(progressStream);
    dbInstance = db;

    dbState$.next({
      status: "ready",
      progress: 100,
      loadedBytes,
      totalBytes,
      vectorCount: db.size,
    });

    return db;
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    dbState$.next({
      status: "error",
      progress: 0,
      loadedBytes: 0,
      totalBytes: 0,
      vectorCount: 0,
      errorMessage,
    });
    throw err;
  }
}

export function queryVectorDb(queryVector: number[], limit: number, minSimilarity: number): ResultItem[] {
  if (!dbInstance) return [];
  return dbInstance.query(queryVector, {
    limit,
    minSimilarity,
  });
}

export function getLaptopNamesInDbOrder(): string[] {
  if (!dbInstance) return [];

  const laptopNames = new Set<string>();
  for (const key of dbInstance.keys()) {
    const lastSlashIndex = key.lastIndexOf("/");
    if (lastSlashIndex !== -1) {
      laptopNames.add(key.substring(0, lastSlashIndex));
    }
  }
  return [...laptopNames];
}

export function querySimilarStickers(stickerKey: string, limit: number): ResultItem[] {
  if (!dbInstance) return [];

  const stickerVector = dbInstance.get(stickerKey);
  if (!stickerVector) return [];

  return dbInstance
    .query(stickerVector, { limit: limit + 1 })
    .filter((item) => item.key !== stickerKey)
    .slice(0, limit);
}
