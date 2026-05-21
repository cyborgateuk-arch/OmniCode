import {
  APIKEY_PROVIDERS,
  SEARCH_PROVIDERS,
  AUDIO_ONLY_PROVIDERS,
  WEB_COOKIE_PROVIDERS,
} from "./src/shared/constants/providers";

console.log("SEARCH_PROVIDERS", !!SEARCH_PROVIDERS, Object.keys(SEARCH_PROVIDERS || {}));
console.log("AUDIO_ONLY", !!AUDIO_ONLY_PROVIDERS);
console.log("WEB_COOKIE", !!WEB_COOKIE_PROVIDERS);

// Determine auth type group for a provider id
function getAuthGroup(providerId: string) {
  if (WEB_COOKIE_PROVIDERS && WEB_COOKIE_PROVIDERS[providerId]) return "web-cookie";
  if (SEARCH_PROVIDERS && SEARCH_PROVIDERS[providerId]) return "search";
  if (AUDIO_ONLY_PROVIDERS && AUDIO_ONLY_PROVIDERS[providerId]) return "audio";
  if (APIKEY_PROVIDERS && APIKEY_PROVIDERS[providerId]) return "apikey";
  return "apikey";
}

console.log("grok-web returns:", getAuthGroup("grok-web"));
console.log("perplexity-search returns:", getAuthGroup("perplexity-search"));
console.log("openai returns:", getAuthGroup("openai"));
