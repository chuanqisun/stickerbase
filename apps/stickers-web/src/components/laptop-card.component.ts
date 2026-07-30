import { html, svg } from "lit";
import { BehaviorSubject, combineLatest, map } from "rxjs";
import { fetchLaptopMetadata, type LaptopMetadata } from "../services/metadata.service";
import type { LaptopMatchGroup } from "../state";
import { component, observe } from "../ui-kit";
import "./laptop-card.component.css";

export const LaptopCard = component((props: { matchGroup: LaptopMatchGroup; rank: number }) => {
  const { matchGroup, rank } = props;
  const metadata$ = new BehaviorSubject<LaptopMetadata | null>(null);
  const naturalSize$ = new BehaviorSubject<{ width: number; height: number } | null>(null);

  // Fetch bounding box metadata for this laptop on mount
  fetchLaptopMetadata(matchGroup.laptopName).then((meta) => {
    metadata$.next(meta);
  });

  const onImgLoad = (e: Event) => {
    const img = e.target as HTMLImageElement;
    if (img.naturalWidth && img.naturalHeight) {
      naturalSize$.next({ width: img.naturalWidth, height: img.naturalHeight });
    }
  };

  const overlay$ = combineLatest([metadata$, naturalSize$]);

  const renderOverlay = (data: [LaptopMetadata | null, { width: number; height: number } | null]) => {
    const [meta, size] = data;
    if (!meta || !size || size.width === 0 || size.height === 0) {
      return html``;
    }

    const { width, height } = size;

    return html`
      <svg class="bbox-overlay-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
        <defs>
          <filter id="bg-badge" x="-10%" y="-10%" width="120%" height="120%">
            <feFlood flood-color="#000000" flood-opacity="0.85" result="bg"></feFlood>
            <feMerge>
              <feMergeNode in="bg"></feMergeNode>
              <feMergeNode in="SourceGraphic"></feMergeNode>
            </feMerge>
          </filter>
        </defs>
        ${matchGroup.stickers.map((sticker, idx) => {
          const bbox = meta[sticker.stickerName];
          if (!bbox || bbox.length < 4) return svg``;

          const [x, y, w, h] = bbox;
          const isTopMatch = idx === 0;
          const pctText = `${(sticker.similarity * 100).toFixed(1)}%`;

          // Label placement logic: above bbox if enough space, else inside top-left
          const labelY = y > 35 ? y - 10 : y + 25;
          const labelX = x + 6;

          return svg`
            <g class="bbox-group">
              <rect class="bbox-rect ${isTopMatch ? "top-match" : ""}" x=${x} y=${y} width=${w} height=${h} rx="4"></rect>
              <rect x=${labelX - 4} y=${labelY - 18} width=${pctText.length * 9 + 12} height="22" rx="3" fill="rgba(0, 0, 0, 0.85)"></rect>
              <text x=${labelX} y=${labelY} fill=${isTopMatch ? "#ffd700" : "#00e676"} font-size="14" font-family="system-ui, sans-serif" font-weight="bold">
                ${pctText}
              </text>
            </g>
          `;
        })}
      </svg>
    `;
  };

  const topMatchScorePct = `${(matchGroup.maxSimilarity * 100).toFixed(1)}%`;

  return html`
    <div class="laptop-card">
      <div class="card-header">
        <span class="rank-badge">#${rank}</span>
        <span class="laptop-title" title=${matchGroup.laptopName}>${matchGroup.laptopName}</span>
        <div class="scores-badge-group">
          <span class="top-score-badge" title="Highest sticker match score in this image"> ${topMatchScorePct} </span>
          <span class="match-count-badge"> ${matchGroup.stickers.length} ${matchGroup.stickers.length === 1 ? "sticker" : "stickers"} </span>
        </div>
      </div>

      <div class="card-media-viewport">
        <img class="laptop-img" src="/images/${matchGroup.laptopName}.webp" alt=${matchGroup.laptopName} loading="lazy" @load=${onImgLoad} />
        ${observe(overlay$.pipe(map(renderOverlay)))}
      </div>

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
    </div>
  `;
});
