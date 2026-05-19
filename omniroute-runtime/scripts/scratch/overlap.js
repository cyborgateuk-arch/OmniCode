import {
  APIKEY_PROVIDERS,
  SEARCH_PROVIDERS,
  AUDIO_ONLY_PROVIDERS,
  WEB_COOKIE_PROVIDERS,
} from "./src/shared/constants/providers.ts";

const apiKeys = Object.keys(APIKEY_PROVIDERS);
console.log("Searching overlap in APIKEY_PROVIDERS:");
console.log(
  "Search overlap:",
  Object.keys(SEARCH_PROVIDERS).filter((k) => apiKeys.includes(k))
);
console.log(
  "Audio overlap:",
  Object.keys(AUDIO_ONLY_PROVIDERS).filter((k) => apiKeys.includes(k))
);
console.log(
  "Web Cookie overlap:",
  Object.keys(WEB_COOKIE_PROVIDERS).filter((k) => apiKeys.includes(k))
);
