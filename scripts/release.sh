#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

if [[ $# -ne 1 ]] || [[ ! "$1" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
  echo "Usage: $0 <version>, e.g. $0 1.0.7" >&2
  exit 1
fi
VERSION="$1"
BRANCH="$(git symbolic-ref --quiet --short HEAD)" || {
  echo "Release requires a branch, not a detached HEAD." >&2
  exit 1
}

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is required. Install it with: brew install gh" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated. Run: gh auth login" >&2
  exit 1
fi

REPO="${WISP_GITHUB_REPO:-$(git remote get-url origin | sed -E 's#^git@github.com:##; s#^https://github.com/##; s#\.git$##')}"
if [[ -z "$REPO" || "$REPO" == "git@github.com:" ]]; then
  echo "Unable to determine the GitHub repository from origin." >&2
  exit 1
fi

# Distinguish an absent tag from a network/authentication failure.
REMOTE_TAGS="$(git ls-remote --refs origin "refs/tags/$VERSION")"
if [[ -n "$REMOTE_TAGS" ]] || git rev-parse --verify --quiet "refs/tags/$VERSION" >/dev/null; then
  echo "Tag $VERSION already exists. Choose a new version." >&2
  exit 1
fi
RELEASE_TAGS="$(gh release list --repo "$REPO" --limit 1000 --json tagName --jq '.[].tagName')"
if printf '%s\n' "$RELEASE_TAGS" | grep -Fxq "$VERSION"; then
  echo "Release $VERSION already exists on $REPO." >&2
  exit 1
fi

node --input-type=module - "$VERSION" <<'NODE'
import fs from "node:fs";
const version = process.argv[2];
const paths = ["manifest.json", "package.json", "package-lock.json"];
const data = paths.map(path => JSON.parse(fs.readFileSync(path, "utf8")));
const current = data[0].version;
const next = version.split(".").map(BigInt);
const prev = current.split(".").map(BigInt);
const difference = next.findIndex((part, i) => part !== prev[i]);
if (difference !== -1 && next[difference] < prev[difference]) {
  throw new Error(`Version must not be lower than ${current}`);
}
if (!data[2].packages?.[""]) throw new Error("Lockfile is missing the root package");
for (const item of data) item.version = version;
data[2].packages[""].version = version;
for (let i = 0; i < paths.length; i++) {
  fs.writeFileSync(paths[i], JSON.stringify(data[i], null, 2) + "\n");
}
NODE

echo "Installing locked dependencies..."
npm ci

echo "Running review lint checks..."
npm run lint

echo "Running typecheck..."
npm run typecheck

echo "Running tests..."
npm run test

echo "Building production bundle..."
npm run build

echo "Committing all non-ignored changes for Wisp $VERSION..."
git add -A
git commit -m "chore: release $VERSION"

echo "Creating annotated Git tag $VERSION..."
git tag -a "$VERSION" -m "Wisp $VERSION"

echo "Pushing branch $BRANCH and tag $VERSION..."
git push --atomic origin "HEAD:refs/heads/$BRANCH" "refs/tags/$VERSION"

echo "Creating GitHub Release $VERSION on $REPO..."
gh release create "$VERSION" main.js manifest.json styles.css \
  --repo "$REPO" \
  --verify-tag \
  --title "Wisp $VERSION" \
  --generate-notes

echo "Release published: https://github.com/$REPO/releases/tag/$VERSION"
