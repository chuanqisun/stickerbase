import { html } from "lit";
import { ref } from "lit/directives/ref.js";
import { repeat } from "lit/directives/repeat.js";
import { BehaviorSubject, combineLatest, map, tap } from "rxjs";
import { isSearching$, queryText$, searchResults$ } from "../state";
import { component, observe, withEffect } from "../ui-kit";
import { LaptopCard } from "./laptop-card.component";
import "./results-view.component.css";

const RESULTS_BATCH_SIZE = 12;

export const ResultsViewComponent = component(() => {
  const visibleCount$ = new BehaviorSubject(RESULTS_BATCH_SIZE);
  let resultsViewElement: Element | undefined;
  let sentinelElement: Element | undefined;
  let sentinelObserver: IntersectionObserver | undefined;

  const observeSentinel = () => {
    sentinelObserver?.disconnect();
    sentinelObserver = undefined;

    if (!resultsViewElement || !sentinelElement) return;
    sentinelObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && visibleCount$.value < searchResults$.value.length) {
          visibleCount$.next(Math.min(visibleCount$.value + RESULTS_BATCH_SIZE, searchResults$.value.length));
          requestAnimationFrame(observeSentinel);
        }
      },
      { root: resultsViewElement, rootMargin: "600px 0px" },
    );
    sentinelObserver.observe(sentinelElement);
  };

  const onResultsViewRef = (element: Element | undefined) => {
    resultsViewElement = element;
    observeSentinel();
  };

  const onSentinelRef = (element: Element | undefined) => {
    sentinelElement = element;
    observeSentinel();
  };

  const resetVisibleResultsEffect$ = searchResults$.pipe(
    tap(() => {
      visibleCount$.next(RESULTS_BATCH_SIZE);
      requestAnimationFrame(observeSentinel);
    }),
  );

  const state$ = combineLatest([queryText$, isSearching$, searchResults$, visibleCount$]).pipe(
    map(([query, searching, results, visibleCount]) => {
      const trimmedQuery = query.trim();

      if (searching && results.length === 0) {
        return html`
          <div class="empty-state">
            <div class="empty-state-title">Embedding Query...</div>
            <p class="empty-state-text">Fetching embedding vector from Gemini 2 model...</p>
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

      const visibleResults = results.slice(0, visibleCount);
      const hasMoreResults = visibleResults.length < results.length;

      return html`
        <div class="results-summary">
          ${trimmedQuery
            ? `${results.length} laptops: strongest matches first, followed by the remaining database order.`
            : `${results.length} laptops in database order.`}
        </div>
        <div class="results-grid">
          ${repeat(
            visibleResults,
            (group) => group.laptopName,
            (group, index) => LaptopCard({ matchGroup: group, rank: index + 1 }),
          )}
        </div>
        ${hasMoreResults ? html`<div ${ref(onSentinelRef)} class="results-sentinel" aria-hidden="true"></div>` : null}
      `;
    }),
  );

  return withEffect(html`<div ${ref(onResultsViewRef)} class="results-view">${observe(state$)}</div>`, resetVisibleResultsEffect$);
});
