import { html } from "lit";
import { map } from "rxjs";
import { submissions$ } from "../state";
import type { LaptopSubmission, StickerMask, StickerStory } from "../types";
import { component, observe } from "../ui-kit";
import "./all-stories-view.component.css";

export const AllStoriesViewComponent = component(() => {
  const submissionsObs = submissions$;
  let selectedSubmission: LaptopSubmission | null = null;
  let activeStickerId: string | null = null;

  const handleSelectLaptop = (sub: LaptopSubmission) => {
    selectedSubmission = sub;
    const firstRecordedId = Object.keys(sub.stories)[0] || sub.stickers[0]?.id || null;
    activeStickerId = firstRecordedId;
  };

  const handleCloseModal = () => {
    selectedSubmission = null;
    activeStickerId = null;
  };

  return html`
    <div class="all-stories-container">
      <div>
        <h2>📚 All Sticker Stories</h2>
        <p>Browse laptop covers and click on any sticker to hear its story!</p>
      </div>

      ${observe(
        submissionsObs.pipe(
          map((subs: LaptopSubmission[]) => {
            if (subs.length === 0) {
              return html`
                <div class="empty-state">
                  <h3>No stories uploaded yet</h3>
                  <p>Upload a photo of your laptop to add the first sticker story!</p>
                </div>
              `;
            }

            return html`
              <div class="stories-grid">
                ${subs.map((sub: LaptopSubmission) => {
                  const storyCount = Object.keys(sub.stories).length;
                  return html`
                    <div class="laptop-story-card" @click=${() => handleSelectLaptop(sub)}>
                      <img class="laptop-thumb" src=${sub.laptopImageDataUrl} alt=${sub.title} />
                      <strong>💻 ${sub.title}</strong>
                      <small style="color: var(--color-text-muted)"> ${sub.stickers.length} Stickers detected • 🎙️ ${storyCount} Audio Stories </small>
                    </div>
                  `;
                })}
              </div>
            `;
          }),
        ),
      )}
      ${selectedSubmission
        ? (() => {
            const currentSub = selectedSubmission as LaptopSubmission;
            return html`
              <div class="laptop-details-modal" @click=${handleCloseModal}>
                <div class="details-modal-box" @click=${(e: Event) => e.stopPropagation()}>
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h2>💻 ${currentSub.title}</h2>
                    <button @click=${handleCloseModal}>✕ Close</button>
                  </div>

                  <div class="details-layout">
                    <div class="details-preview">
                      <div style="position: relative; max-width: 100%; max-height: 100%;">
                        <img
                          src=${currentSub.laptopImageDataUrl}
                          alt=${currentSub.title}
                          style="width: 100%; height: auto; border-radius: var(--border-radius);"
                        />

                        <svg
                          style="position: absolute; top:0; left:0; width:100%; height:100%;"
                          viewBox="0 0 ${currentSub.imageWidth || 1000} ${currentSub.imageHeight || 1000}"
                        >
                          ${currentSub.stickers.map((sticker: StickerMask) => {
                            const isSel = activeStickerId === sticker.id;
                            const hasStory = Boolean(currentSub.stories[sticker.id]);
                            const { x, y, width, height } = sticker.box;

                            return html`
                              <g style="cursor: pointer;" @click=${() => (activeStickerId = sticker.id)}>
                                <rect
                                  x=${x}
                                  y=${y}
                                  width=${width}
                                  height=${height}
                                  rx="4"
                                  fill=${isSel ? "rgba(255, 221, 0, 0.4)" : "rgba(255, 255, 255, 0.1)"}
                                  stroke=${hasStory ? "#2e7d32" : "#000000"}
                                  stroke-width=${isSel ? "4" : "2"}
                                />
                              </g>
                            `;
                          })}
                        </svg>
                      </div>
                    </div>

                    <div class="details-sidebar">
                      <h3>Sticker Stories</h3>

                      ${activeStickerId
                        ? (() => {
                            const targetStickerId = activeStickerId as string;
                            const sticker = currentSub.stickers.find((s: StickerMask) => s.id === targetStickerId);
                            const story = currentSub.stories[targetStickerId] as StickerStory | undefined;

                            return html`
                              <div style="display: flex; gap: var(--spacing-sm); align-items: center;">
                                ${sticker
                                  ? html`<img
                                      src=${sticker.cropDataUrl}
                                      style="width: 60px; height: 60px; object-fit: contain; border: 1px solid var(--color-border);"
                                    />`
                                  : html``}
                                <div>
                                  <strong>${story?.title || "Selected Sticker"}</strong>
                                  <br />
                                  <small style="color: var(--color-text-muted)">ID: ${targetStickerId}</small>
                                </div>
                              </div>

                              ${story
                                ? html`
                                    <div style="margin-top: var(--spacing-sm);">
                                      <audio controls autoplay src=${story.audioDataUrl}></audio>
                                    </div>
                                  `
                                : html`<p style="color: var(--color-text-muted)">No story recorded for this sticker.</p>`}
                            `;
                          })()
                        : html`<p style="color: var(--color-text-muted)">Click a sticker to play its story!</p>`}
                    </div>
                  </div>
                </div>
              </div>
            `;
          })()
        : html``}
    </div>
  `;
});
