#!/usr/bin/env bash
# Populate tests/fixtures/sbml/ with the 25 curated SBML fixtures, then COMMIT them (vendoring).
#
# Source them from your existing local corpus — the SBML files the SLURM runs already read.
# The BioModels file endpoint needs a per-model internal id + version that are NOT derivable
# from the BIOMD accession, so there is no simple accession-templated download; copying from the
# corpus you already have is the reliable path.
#
#   bash tests/fixtures/fetch_fixtures.sh                       # uses the default cluster corpus
#   CORPUS=/path/to/biomodels/xml bash tests/fixtures/fetch_fixtures.sh   # or override
#   node tests/ci_smoke.mjs --update        # regenerate the baseline from a known-good build
#   git add tests/fixtures/sbml/*.xml tests/fixtures/baseline.json
#
# NOTE: no `set -e` — a single missing/odd model must not abort the whole copy loop.
set -uo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)/sbml"
mkdir -p "$DIR"
# Defaults to the cluster corpus; override by exporting CORPUS to another directory.
CORPUS="${CORPUS:-/net/dali/home/mscbio/ark426/bionetgen/Biomodels}"
if [ ! -d "$CORPUS" ]; then
  echo "corpus dir not found: $CORPUS (set CORPUS=/path/to/BIOMD/xml)" >&2
  exit 1
fi

# 25 models, each guarding a specific fix or serving as a regression / boundary canary.
# See README.md for the model -> fix mapping.
IDS=(
  0000000001 0000000005 0000000009 0000000010 0000000012 0000000013
  0000000055 0000000081 0000000118 0000000214 0000000262 0000000263
  0000000320 0000000619 0000000624 0000000637 0000000669 0000000723
  0000000844 0000000872 0000000923 0000000956 0000000989 0000001025 0000001046
)

missing=0
for id in "${IDS[@]}"; do
  src="$CORPUS/BIOMD${id}.xml"
  [ -f "$src" ] || src="$CORPUS/BIOMD${id}_url.xml"
  if [ -f "$src" ]; then
    cp "$src" "$DIR/BIOMD${id}.xml" && echo "copied BIOMD${id}"
  else
    # last resort: any file under the corpus (recurse) whose name contains the accession
    alt=$(find "$CORPUS" -type f -name "BIOMD${id}*.xml" -print -quit 2>/dev/null)
    if [ -n "$alt" ]; then
      cp "$alt" "$DIR/BIOMD${id}.xml" && echo "copied BIOMD${id}  <- ${alt}"
    else
      echo "MISSING BIOMD${id} under $CORPUS"
      missing=$((missing + 1))
    fi
  fi
done

echo "done — $(ls "$DIR"/*.xml 2>/dev/null | wc -l) fixtures in $DIR (${missing} missing)"