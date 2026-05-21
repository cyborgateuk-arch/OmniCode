import { APIKEY_PROVIDERS, SEARCH_PROVIDERS } from "./src/shared/constants/providers.ts";

const apiKeys = Object.keys(APIKEY_PROVIDERS);
console.log(
  "Overlap:",
  Object.keys(SEARCH_PROVIDERS).filter((k) => apiKeys.includes(k))
);
console.log("Is perplexity-search in APIKEY?", "perplexity-search" in APIKEY_PROVIDERS);
