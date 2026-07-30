export type LaptopMetadata = Record<string, [number, number, number, number]>;

const metadataCache = new Map<string, Promise<LaptopMetadata>>();

/**
 * Fetch bounding box metadata for a given laptop image at runtime.
 * Caches promises in memory to prevent duplicate network requests.
 */
export function fetchLaptopMetadata(laptopName: string): Promise<LaptopMetadata> {
  if (!metadataCache.has(laptopName)) {
    const promise = fetch(`${import.meta.env.BASE_URL}images/${laptopName}.json`)
      .then((res) => {
        if (!res.ok) {
          return {};
        }
        return res.json() as Promise<LaptopMetadata>;
      })
      .catch((err: unknown) => {
        console.warn(`Failed to fetch metadata for ${laptopName}:`, err);
        return {} as LaptopMetadata;
      });
    metadataCache.set(laptopName, promise);
  }
  return metadataCache.get(laptopName)!;
}
