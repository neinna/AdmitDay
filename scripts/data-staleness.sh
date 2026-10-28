#!/bin/sh
# Prints the age in whole days of the last commit touching schools.json.
# Exits 2 if it cannot tell (never prints a number it did not measure).
set -eu

ts=$(git log -1 --format=%ct -- schools.json)
if [ -z "$ts" ]; then
  echo "data-staleness: no commit touches schools.json (shallow clone?)" >&2
  exit 2
fi

now=$(date +%s)
echo $(( (now - ts) / 86400 ))
