import { describe, expect, it } from "vitest";
import { resolveObservabilityVectorUrls } from "./observability";

describe("resolveObservabilityVectorUrls", () => {
  it("uses the explicit Vector host and ports from the environment", () => {
    const urls = resolveObservabilityVectorUrls({
      CMDCLAW_VECTOR_HOST: "cmdclaw-vector-staging",
      CMDCLAW_VECTOR_LOG_PORT: "8686",
      CMDCLAW_VECTOR_OTLP_HTTP_PORT: "4318",
    });

    expect(urls).toEqual({
      logUrl: "http://cmdclaw-vector-staging:8686/logs",
      metricsUrl: "http://cmdclaw-vector-staging:4318/v1/metrics",
      tracesUrl: "http://cmdclaw-vector-staging:4318/v1/traces",
    });
  });

  it("prefers fully qualified endpoint URLs when provided", () => {
    const urls = resolveObservabilityVectorUrls({
      CMDCLAW_VECTOR_LOG_URL: "http://vector.example/log-ingest",
      CMDCLAW_VECTOR_METRICS_URL: "http://vector.example/metric-ingest",
      CMDCLAW_VECTOR_TRACES_URL: "http://vector.example/trace-ingest",
      CMDCLAW_VECTOR_HOST: "ignored-host",
      CMDCLAW_VECTOR_LOG_PORT: "9999",
      CMDCLAW_VECTOR_OTLP_HTTP_PORT: "9998",
    });

    expect(urls).toEqual({
      logUrl: "http://vector.example/log-ingest",
      metricsUrl: "http://vector.example/metric-ingest",
      tracesUrl: "http://vector.example/trace-ingest",
    });
  });

  it("falls back to localhost defaults only when no Vector env is set", () => {
    const urls = resolveObservabilityVectorUrls({});

    expect(urls).toEqual({
      logUrl: "http://127.0.0.1:8686/logs",
      metricsUrl: "http://127.0.0.1:4318/v1/metrics",
      tracesUrl: "http://127.0.0.1:4318/v1/traces",
    });
  });
});
