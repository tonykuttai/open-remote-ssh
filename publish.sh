#!/usr/bin/env bash
# Build the VSIX, publish it to Open VSX and create the GitHub release.
# Requires: OVSX_PAT (Open VSX personal access token) in the environment, gh CLI logged in.
set -euo pipefail

: "${OVSX_PAT:?Set OVSX_PAT to your Open VSX personal access token}"

version=$(node -p "require('./package.json').version")
vsix="aix-remote-ssh-${version}.vsix"

yarn install --frozen-lockfile
yarn lint
yarn package

npx ovsx publish --packagePath "$vsix" -p "$OVSX_PAT"
gh release create "v${version}" "$vsix" --title "AIX Remote SSH v${version}" --generate-notes
