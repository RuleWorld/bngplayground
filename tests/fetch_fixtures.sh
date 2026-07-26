#!/usr/bin/env bash
# Fetch the curated SBML fixtures from EBI BioModels into tests/fixtures/sbml/.
# Run once locally, then COMMIT the resulting .xml files. CI must not fetch at run time
# (network flakiness); the fixtures are vendored.
#
#   bash tests/fixtures/fetch_fixtures.sh
#   node tests/ci_smoke.mjs --update      # then regenerate the baseline from a good build
#   git add tests/fixtures/sbml/*.xml tests/fixtures/baseline.json
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)/sbml"
mkdir -p "$DIR"

# 25 models, each guarding a specific fix or serving as a regression / boundary canary.
# See README.md for the model -> fix mapping.
IDS=(
  0000000001   # clean baseline canary
  0000000005   # Tyson cell cycle — clean regression canary
  0000000009   # clean regression canary
  0000000010   # Kholodenko MAPK — clean regression canary
  0000000012   # repressilator — clean regression canary
  0000000013   # genuine stiffness, tolerance-recoverable (Option B ladder)
  0000000055   # time-dependent synthesis rate, single law (time-rate wrap)
  0000000081   # time-triggered events / simulate() continuation method
  0000000118   # functionDefinition inlining on the rule-only fast path
  0000000214   # reversible rule with a time-dependent rate law (reversible split-wrap)
  0000000262   # expression seed referencing another species
  0000000263   # expression seed -> assignment-rule species (_InitialConc numbering)
  0000000320   # assignment-rule-valued seed (A_bens_tot)
  0000000619   # assignment-rule-valued seed (APAP_Dose)
  0000000624   # scientific-notation identifier (Vmax_2E1) not mangled
  0000000637   # expression seed with bare compartment reference
  0000000669   # assignment-rule-valued seed (f_G2__0)
  0000000723   # genuine stiffness (CVODE error) — boundary canary, expected fail
  0000000844   # genuine stiffness (CVODE error) — boundary canary, expected fail
  0000000872   # seed referencing species concentration via _c_() assignment rule
  0000000923   # two-argument log(base, x)
  0000000956   # seed -> ModelValue_N() assignment-rule chain
  0000000989   # power() builtin in a seed expression
  0000001025   # two-argument log(base, x) — second
  0000001046   # reversible FBA exchange, no kinetic law (single-ratelaw <-> guard)
)

for id in "${IDS[@]}"; do
  url="https://www.ebi.ac.uk/biomodels/model/download/BIOMD${id}?filename=${id}_url.xml"
  out="$DIR/BIOMD${id}.xml"
  echo "fetching BIOMD${id}"
  curl -fsSL "$url" -o "$out"
done

echo "done — ${#IDS[@]} fixtures in $DIR"
