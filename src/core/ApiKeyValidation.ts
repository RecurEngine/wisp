export function getApiKeyInputError(value: string): string | undefined {
  const input = value.trim();
  if (/^(["']).*\1$/s.test(input)) {
    return "API key looks quoted. Paste the raw key only, without surrounding quotes.";
  }
  if (/^(?:export\s+)?ANTHROPIC_(?:AUTH_TOKEN|API_KEY)\s*[:=]/i.test(input)) {
    return "Paste only the API key value, not the ANTHROPIC_AUTH_TOKEN= or ANTHROPIC_API_KEY= prefix.";
  }
  return undefined;
}
