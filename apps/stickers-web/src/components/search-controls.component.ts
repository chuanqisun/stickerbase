import { html } from "lit";
import { combineLatest, map } from "rxjs";
import { isSearching$, minSimilarity$, queryText$, searchError$, searchResults$, topK$ } from "../state";
import { component, observe } from "../ui-kit";
import "./search-controls.component.css";

export const SearchControlsComponent = component(() => {
  const onTextChange = (e: Event) => {
    const input = e.target as HTMLInputElement;
    queryText$.next(input.value);
  };

  const onTopKChange = (e: Event) => {
    const input = e.target as HTMLInputElement;
    topK$.next(parseInt(input.value, 10));
  };

  const onMinSimChange = (e: Event) => {
    const input = e.target as HTMLInputElement;
    minSimilarity$.next(parseFloat(input.value));
  };

  const topKStr$ = topK$.pipe(map((v) => String(v)));
  const minSimStr$ = minSimilarity$.pipe(map((v) => String(v)));
  const minSimPct$ = minSimilarity$.pipe(map((v) => `${(v * 100).toFixed(0)}%`));
  const statusTemplate$ = combineLatest([searchError$, isSearching$, searchResults$]).pipe(
    map(([error, searching, results]) => {
      if (error) return html`<span class="error">⚠️ ${error}</span>`;
      if (searching) return html`<span>Search...</span>`;

      const matchedResults = results.filter((result) => result.stickers.length > 0);
      const stickerCount = matchedResults.reduce((count, result) => count + result.stickers.length, 0);
      return stickerCount > 0
        ? html`<span>Found ${stickerCount} stickers on ${matchedResults.length} laptops</span>`
        : html`<span>${results.length} laptops</span>`;
    }),
  );

  return html`
    <div class="search-controls">
      <div class="query-input-group">
        <input class="query-input" type="text" placeholder="Octocat, Penguin, Docker, Rust" .value=${observe(queryText$)} @input=${onTextChange} />
      </div>

      <div class="controls-row">
        <div class="sliders-group">
          <div class="slider-control">
            <label for="top-k-slider">Top Laptops (K):</label>
            <input id="top-k-slider" type="range" min="1" max="100" .value=${observe(topKStr$)} @input=${onTopKChange} />
            <span class="slider-val">${observe(topK$)}</span>
          </div>

          <div class="slider-control">
            <label for="min-sim-slider">Min Similarity:</label>
            <input id="min-sim-slider" type="range" min="0" max="1" step="0.01" .value=${observe(minSimStr$)} @input=${onMinSimChange} />
            <span class="slider-val">${observe(minSimPct$)}</span>
          </div>
        </div>

        <div class="status-row">${observe(statusTemplate$)}</div>
      </div>
    </div>
  `;
});
