"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";

const SearchForm = dynamic(() => import("./components/SearchForm"), {
  ssr: false,
});
const SearchHistory = dynamic(() => import("./components/SearchHistory"), {
  ssr: false,
});
const ResultsPanel = dynamic(() => import("./components/ResultsPanel"), {
  ssr: false,
});
const ProviderComparison = dynamic(() => import("./components/ProviderComparison"), { ssr: false });
const RerankPanel = dynamic(() => import("./components/RerankPanel"), {
  ssr: false,
});

import type { SearchFormData } from "./components/SearchForm";
import type { CompareResult } from "./components/ProviderComparison";

interface SearchProvider {
  id: string;
  name: string;
  status: "active" | "no_credentials";
  cost_per_query: number;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  score?: number;
}

interface SearchResponse {
  id: string;
  provider: string;
  query: string;
  answer?: string;
  results: SearchResult[];
  cached: boolean;
  usage: {
    queries_used: number;
    search_cost_usd: number;
  };
  metrics: {
    response_time_ms: number;
    upstream_latency_ms: number;
    total_results_available: number | null;
  };
}

export default function SearchToolsClient() {
  const t = useTranslations("search");
  const [providers, setProviders] = useState<SearchProvider[]>([]);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [rawJson, setRawJson] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusCode, setStatusCode] = useState(0);
  const [duration, setDuration] = useState(0);
  const [lastQuery, setLastQuery] = useState<SearchFormData | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [showCompare, setShowCompare] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareResults, setCompareResults] = useState<CompareResult[]>([]);
  const [initialCompareResult, setInitialCompareResult] = useState<CompareResult | null>(null);
  const [showRerank, setShowRerank] = useState(false);

  useEffect(() => {
    fetch("/api/search/providers")
      .then((res) => res.json())
      .then((data) => setProviders(data.providers || []))
      .catch(() => {});
  }, []);

  const handleSearch = async (formData: SearchFormData) => {
    setLoading(true);
    setError("");
    setResponse(null);
    setRawJson("");
    setStatusCode(0);
    setShowCompare(false);
    setShowRerank(false);
    setCompareResults([]);

    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const start = Date.now();

    try {
      const body: any = { ...formData };
      if (!body.provider) delete body.provider;

      const res = await fetch("/api/v1/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      setDuration(Date.now() - start);
      setStatusCode(res.status);

      const data = await res.json();
      setRawJson(JSON.stringify(data, null, 2));
      setLastQuery(formData);

      if (res.ok) {
        setResponse(data);
      } else {
        setError(data.error?.message || data.error || `Error ${res.status}`);
      }
    } catch (err: any) {
      setDuration(Date.now() - start);
      if (err.name === "AbortError") {
        setError(t("requestTimedOut", { seconds: 15 }));
      } else {
        setError(err?.message || t("networkError"));
      }
    } finally {
      setLoading(false);
      clearTimeout(timeout);
    }
  };

  const handleCompare = async () => {
    if (!response || !lastQuery) return;

    const usedProvider = response.provider;
    const otherProviders = providers
      .filter((p) => p.status === "active" && p.id !== usedProvider)
      .map((p) => p.id);

    if (otherProviders.length === 0) return;

    const initial: CompareResult = {
      provider: usedProvider,
      latency: response.metrics.response_time_ms,
      cost: response.usage.search_cost_usd,
      resultCount: response.results.length,
      responseSize: rawJson.length,
      urls: response.results.map((r) => r.url),
    };
    setInitialCompareResult(initial);
    setShowCompare(true);
    setCompareLoading(true);

    const promises = otherProviders.map(async (providerId) => {
      const start = Date.now();
      try {
        const res = await fetch("/api/v1/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...lastQuery, provider: providerId }),
        });
        const data = await res.json();
        const elapsed = Date.now() - start;

        if (!res.ok) {
          return {
            provider: providerId,
            latency: elapsed,
            cost: 0,
            resultCount: 0,
            responseSize: 0,
            urls: [],
            error: data.error?.message || `Error ${res.status}`,
          } as CompareResult;
        }

        const respJson = JSON.stringify(data);
        return {
          provider: providerId,
          latency: data.metrics?.response_time_ms || elapsed,
          cost: data.usage?.search_cost_usd || 0,
          resultCount: data.results?.length || 0,
          responseSize: respJson.length,
          urls: (data.results || []).map((r: any) => r.url),
        } as CompareResult;
      } catch (err: any) {
        return {
          provider: providerId,
          latency: Date.now() - start,
          cost: 0,
          resultCount: 0,
          responseSize: 0,
          urls: [],
          error: err.message,
        } as CompareResult;
      }
    });

    const results = await Promise.allSettled(promises);
    setCompareResults(
      results.map((r) =>
        r.status === "fulfilled"
          ? r.value
          : {
              provider: "unknown",
              latency: 0,
              cost: 0,
              resultCount: 0,
              responseSize: 0,
              urls: [],
              error: "Failed",
            }
      )
    );
    setCompareLoading(false);
  };

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  const handleHistoryReplay = (entry: any) => {
    handleSearch({
      query: entry.query,
      provider: entry.provider || "",
      search_type: entry.filters?.search_type || "web",
      max_results: entry.filters?.max_results || 5,
      ...entry.filters,
    });
  };

  return (
    <div className="flex h-[calc(100vh-120px)]">
      <div className="w-[340px] flex-shrink-0 bg-bg-alt border-r border-border overflow-y-auto flex flex-col">
        <SearchForm
          onSearch={handleSearch}
          loading={loading}
          onCancel={handleCancel}
          providers={providers}
        />
        <SearchHistory onReplay={handleHistoryReplay} />
      </div>

      <div className="flex-1 overflow-y-auto">
        <ResultsPanel
          response={response}
          rawJson={rawJson}
          loading={loading}
          error={error}
          statusCode={statusCode}
          duration={duration}
        />

        {response && (
          <div className="px-4 py-2 flex gap-2">
            <button
              className="flex-1 bg-surface border border-border rounded-lg p-2 text-center hover:border-accent/30 transition-colors flex items-center justify-center gap-2"
              onClick={handleCompare}
              disabled={compareLoading}
            >
              <span className="text-accent text-sm">&#8693;</span>
              <span className="text-xs text-text-muted">{t("compareProviders")}</span>
            </button>
            <button
              className="flex-1 bg-surface border border-border rounded-lg p-2 text-center hover:border-primary/30 transition-colors flex items-center justify-center gap-2"
              onClick={() => setShowRerank(!showRerank)}
            >
              <span className="text-primary text-sm">&#8645;</span>
              <span className="text-xs text-text-muted">{t("rerankResults")}</span>
            </button>
          </div>
        )}

        {showCompare && initialCompareResult && (
          <div className="px-4 pb-3">
            <ProviderComparison
              initialProvider={response!.provider}
              initialResult={initialCompareResult}
              otherResults={compareResults}
              loading={compareLoading}
              onClose={() => setShowCompare(false)}
            />
          </div>
        )}

        {showRerank && response && (
          <div className="px-4 pb-3">
            <RerankPanel
              query={response.query}
              results={response.results}
              onClose={() => setShowRerank(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
