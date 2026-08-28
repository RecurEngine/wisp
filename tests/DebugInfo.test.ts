import { describe, expect, it } from "vitest";
import { formatDebugError, getUserFacingError, redactSecrets } from "../src/core/DebugInfo";
import { getApiKeyInputError } from "../src/core/ApiKeyValidation";

describe("DebugInfo", () => {
  it("redacts bearer tokens, API keys, and api_key fields", () => {
    const value = redactSecrets(
      'Bearer bearer-secret sk-1234567890abcdef {"api_key":"another-secret"}'
    );

    expect(value).not.toContain("bearer-secret");
    expect(value).not.toContain("sk-1234567890abcdef");
    expect(value).not.toContain("another-secret");
    expect(value).toContain("[REDACTED]");
  });

  it("formats a copyable error with diagnostic details", () => {
    const value = formatDebugError("Request failed", "Error: network unavailable");

    expect(value).toContain("Wisp debug error");
    expect(value).toContain("message: Request failed");
    expect(value).toContain("details: Error: network unavailable");
  });

  it("gives a useful authentication hint without exposing the provider response", () => {
    const value = getUserFacingError("Claude request failed (401): API key is invalid");

    expect(value).toContain("Authentication failed (401)");
    expect(value).toContain("without quotes");
    expect(value).not.toContain("API key is invalid");
  });

  it("detects common pasted environment-variable formats", () => {
    expect(getApiKeyInputError('"sk-example"')).toContain("looks quoted");
    expect(getApiKeyInputError("export ANTHROPIC_AUTH_TOKEN=sk-example")).toContain("Paste only the API key value");
    expect(getApiKeyInputError("sk-example")).toBeUndefined();
  });
});
