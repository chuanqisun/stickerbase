import { html } from "lit";
import { BehaviorSubject, distinctUntilChanged, map } from "rxjs";
import { submissions$ } from "../state";
import type { LaptopSubmission } from "../types";
import { component, observe } from "../ui-kit";
import { StickerOverlayComponent } from "./sticker-overlay.component";
import "./all-stories-view.component.css";

interface LaptopDetailsState {
  submission: LaptopSubmission;
  activeStickerId: string | null;
}

export const AllStoriesViewComponent = component(() => {
  const submissionsObs = submissions$;
  const detailsState$ = new BehaviorSubject<LaptopDetailsState | null>(null);
  const activeStickerId$ = detailsState$.pipe(
    map((details) => details?.activeStickerId ?? null),
    distinctUntilChanged(),
  );

  const handleSelectLaptop = (sub: LaptopSubmission) => {
    const firstRecordedId = Object.keys(sub.stories)[0] || sub.stickers[0]?.id || null;
    detailsState$.next({ submission: sub, activeStickerId: firstRecordedId });
  };

  const handleSelectSticker = (stickerId: string) => {
    const details = detailsState$.value;
    if (details) {
      detailsState$.next({ ...details, activeStickerId: stickerId });
    }
  };

  const handleCloseModal = () => {
    detailsState$.next(null);
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
                    <button type="button" class="laptop-story-card" @click=${() => handleSelectLaptop(sub)}>
                      <img class="laptop-thumb" src=${sub.laptopImageDataUrl} alt=${sub.title} />
                      <strong>💻 ${sub.title}</strong>
                      <small style="color: var(--color-text-muted)"> ${sub.stickers.length} Stickers detected • 🎙️ ${storyCount} Audio Stories </small>
                    </button>
                  `;
                })}
              </div>
            `;
          }),
        ),
      )}
      ${observe(
        detailsState$.pipe(
          map((details) => {
            if (!details) return html``;

            const { submission, activeStickerId } = details;
            const activeSticker = submission.stickers.find((sticker) => sticker.id === activeStickerId);
            const activeStory = activeStickerId ? submission.stories[activeStickerId] : undefined;

            return html`
              <div
                class="laptop-details-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="laptop-details-title"
                @click=${handleCloseModal}
                @keydown=${(event: KeyboardEvent) => {
                  if (event.key === "Escape") handleCloseModal();
                }}
              >
                <div class="details-modal-box" @click=${(event: Event) => event.stopPropagation()}>
                  <div class="details-modal-header">
                    <h2 id="laptop-details-title">💻 ${submission.title}</h2>
                    <button type="button" @click=${handleCloseModal}>Close</button>
                  </div>

                  <div class="details-layout">
                    <div class="details-preview">
                      ${StickerOverlayComponent({
                        imageDataUrl: submission.laptopImageDataUrl,
                        imageWidth: submission.imageWidth,
                        imageHeight: submission.imageHeight,
                        stickers: submission.stickers,
                        selectedStickerId$: activeStickerId$,
                        stories: submission.stories,
                        onSelectSticker: handleSelectSticker,
                      })}
                    </div>

                    <div class="details-sidebar">
                      <div>
                        <h3>Sticker Stories</h3>
                        <p>Select a sticker on the laptop to hear its recorded story.</p>
                      </div>

                      ${activeSticker
                        ? html`
                            <div class="selected-sticker-details">
                              <img class="selected-sticker-image" src=${activeSticker.cropDataUrl} alt="Selected sticker" />
                              <div>
                                <strong>${activeStory?.title || "Selected Sticker"}</strong>
                                <small>ID: ${activeSticker.id}</small>
                              </div>
                            </div>

                            ${activeStory
                              ? html`
                                  <div class="story-playback">
                                    <audio controls preload="metadata" src=${activeStory.audioDataUrl}></audio>
                                  </div>
                                `
                              : html`<p class="no-story-message">No story was recorded for this sticker.</p>`}
                          `
                        : html`<p class="no-story-message">Select a sticker to view its story.</p>`}
                    </div>
                  </div>
                </div>
              </div>
            `;
          }),
        ),
      )}
    </div>
  `;
});
