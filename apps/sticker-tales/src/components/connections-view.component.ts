import { html } from "lit";
import { map } from "rxjs";
import { connections$, setView } from "../state";
import { component, observe } from "../ui-kit";
import "./connections-view.component.css";

export const ConnectionsViewComponent = component(() => {
  const connectionsObs = connections$;

  return html`
    <div class="connections-view-container">
      <div class="connections-header">
        <h2>🔗 My Connections</h2>
        <p>Visually similar stickers detected from other laptops in the database. Click and listen to the stories behind these stickers!</p>
      </div>

      ${observe(
        connectionsObs.pipe(
          map((items) => {
            if (items.length === 0) {
              return html`
                <div class="empty-state">
                  <h3>No sticker connections found yet</h3>
                  <p>Submit a laptop story or upload more laptops to discover matching sticker stories!</p>
                  <button class="primary" @click=${() => setView("upload")}>📸 Submit A Story</button>
                </div>
              `;
            }

            return html`
              <div class="connections-grid">
                ${items.map((item) => {
                  const matchPct = Math.round(item.similarity * 100);

                  return html`
                    <div class="connection-card">
                      <div class="connection-comparison">
                        <div class="sticker-compare-box">
                          <img class="compare-crop" src=${item.targetStickerCropDataUrl} alt="Similar sticker" />
                          <small>Matched Sticker</small>
                        </div>

                        <div class="match-badge">${matchPct}% Match</div>
                      </div>

                      <div class="connection-meta">
                        <strong>💻 ${item.targetLaptopTitle}</strong>
                        <span>${item.story?.title || "Sticker Story"}</span>
                      </div>

                      <div class="audio-player-box">
                        ${item.story?.audioDataUrl
                          ? html`<audio controls src=${item.story.audioDataUrl}></audio>`
                          : html`<small style="color: var(--color-text-muted)">No audio recording attached to this sticker yet.</small>`}
                      </div>
                    </div>
                  `;
                })}
              </div>
            `;
          }),
        ),
      )}
    </div>
  `;
});
