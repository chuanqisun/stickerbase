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

const formatIndex = (value: string, length: number) => (value.match(/^\d+/)?.[0] ?? "0").padStart(length, "0");
const formatLaptopTitle = (laptopName: string) => `#${formatIndex(laptopName, 4)}`;
const formatStickerTitle = (laptopName: string, stickerName: string) => `${formatLaptopTitle(laptopName)}-${formatIndex(stickerName, 2)}`;

const sortBoundingBoxesForPaint = (metadata: LaptopMetadata, isMatched: (stickerName: string) => boolean) =>
  Object.entries(metadata).sort(([leftName, leftBbox], [rightName, rightBbox]) => {
    const matchOrder = Number(isMatched(leftName)) - Number(isMatched(rightName));
    if (matchOrder !== 0) return matchOrder;

    const areaOrder = rightBbox[2] * rightBbox[3] - leftBbox[2] * leftBbox[3];
    if (areaOrder !== 0) return areaOrder;
    return leftName.localeCompare(rightName, undefined, { numeric: true });
  });

export const LaptopCard = component((props: { matchGroup: LaptopMatchGroup; rank: number }) => {
  const { matchGroup, rank } = props;
  const metadata$ = new BehaviorSubject<LaptopMetadata | null>(null);
  const naturalSize$ = new BehaviorSubject<{ width: number; height: number } | null>(null);
  const selectedSticker$ = new BehaviorSubject<SelectedSticker | null>(null);
  const selectedLaptopMetadata$ = new BehaviorSubject<LaptopMetadata>({});
  const selectedLaptopSize$ = new BehaviorSubject<{ width: number; height: number } | null>(null);
  const similarStickers$ = new BehaviorSubject<SimilarSticker[]>([]);
  const hoveredStickerName$ = new BehaviorSubject<string | null>(null);
  const isFullStickerView$ = new BehaviorSubject(false);
  const hasToggledStickerView$ = new BehaviorSubject(false);
  let detailDialog: HTMLDialogElement | undefined;
  let detailCrop: HTMLElement | undefined;
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

  const onDetailCropRef = (element: Element | undefined) => {
    detailCrop = element instanceof HTMLElement ? element : undefined;
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

  const loadSelectedLaptopMetadata = (laptopName: string, stickerName: string, fallbackBbox: SelectedSticker["bbox"]) => {
    selectedLaptopMetadata$.next({ [stickerName]: fallbackBbox });
    void fetchLaptopMetadata(laptopName).then((metadata) => {
      const selectedSticker = selectedSticker$.value;
      if (selectedSticker?.laptopName === laptopName && selectedSticker.name === stickerName) {
        selectedLaptopMetadata$.next(metadata);
      }
    });
  };

  const updateDetailCropGeometry = (image: HTMLImageElement, bbox: SelectedSticker["bbox"]) => {
    const [bboxX, bboxY, bboxWidth, bboxHeight] = bbox;
    const crop = image.parentElement;
    const maxDimension = Math.max(image.naturalWidth, image.naturalHeight);
    const originX = 50 + ((bboxX + bboxWidth / 2 - image.naturalWidth / 2) / maxDimension) * 100;
    const originY = 50 + ((bboxY + bboxHeight / 2 - image.naturalHeight / 2) / maxDimension) * 100;
    crop?.style.setProperty("--focus-left", `${50 - originX}%`);
    crop?.style.setProperty("--focus-top", `${50 - originY}%`);
    crop?.style.setProperty("--focus-origin-x", `${originX}%`);
    crop?.style.setProperty("--focus-origin-y", `${originY}%`);
    crop?.style.setProperty("--focus-scale", `${maxDimension / Math.max(bboxWidth, bboxHeight)}`);
  };

  const selectSimilarSticker = (sticker: SimilarSticker) => {
    hasToggledStickerView$.next(false);
    isFullStickerView$.next(false);
    selectedLaptopSize$.next(null);
    selectedSticker$.next({
      laptopName: sticker.laptopName,
      name: sticker.stickerName,
      similarity: sticker.similarity,
      bbox: sticker.bbox,
    });
    loadSelectedLaptopMetadata(sticker.laptopName, sticker.stickerName, sticker.bbox);
    void loadSimilarStickers(sticker.laptopName, sticker.stickerName);
    detailDialog?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const selectStickerFromFullView = (sticker: SelectedSticker) => {
    const image = detailCrop?.querySelector("img");
    if (image instanceof HTMLImageElement) {
      updateDetailCropGeometry(image, sticker.bbox);
    }
    selectedSticker$.next(sticker);
    void loadSimilarStickers(sticker.laptopName, sticker.name);
    isFullStickerView$.next(false);
  };

  const overlay$ = combineLatest([metadata$, naturalSize$, hoveredStickerName$]);

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

      hasToggledStickerView$.next(false);
      isFullStickerView$.next(false);
      selectedLaptopMetadata$.next(metadata);
      selectedLaptopSize$.next(naturalSize);
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

  const renderOverlay = (data: [LaptopMetadata | null, { width: number; height: number } | null, string | null]) => {
    const [meta, size, hoveredStickerName] = data;
    if (!meta || !size || size.width === 0 || size.height === 0) {
      return html``;
    }

    const { width, height } = size;
    const matchesByName = new Map(matchGroup.stickers.map((sticker) => [sticker.stickerName, sticker]));
    const boxesInPaintOrder = sortBoundingBoxesForPaint(meta, (stickerName) => matchesByName.has(stickerName));

    return html`
      <svg class="bbox-overlay-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
        ${boxesInPaintOrder.map(([stickerName, bbox]) => {
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
              class="bbox-group ${match ? "query-match" : "unmatched"} ${hoveredStickerName === stickerName ? "tag-hovered" : ""}"
              role="button"
              tabindex="0"
              aria-label="View ${formatStickerTitle(matchGroup.laptopName, stickerName)} crop"
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

  const renderDetailOverlay = (selectedSticker: SelectedSticker, data: [LaptopMetadata, { width: number; height: number } | null]) => {
    const [metadata, size] = data;
    if (!size) return html``;
    const matchesByName = new Set(
      selectedSticker.laptopName === matchGroup.laptopName
        ? matchGroup.stickers.map((sticker) => sticker.stickerName)
        : selectedSticker.similarity === null
          ? []
          : [selectedSticker.name],
    );
    const boxesInPaintOrder = sortBoundingBoxesForPaint(metadata, (stickerName) => matchesByName.has(stickerName));

    return html`
      <svg class="sticker-detail-overlay" viewBox="0 0 ${size.width} ${size.height}" preserveAspectRatio="xMidYMid meet">
        ${boxesInPaintOrder.map(([stickerName, bbox]) => {
          if (!bbox || bbox.length < 4) return svg``;

          const [x, y, width, height] = bbox;
          return svg`
            <g
              class="bbox-group unmatched detail-bbox-group"
              role="button"
              tabindex="0"
              aria-label="Focus ${formatStickerTitle(selectedSticker.laptopName, stickerName)}"
              @click=${(event: MouseEvent) => {
                event.stopPropagation();
                selectStickerFromFullView({
                  laptopName: selectedSticker.laptopName,
                  name: stickerName,
                  similarity: stickerName === selectedSticker.name ? selectedSticker.similarity : null,
                  bbox: [x, y, width, height],
                });
              }}
              @keydown=${(event: KeyboardEvent) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  selectStickerFromFullView({
                    laptopName: selectedSticker.laptopName,
                    name: stickerName,
                    similarity: stickerName === selectedSticker.name ? selectedSticker.similarity : null,
                    bbox: [x, y, width, height],
                  });
                }
              }}
            >
              <rect class="bbox-rect" x=${x} y=${y} width=${width} height=${height} rx="4"></rect>
            </g>
          `;
        })}
      </svg>
    `;
  };

  const topMatchScorePct = `${(matchGroup.maxSimilarity * 100).toFixed(1)}%`;

  const renderStickerTags = (metadata: LaptopMetadata | null) => {
    if (!metadata) return html``;

    const matchesByName = new Map(matchGroup.stickers.map((sticker) => [sticker.stickerName, sticker]));
    const stickerNames = Object.keys(metadata).sort((left, right) => {
      const leftMatch = matchesByName.get(left);
      const rightMatch = matchesByName.get(right);

      if (leftMatch && rightMatch) return rightMatch.similarity - leftMatch.similarity;
      if (leftMatch) return -1;
      if (rightMatch) return 1;
      return left.localeCompare(right, undefined, { numeric: true });
    });

    return stickerNames.map((stickerName) => {
      const bbox = metadata[stickerName];
      if (!bbox) return html``;

      const match = matchesByName.get(stickerName);
      const stickerIndex = stickerName.replace(/\.[^.]+$/, "");
      const selectedSticker: SelectedSticker = {
        laptopName: matchGroup.laptopName,
        name: stickerName,
        similarity: match?.similarity ?? null,
        bbox,
      };

      return html`
        <button
          class="sticker-tag ${match ? "query-match" : ""}"
          type="button"
          aria-label="View sticker ${stickerIndex}"
          @mouseenter=${() => hoveredStickerName$.next(stickerName)}
          @mouseleave=${() => hoveredStickerName$.next(null)}
          @click=${() => openStickerDetail(selectedSticker)}
        >
          <span>${stickerIndex}</span>
        </button>
      `;
    });
  };

  const renderSimilarSticker = (sticker: SimilarSticker) => {
    const [x, y, width, height] = sticker.bbox;
    const stickerTitle = formatStickerTitle(sticker.laptopName, sticker.stickerName);
    const cropWidth = `${Math.min(1, width / height) * 100}%`;
    const onCropLoad = (event: Event) => {
      const image = event.currentTarget as HTMLImageElement;
      image.style.width = `${(image.naturalWidth / width) * 100}%`;
      image.style.height = `${(image.naturalHeight / height) * 100}%`;
      image.style.left = `${(-x / width) * 100}%`;
      image.style.top = `${(-y / height) * 100}%`;
    };

    return html`
      <button class="similar-sticker" type="button" aria-label="View ${stickerTitle}" @click=${() => selectSimilarSticker(sticker)}>
        <div class="similar-sticker-crop">
          <div class="similar-sticker-crop-window" style="width: ${cropWidth}; aspect-ratio: ${width} / ${height}">
            <img src="/images/${sticker.laptopName}.webp" alt="Crop of ${stickerTitle}" loading="lazy" @load=${onCropLoad} />
          </div>
        </div>
        <span class="similar-sticker-caption">
          <span>${stickerTitle}</span>
          <strong>${(sticker.similarity * 100).toFixed(1)}%</strong>
        </span>
      </button>
    `;
  };

  const renderSimilarStickerGrid = (stickers: SimilarSticker[]) => [
    ...stickers.map(renderSimilarSticker),
    ...Array.from(
      { length: Math.max(0, 6 - stickers.length) },
      () => html`
        <div class="similar-sticker similar-sticker-placeholder" aria-hidden="true">
          <div class="similar-sticker-crop"></div>
          <span class="similar-sticker-caption"><span>&nbsp;</span></span>
        </div>
      `,
    ),
  ];

  const template = html`
    <div class="laptop-card">
      <div class="card-header">
        <span class="rank-badge">${formatLaptopTitle(matchGroup.laptopName)}</span>
        ${matchGroup.stickers.length > 0
          ? html`
              <div class="scores-badge-group">
                <span class="top-score-badge" title="Highest sticker match score in this image"> ${topMatchScorePct} </span>
              </div>
            `
          : null}
      </div>

      <div class="card-media-viewport">
        <img
          ${ref(onImgRef)}
          class="laptop-img"
          src="/images/${matchGroup.laptopName}.webp"
          alt=${formatLaptopTitle(matchGroup.laptopName)}
          loading=${stickerDetailRoute$.value?.laptopName === matchGroup.laptopName ? "eager" : "lazy"}
          @load=${onImgLoad}
        />
        ${observe(overlay$.pipe(map(renderOverlay)))}
      </div>

      <div class="card-details">${observe(metadata$.pipe(map(renderStickerTags)))}</div>

      <dialog ${ref(onDialogRef)} class="sticker-detail-dialog" @close=${onDialogClose}>
        ${observe(
          selectedSticker$.pipe(
            map((selectedSticker) => {
              if (!selectedSticker) return html``;

              const onMainCropLoad = (event: Event) => {
                const image = event.currentTarget as HTMLImageElement;
                selectedLaptopSize$.next({ width: image.naturalWidth, height: image.naturalHeight });
                updateDetailCropGeometry(image, selectedSticker.bbox);
              };

              return html`
                <div class="sticker-detail-header">
                  <div>
                    <h2>${formatStickerTitle(selectedSticker.laptopName, selectedSticker.name)}</h2>
                  </div>
                  <form method="dialog">
                    <button type="submit" class="sticker-detail-close" aria-label="Close sticker detail" title="Close">&times;</button>
                  </form>
                </div>
                <div
                  ${ref(onDetailCropRef)}
                  class="sticker-detail-crop ${observe(
                    combineLatest([isFullStickerView$, hasToggledStickerView$]).pipe(
                      map(([isFullView, hasToggled]) => `${isFullView ? "full-view" : "focus-view"} ${hasToggled ? "view-transition-enabled" : ""}`),
                    ),
                  )}"
                  role="button"
                  tabindex="0"
                  aria-label=${observe(isFullStickerView$.pipe(map((isFullView) => (isFullView ? "Show focused sticker view" : "Show full laptop view"))))}
                  @click=${() => {
                    hasToggledStickerView$.next(true);
                    isFullStickerView$.next(!isFullStickerView$.value);
                  }}
                  @keydown=${(event: KeyboardEvent) => {
                    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
                    event.preventDefault();
                    hasToggledStickerView$.next(true);
                    isFullStickerView$.next(!isFullStickerView$.value);
                  }}
                >
                  ${keyed(
                    selectedSticker.laptopName,
                    html`<img
                      src="/images/${selectedSticker.laptopName}.webp"
                      alt="Crop of ${formatStickerTitle(selectedSticker.laptopName, selectedSticker.name)}"
                      @load=${onMainCropLoad}
                    />`,
                  )}
                  ${observe(combineLatest([selectedLaptopMetadata$, selectedLaptopSize$]).pipe(map((data) => renderDetailOverlay(selectedSticker, data))))}
                </div>
                <section class="similar-stickers" aria-labelledby="similar-stickers-title">
                  <h3 id="similar-stickers-title">Similar stickers</h3>
                  <div class="similar-stickers-grid">${observe(similarStickers$.pipe(map(renderSimilarStickerGrid)))}</div>
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
