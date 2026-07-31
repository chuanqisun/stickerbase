import { html } from "lit";
import { selectSticker } from "../state";
import type { StickerMask, StickerStory } from "../types";
import { component } from "../ui-kit";
import "./sticker-overlay.component.css";

export interface StickerOverlayProps {
  imageDataUrl: string;
  imageWidth: number;
  imageHeight: number;
  stickers: StickerMask[];
  selectedStickerId: string | null;
  stories?: Record<string, StickerStory>;
  onSelectSticker?: (id: string) => void;
}

export const StickerOverlayComponent = component((props: StickerOverlayProps) => {
  const { imageDataUrl, imageWidth, imageHeight, stickers, selectedStickerId, stories = {}, onSelectSticker } = props;

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

      <svg class="overlay-svg" viewBox=${viewBox} preserveAspectRatio="xMidYMid meet">
        ${stickers.map((sticker, idx) => {
          const isSelected = sticker.id === selectedStickerId;
          const hasStory = Boolean(stories[sticker.id]);

          // Rect path or polygon
          const { x, y, width, height } = sticker.box;

          return html`
            <g class="sticker-group" @click=${() => handleStickerClick(sticker.id)}>
              <rect
                class="sticker-mask-shape ${isSelected ? "selected" : ""} ${hasStory ? "has-story" : ""}"
                x=${x}
                y=${y}
                width=${width}
                height=${height}
                rx="4"
              />

              <rect
                x=${x + 2}
                y=${y + 2}
                width="24"
                height="22"
                rx="3"
                fill=${hasStory ? "#2e7d32" : isSelected ? "#000000" : "#ffffff"}
                stroke="#000"
                stroke-width="1"
              />

              <text class="sticker-badge" x=${x + 14} y=${y + 17} text-anchor="middle" fill=${hasStory || isSelected ? "#ffffff" : "#000000"}>
                ${hasStory ? "🎙️" : idx + 1}
              </text>
            </g>
          `;
        })}
      </svg>
    </div>
  `;
});
