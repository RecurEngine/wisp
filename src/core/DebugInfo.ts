export function formatDebugError(message: string, details?: string): string {
  const lines = [
    "Wisp debug error",
    `time: ${new Date().toISOString()}`,
    `message: ${redactSecrets(message)}`
  ];
  if (details && details !== message) lines.push(`details: ${redactSecrets(details)}`);
  return lines.join("\n");
}

export function getUserFacingError(message: string): string {
  if (/\b401\b|authentication_error|api key[^\n]*(?:invalid|failed)/i.test(message)) {
    return "Authentication failed (401). In Wisp settings, paste only the raw API key—without quotes or an ANTHROPIC_AUTH_TOKEN= prefix—then click Save changes.";
  }
  return message;
}

export function redactSecrets(value: string): string {
  return value
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_KEY]")
    .replace(
      /((?:api[-_ ]?key|ANTHROPIC_(?:AUTH_TOKEN|API_KEY))\s*["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi,
      "$1[REDACTED]"
    );
}
