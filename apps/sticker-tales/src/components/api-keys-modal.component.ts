import { html } from "lit";
import { map } from "rxjs";
import { apiKeys$, saveApiKeys } from "../services/api-keys.service";
import { isApiKeysModalOpen$, setApiKeysModalOpen } from "../state";
import { component, observe } from "../ui-kit";
import "./api-keys-modal.component.css";

export const ApiKeysModalComponent = component(() => {
  const isOpen$ = isApiKeysModalOpen$;
  const keys$ = apiKeys$;

  let geminiInput = keys$.value.geminiApiKey;
  let falInput = keys$.value.falApiKey;

  const handleSave = (e: Event) => {
    e.preventDefault();
    saveApiKeys({
      geminiApiKey: geminiInput,
      falApiKey: falInput,
    });
    setApiKeysModalOpen(false);
  };

  return html`
    ${observe(
      isOpen$.pipe(
        map((isOpen) => {
          if (!isOpen) return html``;

          return html`
            <div class="modal-backdrop" @click=${() => setApiKeysModalOpen(false)}>
              <div class="modal-content" @click=${(e: Event) => e.stopPropagation()}>
                <div class="modal-header">
                  <h2 class="modal-title">🔑 Configure API Keys</h2>
                  <button class="close-btn" @click=${() => setApiKeysModalOpen(false)}>✕</button>
                </div>

                <form class="modal-body" @submit=${handleSave}>
                  <div class="form-group">
                    <label for="gemini-key">Gemini API Key (for Gemini Embedding 2)</label>
                    <input
                      id="gemini-key"
                      type="password"
                      placeholder="AIzaSy..."
                      .value=${geminiInput}
                      @input=${(e: Event) => (geminiInput = (e.target as HTMLInputElement).value)}
                      required
                    />
                    <small style="color: var(--color-text-muted)"> Get your key from Google AI Studio (ai.google.dev) </small>
                  </div>

                  <div class="form-group">
                    <label for="fal-key">fal.ai API Key (for SAM 3.1 Segmentation)</label>
                    <input
                      id="fal-key"
                      type="password"
                      placeholder="fal_key_..."
                      .value=${falInput}
                      @input=${(e: Event) => (falInput = (e.target as HTMLInputElement).value)}
                      required
                    />
                    <small style="color: var(--color-text-muted)"> Get your key from fal.ai dashboard </small>
                  </div>

                  <div class="modal-footer">
                    <button type="button" @click=${() => setApiKeysModalOpen(false)}>Cancel</button>
                    <button type="submit" class="primary">Save Keys</button>
                  </div>
                </form>
              </div>
            </div>
          `;
        }),
      ),
    )}
  `;
});
