import { html } from "lit";
import { map } from "rxjs";
import { dbState$ } from "../services/vector-db.service";
import { apiKey$ } from "../state";
import { component, observe } from "../ui-kit";
import "./header.component.css";

export const HeaderComponent = component(() => {
  const onKeyInput = (e: Event) => {
    const input = e.target as HTMLInputElement;
    apiKey$.next(input.value.trim());
  };

  const dbStatusTemplate$ = dbState$.pipe(
    map((db) => {
      switch (db.status) {
        case "uninitialized":
          return html`<span class="db-status">Initializing Vector DB...</span>`;
        case "downloading":
          return html`
            <div class="db-status" title="Downloading vectors binary file">
              <span>Downloading DB (${db.progress}%)</span>
              <div class="db-progress-bar">
                <div class="db-progress-fill" style="width: ${db.progress}%"></div>
              </div>
            </div>
          `;
        case "importing":
          return html`<span class="db-status">Loading vectors into WASM...</span>`;
        case "ready":
          return null;
        case "error":
          return html`<span class="status-badge warn" title=${db.errorMessage || "Error loading DB"}>DB Error</span>`;
      }
    }),
  );

  const keyBadge$ = apiKey$.pipe(map((key) => (key ? null : html`<span class="status-badge warn">API Key Required</span>`)));

  return html`
    <header class="app-header">
      <div class="header-brand">
        <h1 class="header-title">Stickertop DB</h1>
      </div>

      <div class="header-controls">
        ${observe(dbStatusTemplate$)}

        <div class="api-key-container">
          <label class="api-key-label" for="gemini-api-key">Gemini API Key</label>
          <input
            id="gemini-api-key"
            type="password"
            class="api-key-input"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
            data-1p-ignore
            data-lpignore="true"
            data-form-type="other"
            name="gemini-api-key-no-autofill"
            placeholder="Enter Gemini API Key..."
            .value=${observe(apiKey$)}
            @input=${onKeyInput}
          />
        </div>

        ${observe(keyBadge$)}
      </div>
    </header>
  `;
});
