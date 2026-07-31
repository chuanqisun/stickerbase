import { html } from "lit";
import { map } from "rxjs";
import { fileToDataUrl } from "../services/sam.service";
import { resetUploadState, selectedStickerId$, setUploadImageData, startSamScanning, submitLaptopStory, uploadState$ } from "../state";
import { component, observe } from "../ui-kit";
import { AudioRecorderComponent } from "./audio-recorder.component";
import { StickerOverlayComponent } from "./sticker-overlay.component";
import "./upload-view.component.css";

export const UploadViewComponent = component(() => {
  const uploadStateObs = uploadState$;
  const selectedStickerIdObs = selectedStickerId$;
  let laptopTitle = "My Laptop Story";

  const handleFileChange = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      const dataUrl = await fileToDataUrl(file);
      setUploadImageData(dataUrl);
      startSamScanning();
    }
  };

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (file && file.type.startsWith("image/")) {
      const dataUrl = await fileToDataUrl(file);
      setUploadImageData(dataUrl);
      startSamScanning();
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
  };

  const handleSubmit = async () => {
    await submitLaptopStory(laptopTitle);
  };

  return html`
    <div class="upload-view-container">
      ${observe(
        uploadStateObs.pipe(
          map((state) => {
            if (!state.imageDataUrl) {
              return html`
                <div
                  class="dropzone-card"
                  @drop=${handleDrop}
                  @dragover=${handleDragOver}
                  @click=${() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = "image/*";
                    input.onchange = handleFileChange;
                    input.click();
                  }}
                >
                  <div class="dropzone-icon">💻🏷️</div>
                  <h2>Upload Laptop Cover Photo</h2>
                  <p>Drag and drop a photo of your laptop with stickers, or click to choose file.</p>
                  <button class="primary">Choose Photo</button>
                </div>
              `;
            }

            if (state.isScanning) {
              return html`
                <div class="scanning-overlay">
                  <div class="spinner"></div>
                  <h3>Scanning laptop photo with SAM 3.1...</h3>
                  <p>${state.scanProgress || "Segmenting stickers..."}</p>
                </div>
              `;
            }

            if (state.isSubmitting) {
              return html`
                <div class="scanning-overlay">
                  <div class="spinner"></div>
                  <h3>Submitting Story...</h3>
                  <p>${state.submitProgress || "Processing..."}</p>
                </div>
              `;
            }

            return html`
              ${state.error ? html`<div class="error-banner">${state.error}</div>` : html``}

              <div class="workspace-layout">
                <div class="preview-section">
                  ${StickerOverlayComponent({
                    imageDataUrl: state.imageDataUrl,
                    imageWidth: state.imageWidth,
                    imageHeight: state.imageHeight,
                    stickers: state.stickers,
                    selectedStickerId$: selectedStickerIdObs,
                    stories: state.stories,
                  })}
                </div>

                <div class="sidebar-section">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h3>Laptop Story Info</h3>
                    <button class="danger" @click=${resetUploadState}>Change Photo</button>
                  </div>

                  <div class="form-group">
                    <label for="laptop-title">Laptop Title</label>
                    <input id="laptop-title" type="text" .value=${laptopTitle} @input=${(e: Event) => (laptopTitle = (e.target as HTMLInputElement).value)} />
                  </div>

                  <h4>Detected Stickers (${state.stickers.length})</h4>

                  ${observe(
                    selectedStickerIdObs.pipe(
                      map((selectedId) => {
                        const selectedSticker = state.stickers.find((s) => s.id === selectedId);
                        if (!selectedSticker) {
                          return html`<p style="color: var(--color-text-muted)">Click on any sticker on the laptop to record its story!</p>`;
                        }

                        return AudioRecorderComponent({
                          sticker: selectedSticker,
                          existingStory: state.stories[selectedSticker.id],
                        });
                      }),
                    ),
                  )}

                  <div style="margin-top: auto; padding-top: var(--spacing-md); border-top: 1px solid var(--color-border);">
                    <button class="primary" style="width: 100%; justify-content: center;" @click=${handleSubmit}>
                      🚀 Submit Laptop Story (${Object.keys(state.stories).length} Recorded)
                    </button>
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
