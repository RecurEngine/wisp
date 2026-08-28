# Security Policy

## Sensitive data

Never commit or attach any of the following:

- Chat, speech-to-text, or search API keys.
- Authorization headers, bearer tokens, cookies, or provider credentials.
- Obsidian `data.json` files containing local configuration.
- Vault notes, private URLs, personal filesystem paths, or unredacted debug output.
- Audio recordings or transcripts that contain private information.

Wisp stores configured API keys in Obsidian `SecretStorage`. Other settings are persisted through the plugin data store. The repository ignores `.env` files, `data.json`, build output, logs, and local development directories, but contributors must still inspect staged changes before publishing them.

Debug diagnostics redact common key and token patterns. This is a safety net, not a guarantee: review and manually redact copied diagnostics before sharing them.

## Reporting a vulnerability

Please do not open a public issue for an undisclosed vulnerability. Email [dev@rrecurengine.com](mailto:dev@rrecurengine.com) privately and include:

- A short description and impact.
- A minimal reproduction, without real credentials or private vault data.
- The affected version or commit.
- Any suggested mitigation.

If a credential is exposed, revoke or rotate it immediately with the provider before reporting the incident.
