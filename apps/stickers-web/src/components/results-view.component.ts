import { html } from "lit";
import { combineLatest, map } from "rxjs";
import { apiKey$, isSearching$, queryText$, searchResults$ } from "../state";
import { component, observe } from "../ui-kit";
import { LaptopCard } from "./laptop-card.component";
import "./results-view.component.css";

export const ResultsViewComponent = component(() => {
  const state$ = combineLatest([apiKey$, queryText$, isSearching$, searchResults$]).pipe(
    map(([key, query, searching, results]) => {
      const hasKey = key.trim().length > 0;
      const trimmedQuery = query.trim();

      if (!hasKey) {
        return html`
          <div class="empty-state">
            <div class="empty-state-title">API Key Required</div>
            <p class="empty-state-text">Please enter your Gemini API Key in the header bar above to generate query embeddings.</p>
          </div>
        `;
      }

      if (searching && results.length === 0) {
        return html`
          <div class="empty-state">
            <div class="empty-state-title">Embedding Query...</div>
            <p class="empty-state-text">Fetching embedding vector from Gemini 2 model...</p>
          </div>
        `;
      }

      if (trimmedQuery.length === 0) {
        return html`
          <div class="empty-state">
            <div class="empty-state-title">Search Laptop Stickers</div>
            <p class="empty-state-text">Type any description in the prompt box above to find matching laptop sticker images in real time.</p>
          </div>
        `;
      }

      if (results.length === 0) {
        return html`
          <div class="empty-state">
            <div class="empty-state-title">No Matches Found</div>
            <p class="empty-state-text">
              No laptop sticker matches found above the minimum similarity threshold. Try lowering the similarity threshold or refining your prompt.
            </p>
          </div>
        `;
      }

      return html`
        <div class="results-summary">
          Found ${results.length} matching laptop ${results.length === 1 ? "image" : "images"} sorted by highest sticker similarity match score:
        </div>
        <div class="results-grid">${results.map((group, idx) => LaptopCard({ matchGroup: group, rank: idx + 1 }))}</div>
      `;
    }),
  );

  return html` <div class="results-view">${observe(state$)}</div> `;
});
