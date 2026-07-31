import type { LaptopSubmission } from "../types";

const METADATA_FILE = "submissions_metadata.json";
const DB_FILE = "eigen_db.bin";

async function getOpfsRoot(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof navigator !== "undefined" && navigator.storage?.getDirectory) {
    try {
      return await navigator.storage.getDirectory();
    } catch (e) {
      console.warn("OPFS getDirectory error:", e);
    }
  }
  return null;
}

export async function saveSubmissionsMetadata(submissions: LaptopSubmission[]): Promise<void> {
  const json = JSON.stringify(submissions, null, 2);
  const root = await getOpfsRoot();
  if (root) {
    try {
      const fileHandle = await root.getFileHandle(METADATA_FILE, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(json);
      await writable.close();
      return;
    } catch (err) {
      console.warn("Failed to write OPFS metadata file, falling back to localStorage", err);
    }
  }
  localStorage.setItem("sticker_tales_metadata", json);
}

export async function loadSubmissionsMetadata(): Promise<LaptopSubmission[]> {
  const root = await getOpfsRoot();
  if (root) {
    try {
      const fileHandle = await root.getFileHandle(METADATA_FILE);
      const file = await fileHandle.getFile();
      const text = await file.text();
      return JSON.parse(text) as LaptopSubmission[];
    } catch {
      // File doesn't exist yet in OPFS
    }
  }
  const fallback = localStorage.getItem("sticker_tales_metadata");
  if (fallback) {
    try {
      return JSON.parse(fallback) as LaptopSubmission[];
    } catch {
      return [];
    }
  }
  return [];
}

export async function saveDbBinary(buffer: ArrayBuffer | Uint8Array): Promise<void> {
  const root = await getOpfsRoot();
  if (root) {
    try {
      const fileHandle = await root.getFileHandle(DB_FILE, { create: true });
      const writable = await fileHandle.createWritable();
      const arrayBuf = buffer instanceof Uint8Array ? (buffer.buffer as ArrayBuffer) : buffer;
      const blob = new Blob([arrayBuf]);
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      console.warn("Failed to write DB binary to OPFS", err);
    }
  }
}

export async function loadDbBinary(): Promise<ArrayBuffer | null> {
  const root = await getOpfsRoot();
  if (root) {
    try {
      const fileHandle = await root.getFileHandle(DB_FILE);
      const file = await fileHandle.getFile();
      return await file.arrayBuffer();
    } catch {
      // File not found
    }
  }
  return null;
}

export async function resetOpfsStorage(): Promise<void> {
  const root = await getOpfsRoot();
  if (root) {
    try {
      for await (const [name] of root.entries()) {
        await root.removeEntry(name, { recursive: true });
      }
    } catch (err) {
      console.warn("Error resetting OPFS storage:", err);
    }
  }
  localStorage.removeItem("sticker_tales_metadata");
}
