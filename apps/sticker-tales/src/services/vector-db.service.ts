import { DB, type ResultItem } from "eigen-db";
import { BehaviorSubject } from "rxjs";

export interface DbStatus {
  status: "uninitialized" | "ready" | "loading" | "error";
  vectorCount: number;
  message?: string;
}

export const dbStatus$ = new BehaviorSubject<DbStatus>({
  status: "uninitialized",
  vectorCount: 0,
});

let dbInstance: DB | null = null;

export async function getVectorDb(): Promise<DB> {
  if (!dbInstance) {
    dbStatus$.next({ status: "loading", vectorCount: 0, message: "Opening EigenDB..." });
    dbInstance = await DB.open({ dimensions: 1536 });
    dbStatus$.next({ status: "ready", vectorCount: dbInstance.size });
  }
  return dbInstance;
}

export async function loadDbFromBinary(buffer: ArrayBuffer): Promise<DB> {
  const db = await DB.open({ dimensions: 1536 });
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(buffer));
      controller.close();
    },
  });
  await db.import(stream);
  dbInstance = db;
  dbStatus$.next({ status: "ready", vectorCount: db.size, message: `Loaded ${db.size} vectors` });
  return db;
}

export async function addStickerVector(key: string, vector: number[]): Promise<void> {
  const db = await getVectorDb();
  db.set(key, vector);
  dbStatus$.next({ status: "ready", vectorCount: db.size });
}

export async function addStickerVectorsBatch(entries: [string, number[]][]): Promise<void> {
  const db = await getVectorDb();
  db.setMany(entries);
  dbStatus$.next({ status: "ready", vectorCount: db.size });
}

export function querySimilarStickersByVector(queryVector: number[], limit = 10, minSimilarity = 0.2): ResultItem[] {
  if (!dbInstance) return [];
  return dbInstance.query(queryVector, {
    limit,
    minSimilarity,
  });
}

export async function exportDbBinaryBuffer(): Promise<Uint8Array> {
  const db = await getVectorDb();
  const stream = await db.export();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }

  let totalLength = 0;
  for (const chunk of chunks) totalLength += chunk.length;

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export async function downloadDbBinaryFile(filename = "sticker-tales-db.bin"): Promise<void> {
  const binary = await exportDbBinaryBuffer();
  const blob = new Blob([binary.buffer as ArrayBuffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
