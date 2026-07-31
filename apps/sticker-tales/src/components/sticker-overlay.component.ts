import { html, svg } from "lit";
import type { Observable } from "rxjs";
import { map } from "rxjs";
import { selectSticker } from "../state";
import type { StickerMask, StickerStory } from "../types";
import { component, observe } from "../ui-kit";
import "./sticker-overlay.component.css";

export interface StickerOverlayProps {
  imageDataUrl: string;
  imageWidth: number;
  imageHeight: number;
  stickers: StickerMask[];
  selectedStickerId$: Observable<string | null>;
  stories?: Record<string, StickerStory>;
  onSelectSticker?: (id: string) => void;
}

export const StickerOverlayComponent = component((props: StickerOverlayProps) => {
  const { imageDataUrl, imageWidth, imageHeight, stickers, selectedStickerId$, stories = {}, onSelectSticker } = props;

  const viewBox = `0 0 ${imageWidth || 1000} ${imageHeight || 1000}`;

  const handleStickerClick = (id: string) => {
    if (onSelectSticker) {
      onSelectSticker(id);
    } else {
      selectSticker(id);
    }
  };

  return html`
    <div class="sticker-overlay-container">
      <img class="laptop-image" src=${imageDataUrl} alt="Laptop cover" />

      ${svg`
        <svg class="overlay-svg" viewBox=${viewBox} preserveAspectRatio="xMidYMid meet">
          ${stickers.map((sticker, idx) => {
            const hasStory = Boolean(stories[sticker.id]);

            return svg`
              <g
                class="sticker-group"
                role="button"
                tabindex="0"
                aria-pressed=${observe(selectedStickerId$.pipe(map((selectedStickerId) => selectedStickerId === sticker.id)))}
                aria-label=${`Sticker ${idx + 1}${hasStory ? ", story recorded" : ""}`}
                @click=${() => handleStickerClick(sticker.id)}
                @keydown=${(event: KeyboardEvent) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleStickerClick(sticker.id);
                  }
                }}
              >
                <path
                  class=${observe(
                    selectedStickerId$.pipe(
                      map((selectedStickerId) => `sticker-contour-path ${selectedStickerId === sticker.id ? "selected" : ""} ${hasStory ? "has-story" : ""}`),
                    ),
                  )}
                  d=${sticker.svgPath}
                />

                <g class="badge-group" transform=${`translate(${sticker.centroid.x}, ${sticker.centroid.y})`}>
                  <circle class="badge-bg" r="14" />
                  <text class="badge-text" y="4" text-anchor="middle">${hasStory ? "🎙️" : idx + 1}</text>
                </g>
              </g>
            `;
          })}
        </svg>
      `}
    </div>
  `;
});
