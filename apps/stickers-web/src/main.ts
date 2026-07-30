import { html, render } from "lit";
import { catchError, debounceTime, distinctUntilChanged, filter, from, merge, switchMap, tap } from "rxjs";
import { HeaderComponent } from "./components/header.component";
import { ResultsViewComponent } from "./components/results-view.component";
import { SearchControlsComponent } from "./components/search-controls.component";
import { embedQueryText } from "./services/gemini.service";
import { dbState$, getLaptopNamesInDbOrder, initVectorDb, queryVectorDb } from "./services/vector-db.service";
import {
  apiKey$,
  appendLaptopsInDbOrder,
  groupResultsByLaptop,
  isSearching$,
  minSimilarity$,
  queryText$,
  searchError$,
  searchResults$,
  syncQueryTextRoute,
  topK$,
} from "./state";
import "./style.css";
import { component, withEffect } from "./ui-kit";

// Cache latest query vector so slider adjustments re-query instantaneously without re-calling Gemini API
let cachedQueryText = "";
let cachedQueryVector: number[] | null = null;
let latestSearchRequestId = 0;

async function executeSearch(): Promise<void> {
  const requestId = ++latestSearchRequestId;
  const apiKey = apiKey$.value.trim();
  const queryText = queryText$.value.trim();
  const topK = topK$.value;
  const minSimilarity = minSimilarity$.value;
  const dbState = dbState$.value;

  if (dbState.status !== "ready") {
    isSearching$.next(false);
    searchError$.next("Vector DB is still loading...");
    searchResults$.next([]);
    return;
  }

  const laptopNames = getLaptopNamesInDbOrder();

  if (!queryText) {
    isSearching$.next(false);
    searchError$.next(null);
    searchResults$.next(appendLaptopsInDbOrder([], laptopNames));
    return;
  }

  if (!apiKey) {
    isSearching$.next(false);
    searchError$.next("Gemini API key is required");
    searchResults$.next(appendLaptopsInDbOrder([], laptopNames));
    return;
  }

  try {
    isSearching$.next(true);
    searchError$.next(null);

    let vector: number[];
    if (queryText === cachedQueryText && cachedQueryVector) {
      vector = cachedQueryVector;
    } else {
      vector = await embedQueryText(apiKey, queryText);
      cachedQueryText = queryText;
      cachedQueryVector = vector;
    }

    if (requestId !== latestSearchRequestId) return;

    // Retrieve enough raw matches to group into topK laptop images
    const rawLimit = Math.max(100, topK * 15);
    const rawItems = queryVectorDb(vector, rawLimit, minSimilarity);

    const grouped = groupResultsByLaptop(rawItems, topK, minSimilarity);
    searchResults$.next(appendLaptopsInDbOrder(grouped, laptopNames));
  } catch (err: unknown) {
    if (requestId !== latestSearchRequestId) return;
    const errorMsg = err instanceof Error ? err.message : String(err);
    searchError$.next(errorMsg);
  } finally {
    if (requestId === latestSearchRequestId) {
      isSearching$.next(false);
    }
  }
}

// Main App Root Component
const App = component(() => {
  // RxJS pipeline reacting to live user inputs
  const queryDebounced$ = queryText$.pipe(debounceTime(300), distinctUntilChanged(), tap(syncQueryTextRoute));

  const searchTrigger$ = merge(queryDebounced$, topK$, minSimilarity$, dbState$.pipe(filter((s) => s.status === "ready")));

  const searchEffect$ = searchTrigger$.pipe(
    switchMap(() => from(executeSearch())),
    catchError((err, caught) => {
      console.error("Search effect error:", err);
      return caught;
    }),
  );

  // Initialize Vector DB on app load
  const dbInitEffect$ = from(initVectorDb()).pipe(
    tap({
      error: (err) => console.error("Failed to initialize vector database:", err),
    }),
    catchError((_, caught) => caught),
  );

  const combinedEffects$ = merge(searchEffect$, dbInitEffect$);

  const template = html`
    <div id="app">
      ${HeaderComponent()}
      <main class="main-layout">${SearchControlsComponent()} ${ResultsViewComponent()}</main>
    </div>
  `;

  return withEffect(template, combinedEffects$);
});

// Mount application into DOM
const rootEl = document.getElementById("app") || document.body;
render(App(), rootEl);
