#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is required. Install it with: brew install gh" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated. Run: gh auth login" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain --untracked-files=all)" ]]; then
  echo "Working tree is not clean. Commit or stash changes before releasing." >&2
  exit 1
fi

REPO="${WISP_GITHUB_REPO:-$(git remote get-url origin | sed -E 's#^git@github.com:##; s#^https://github.com/##; s#\.git$##')}"
if [[ -z "$REPO" || "$REPO" == "git@github.com:" ]]; then
  echo "Unable to determine the GitHub repository from origin." >&2
  exit 1
fi

VERSION="$(node --input-type=module -e 'import fs from "node:fs"; const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8")); if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(manifest.version)) throw new Error("manifest version must use x.y.z"); process.stdout.write(manifest.version);')"

echo "Running typecheck..."
npm run typecheck

echo "Running tests..."
npm run test

echo "Building production bundle..."
npm run build

if gh release view "$VERSION" --repo "$REPO" >/dev/null 2>&1; then
  echo "Release $VERSION already exists on $REPO." >&2
  exit 1
fi

echo "Creating GitHub Release $VERSION on $REPO..."
gh release create "$VERSION" main.js manifest.json styles.css \
  --repo "$REPO" \
  --title "Wisp $VERSION" \
  --generate-notes

echo "Release published: https://github.com/$REPO/releases/tag/$VERSION"
