import { html } from "lit";
import { map } from "rxjs";
import { isSearching$, minSimilarity$, queryText$, searchError$, topK$ } from "../state";
import { component, observe } from "../ui-kit";
import "./search-controls.component.css";

export const SearchControlsComponent = component(() => {
  const onTextChange = (e: Event) => {
    const textarea = e.target as HTMLTextAreaElement;
    queryText$.next(textarea.value);
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

  return html`
    <div class="search-controls">
      <div class="query-input-group">
        <textarea
          class="query-textarea"
          placeholder="Describe stickers or laptop aesthetic (e.g. 'anime sticker', 'Rust logo', 'cat on laptop', 'GitHub octocat', 'NASA logo')..."
          .value=${observe(queryText$)}
          @input=${onTextChange}
        ></textarea>
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

        <div class="status-row">
          ${observe(
            searchError$.pipe(
              map((err) =>
                err
                  ? html`<span class="error">⚠️ ${err}</span>`
                  : observe(
                      isSearching$.pipe(
                        map((searching) =>
                          searching
                            ? html`<span>Searching with Gemini embeddings...</span>`
                            : html`<span>Live search active as you type & adjust filters</span>`,
                        ),
                      ),
                    ),
              ),
            ),
          )}
        </div>
      </div>
    </div>
  `;
});
