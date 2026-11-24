#!/usr/bin/env bash
# Creates the GitHub release for the current version and uploads the installers.
# The Intel Mac and Windows builds need @napi-rs/canvas-darwin-x64 and
# @napi-rs/canvas-win32-x64-msvc in node_modules (npm only installs this Mac's).
#
#   GITHUB_TOKEN=... scripts/release.sh
#
# The token needs "Contents: read and write" on this repo (fine-grained) or the
# "repo" scope (classic). Build first with: npm run dist && npm run dist:win
set -euo pipefail

REPO="SnakeLuck360GT/studywise-courses"
VERSION="v$(node -p "require('./package.json').version")"
NOTES="docs/release-notes-${VERSION}.md"
# latest*.yml and the blockmaps are what installed copies read to update themselves.
ASSETS=(release/Studywise-Courses.dmg release/Studywise-Courses-mac.zip release/Studywise-Courses-Setup.exe release/Studywise-Courses-win-x64.zip
  release/latest.yml release/latest-mac.yml release/Studywise-Courses-Setup.exe.blockmap release/Studywise-Courses-mac.zip.blockmap)

: "${GITHUB_TOKEN:?Set GITHUB_TOKEN first}"
for f in "${ASSETS[@]}"; do [ -f "$f" ] || { echo "Missing $f. Run npm run dist and npm run dist:win."; exit 1; }; done

api() { curl -fsSL -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" "$@"; }

# Make sure the tag exists on GitHub.
git rev-parse "$VERSION" >/dev/null 2>&1 || git tag -a "$VERSION" -m "$VERSION"
git push -q origin "$VERSION" 2>/dev/null || true

# Reuse the release if it already exists, otherwise create it.
id=$(api "https://api.github.com/repos/$REPO/releases/tags/$VERSION" 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).id||"")}catch{console.log("")}})')
if [ -z "$id" ]; then
  body=$(node -e 'const fs=require("fs");console.log(JSON.stringify({tag_name:process.argv[1],name:"Studywise Courses "+process.argv[1].slice(1),body:fs.existsSync(process.argv[2])?fs.readFileSync(process.argv[2],"utf8"):""}))' "$VERSION" "$NOTES")
  id=$(api -X POST "https://api.github.com/repos/$REPO/releases" -d "$body" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).id))')
  echo "Created release $VERSION ($id)"
else
  echo "Release $VERSION exists ($id), uploading assets"
fi

for f in "${ASSETS[@]}"; do
  name=$(basename "$f")
  # Replace an asset with the same name if it's already there.
  old=$(api "https://api.github.com/repos/$REPO/releases/$id/assets" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s).find(x=>x.name===process.argv[1]);console.log(a?a.id:"")})' "$name")
  [ -n "$old" ] && api -X DELETE "https://api.github.com/repos/$REPO/releases/assets/$old" >/dev/null
  echo "Uploading $name ($(du -h "$f" | cut -f1))..."
  api -X POST -H "Content-Type: application/octet-stream" --data-binary @"$f" \
    "https://uploads.github.com/repos/$REPO/releases/$id/assets?name=$name" >/dev/null
done

echo "Done: https://github.com/$REPO/releases/tag/$VERSION"
