import { BehaviorSubject } from "rxjs";
import type { ApiKeys } from "../types";

const GEMINI_KEY = "sticker_tales_gemini_api_key";
const FAL_KEY = "sticker_tales_fal_api_key";

function loadSavedKeys(): ApiKeys {
  return {
    geminiApiKey: localStorage.getItem(GEMINI_KEY) || "",
    falApiKey: localStorage.getItem(FAL_KEY) || "",
  };
}

export const apiKeys$ = new BehaviorSubject<ApiKeys>(loadSavedKeys());

export function saveApiKeys(keys: ApiKeys): void {
  localStorage.setItem(GEMINI_KEY, keys.geminiApiKey.trim());
  localStorage.setItem(FAL_KEY, keys.falApiKey.trim());
  apiKeys$.next({
    geminiApiKey: keys.geminiApiKey.trim(),
    falApiKey: keys.falApiKey.trim(),
  });
}

export function getApiKeys(): ApiKeys {
  return apiKeys$.value;
}

export function hasValidApiKeys(): boolean {
  const keys = apiKeys$.value;
  return Boolean(keys.geminiApiKey.trim() && keys.falApiKey.trim());
}
