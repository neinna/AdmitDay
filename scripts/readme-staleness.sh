#!/bin/sh
# Prints the number of non-data commits since README.md last changed, then
# one line per commit subject. Exits 2 if it cannot tell (never "fresh").
set -eu

sha=$(git log -1 --format=%H -- README.md)
if [ -z "$sha" ]; then
  echo "readme-staleness: no commit touches README.md (shallow clone?)" >&2
  exit 2
fi

git rev-list --count --no-merges "$sha"..HEAD -- . ':!schools.json' ':!data/'
git log --no-merges --format='- %s' "$sha"..HEAD -- . ':!schools.json' ':!data/'
