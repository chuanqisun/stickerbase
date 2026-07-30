import { html, svg } from "lit";
import { keyed } from "lit/directives/keyed.js";
import { ref } from "lit/directives/ref.js";
import { BehaviorSubject, combineLatest, map, tap } from "rxjs";
import { fetchLaptopMetadata, type LaptopMetadata } from "../services/metadata.service";
import { querySimilarStickers } from "../services/vector-db.service";
import { clearStickerDetailRoute, openStickerDetailRoute, stickerDetailRoute$, type LaptopMatchGroup } from "../state";
import { component, observe, withEffect } from "../ui-kit";
import "./laptop-card.component.css";

type SelectedSticker = {
  laptopName: string;
  name: string;
  similarity: number | null;
  bbox: [number, number, number, number];
};

type SimilarSticker = {
  laptopName: string;
  stickerName: string;
  similarity: number;
  bbox: [number, number, number, number];
};

export const LaptopCard = component((props: { matchGroup: LaptopMatchGroup; rank: number }) => {
  const { matchGroup, rank } = props;
  const metadata$ = new BehaviorSubject<LaptopMetadata | null>(null);
  const naturalSize$ = new BehaviorSubject<{ width: number; height: number } | null>(null);
  const selectedSticker$ = new BehaviorSubject<SelectedSticker | null>(null);
  const similarStickers$ = new BehaviorSubject<SimilarSticker[]>([]);
  let detailDialog: HTMLDialogElement | undefined;
  let similarStickersRequestId = 0;

  const loadMetadata = () => {
    if (metadata$.value) return;
    void fetchLaptopMetadata(matchGroup.laptopName).then((meta) => metadata$.next(meta));
  };

  const updateNaturalSize = (img: HTMLImageElement) => {
    if (img.naturalWidth && img.naturalHeight) {
      const currentSize = naturalSize$.value;
      if (currentSize?.width !== img.naturalWidth || currentSize.height !== img.naturalHeight) {
        naturalSize$.next({ width: img.naturalWidth, height: img.naturalHeight });
      }
    }
  };

  const onImgLoad = (event: Event) => {
    updateNaturalSize(event.currentTarget as HTMLImageElement);
    loadMetadata();
  };

  const onImgRef = (element: Element | undefined) => {
    if (element instanceof HTMLImageElement && element.complete) {
      updateNaturalSize(element);
      loadMetadata();
    }
  };

  const onDialogRef = (element: Element | undefined) => {
    detailDialog = element instanceof HTMLDialogElement ? element : undefined;
  };

  const openStickerDetail = (selectedSticker: SelectedSticker) => {
    openStickerDetailRoute({
      laptopName: matchGroup.laptopName,
      stickerName: selectedSticker.name,
    });
  };

  const onDialogClose = () => {
    const route = stickerDetailRoute$.value;
    if (route?.laptopName === matchGroup.laptopName) {
      clearStickerDetailRoute();
    }
  };

  const loadSimilarStickers = async (laptopName: string, stickerName: string) => {
    const requestId = ++similarStickersRequestId;
    similarStickers$.next([]);

    const matches = querySimilarStickers(`${laptopName}/${stickerName}`, 12);
    const similarStickers = await Promise.all(
      matches.map(async (match): Promise<SimilarSticker | null> => {
        const lastSlashIndex = match.key.lastIndexOf("/");
        if (lastSlashIndex === -1) return null;

        const laptopName = match.key.substring(0, lastSlashIndex);
        const similarStickerName = match.key.substring(lastSlashIndex + 1);
        const bbox = (await fetchLaptopMetadata(laptopName))[similarStickerName];
        if (!bbox) return null;

        return {
          laptopName,
          stickerName: similarStickerName,
          similarity: match.similarity,
          bbox,
        };
      }),
    );

    if (requestId === similarStickersRequestId) {
      similarStickers$.next(similarStickers.filter((sticker): sticker is SimilarSticker => sticker !== null).slice(0, 6));
    }
  };

  const selectSimilarSticker = (sticker: SimilarSticker) => {
    selectedSticker$.next({
      laptopName: sticker.laptopName,
      name: sticker.stickerName,
      similarity: sticker.similarity,
      bbox: sticker.bbox,
    });
    void loadSimilarStickers(sticker.laptopName, sticker.stickerName);
    detailDialog?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const overlay$ = combineLatest([metadata$, naturalSize$]);

  const detailRouteEffect$ = combineLatest([stickerDetailRoute$, metadata$, naturalSize$]).pipe(
    tap(([route, metadata, naturalSize]) => {
      const isThisLaptop = route?.laptopName === matchGroup.laptopName;
      if (!isThisLaptop) {
        if (detailDialog?.open) detailDialog.close();
        return;
      }

      const bbox = metadata?.[route.stickerName];
      if (!bbox || !naturalSize || !detailDialog) return;

      const sticker = matchGroup.stickers.find((candidate) => candidate.stickerName === route.stickerName);

      selectedSticker$.next({
        laptopName: matchGroup.laptopName,
        name: route.stickerName,
        similarity: sticker?.similarity ?? null,
        bbox,
      });
      void loadSimilarStickers(matchGroup.laptopName, route.stickerName);
      if (!detailDialog.open) detailDialog.showModal();
    }),
  );

  const renderOverlay = (data: [LaptopMetadata | null, { width: number; height: number } | null]) => {
    const [meta, size] = data;
    if (!meta || !size || size.width === 0 || size.height === 0) {
      return html``;
    }

    const { width, height } = size;
    const matchesByName = new Map(matchGroup.stickers.map((sticker) => [sticker.stickerName, sticker]));

    return html`
      <svg class="bbox-overlay-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
        ${Object.entries(meta).map(([stickerName, bbox]) => {
          if (!bbox || bbox.length < 4) return svg``;

          const [x, y, w, h] = bbox;
          const match = matchesByName.get(stickerName);
          const selectedSticker: SelectedSticker = {
            laptopName: matchGroup.laptopName,
            name: stickerName,
            similarity: match?.similarity ?? null,
            bbox: [x, y, w, h],
          };

          return svg`
            <g
              class="bbox-group ${match ? "query-match" : "unmatched"}"
              role="button"
              tabindex="0"
              aria-label="View ${stickerName} crop"
              @click=${() => openStickerDetail(selectedSticker)}
              @keydown=${(event: KeyboardEvent) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openStickerDetail(selectedSticker);
                }
              }}
            >
              <rect class="bbox-rect" x=${x} y=${y} width=${w} height=${h} rx="4"></rect>
            </g>
          `;
        })}
      </svg>
    `;
  };

  const topMatchScorePct = `${(matchGroup.maxSimilarity * 100).toFixed(1)}%`;

  const renderSimilarSticker = (sticker: SimilarSticker) => {
    const [x, y, width, height] = sticker.bbox;
    const onCropLoad = (event: Event) => {
      const image = event.currentTarget as HTMLImageElement;
      image.style.width = `${(image.naturalWidth / width) * 100}%`;
      image.style.height = `${(image.naturalHeight / height) * 100}%`;
      image.style.left = `${(-x / width) * 100}%`;
      image.style.top = `${(-y / height) * 100}%`;
    };

    return html`
      <button class="similar-sticker" type="button" aria-label="View ${sticker.stickerName}" @click=${() => selectSimilarSticker(sticker)}>
        <div class="similar-sticker-crop" style="aspect-ratio: ${width} / ${height}">
          <img src="/images/${sticker.laptopName}.webp" alt="Crop of ${sticker.stickerName}" loading="lazy" @load=${onCropLoad} />
        </div>
        <span class="similar-sticker-caption">
          <span title=${sticker.stickerName}>${sticker.stickerName}</span>
          <strong>${(sticker.similarity * 100).toFixed(1)}%</strong>
        </span>
      </button>
    `;
  };

  const template = html`
    <div class="laptop-card">
      <div class="card-header">
        <span class="rank-badge">#${rank}</span>
        <span class="laptop-title" title=${matchGroup.laptopName}>${matchGroup.laptopName}</span>
        ${matchGroup.stickers.length > 0
          ? html`
              <div class="scores-badge-group">
                <span class="top-score-badge" title="Highest sticker match score in this image"> ${topMatchScorePct} </span>
                <span class="match-count-badge"> ${matchGroup.stickers.length} ${matchGroup.stickers.length === 1 ? "sticker" : "stickers"} </span>
              </div>
            `
          : null}
      </div>

      <div class="card-media-viewport">
        <img
          ${ref(onImgRef)}
          class="laptop-img"
          src="/images/${matchGroup.laptopName}.webp"
          alt=${matchGroup.laptopName}
          loading=${stickerDetailRoute$.value?.laptopName === matchGroup.laptopName ? "eager" : "lazy"}
          @load=${onImgLoad}
        />
        ${observe(overlay$.pipe(map(renderOverlay)))}
      </div>

      ${matchGroup.stickers.length > 0
        ? html`
            <div class="card-details">
              ${matchGroup.stickers.map(
                (s) => html`
                  <span class="sticker-tag">
                    <span>${s.stickerName}</span>
                    <span class="sticker-score">${(s.similarity * 100).toFixed(1)}%</span>
                  </span>
                `,
              )}
            </div>
          `
        : null}

      <dialog ${ref(onDialogRef)} class="sticker-detail-dialog" @close=${onDialogClose}>
        ${observe(
          selectedSticker$.pipe(
            map((selectedSticker) => {
              if (!selectedSticker) return html``;

              const [x, y, width, height] = selectedSticker.bbox;
              const cropStyle = `aspect-ratio: ${width} / ${height}`;
              const onMainCropLoad = (event: Event) => {
                const image = event.currentTarget as HTMLImageElement;
                image.style.width = `${(image.naturalWidth / width) * 100}%`;
                image.style.height = `${(image.naturalHeight / height) * 100}%`;
                image.style.left = `${(-x / width) * 100}%`;
                image.style.top = `${(-y / height) * 100}%`;
              };

              return html`
                <div class="sticker-detail-header">
                  <div>
                    <h2>${selectedSticker.name}</h2>
                    ${selectedSticker.similarity === null ? null : html`<span>${(selectedSticker.similarity * 100).toFixed(1)}% match</span>`}
                  </div>
                  <form method="dialog">
                    <button type="submit" class="sticker-detail-close" aria-label="Close sticker detail" title="Close">&times;</button>
                  </form>
                </div>
                <div class="sticker-detail-crop" style=${cropStyle}>
                  ${keyed(
                    `${selectedSticker.laptopName}/${selectedSticker.name}`,
                    html`<img src="/images/${selectedSticker.laptopName}.webp" alt="Crop of ${selectedSticker.name}" @load=${onMainCropLoad} />`,
                  )}
                </div>
                <section class="similar-stickers" aria-labelledby="similar-stickers-title">
                  <h3 id="similar-stickers-title">Similar stickers</h3>
                  <div class="similar-stickers-grid">${observe(similarStickers$.pipe(map((stickers) => stickers.map(renderSimilarSticker))))}</div>
                </section>
              `;
            }),
          ),
        )}
      </dialog>
    </div>
  `;

  return withEffect(template, detailRouteEffect$);
});
