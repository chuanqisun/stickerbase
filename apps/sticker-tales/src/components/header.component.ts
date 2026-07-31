import { html } from "lit";
import { map } from "rxjs";
import { apiKeys$ } from "../services/api-keys.service";
import { downloadDbBinaryFile, loadDbFromBinary } from "../services/vector-db.service";
import { currentView$, resetAllData, setApiKeysModalOpen, setView } from "../state";
import type { ViewMode } from "../types";
import { component, observe } from "../ui-kit";
import "./header.component.css";

export const HeaderComponent = component(() => {
  const currentViewObs = currentView$;
  const apiKeysObs = apiKeys$;

  const handleNav = (mode: ViewMode) => {
    setView(mode);
  };

  const handleImportDb = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".bin";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const buf = await file.arrayBuffer();
        await loadDbFromBinary(buf);
        alert(`Successfully imported DB with ${file.size} bytes!`);
      }
    };
    input.click();
  };

  const template = html`
    <header class="app-header">
      <div class="header-brand">
        <h1 class="header-title">🏷️ Sticker Tales</h1>
      </div>

      <nav class="header-nav">
        <button class="nav-btn ${observe(currentViewObs.pipe(map((v) => (v === "upload" ? "active" : ""))))}" @click=${() => handleNav("upload")}>
          📸 Upload & Record
        </button>
        <button class="nav-btn ${observe(currentViewObs.pipe(map((v) => (v === "connections" ? "active" : ""))))}" @click=${() => handleNav("connections")}>
          🔗 My Connections
        </button>
        <button class="nav-btn ${observe(currentViewObs.pipe(map((v) => (v === "all-stories" ? "active" : ""))))}" @click=${() => handleNav("all-stories")}>
          📚 All Stories
        </button>
        <button class="nav-btn ${observe(currentViewObs.pipe(map((v) => (v === "my-stories" ? "active" : ""))))}" @click=${() => handleNav("my-stories")}>
          📝 My Stories
        </button>
      </nav>

      <div class="header-actions">
        ${observe(
          apiKeysObs.pipe(
            map((keys) => {
              const hasKeys = Boolean(keys.geminiApiKey && keys.falApiKey);
              return html`
                <button class="key-status-badge ${hasKeys ? "ok" : "missing"}" @click=${() => setApiKeysModalOpen(true)}>
                  ${hasKeys ? "🔑 API Keys Ready" : "⚠️ Configure API Keys"}
                </button>
              `;
            }),
          ),
        )}

        <button @click=${() => downloadDbBinaryFile()} title="Download current EigenDB index">⬇️ Download DB</button>
        <button @click=${handleImportDb} title="Import an existing .bin database file">⬆️ Import DB</button>
        <button class="danger" @click=${resetAllData} title="Reset local storage and OPFS">🗑️ Reset</button>
      </div>
    </header>
  `;

  return template;
});
