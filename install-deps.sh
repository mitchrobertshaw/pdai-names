#!/usr/bin/env bash
# Installs ENSv2 (ensdomains/contracts-v2) at its audited commit into lib/contracts-v2, with the
# libraries that commit pins, then applies the small PulseChain patch in patches/.
# Needs git. GitHub Actions runs this for you; nothing needs installing on your own computer.
set -euo pipefail

ENSV2_REPO="https://github.com/ensdomains/contracts-v2"
# "Post Audit Changes (#301)", 3 July 2026.
ENSV2_COMMIT="48b3e2d39513b9dd32ef1850877a29009bc807b9"
DIR="lib/contracts-v2"
PATCH="$(pwd)/patches/ensv2-shanghai.patch"
# Only the libraries the contracts here compile against.
SUBMODULES=(
  forge-std
  openzeppelin-contracts
  openzeppelin-contracts-upgradeable
  openzeppelin-contracts-v4
  ens-contracts
  solady
  buffer
  solsha1
  verifiable-factory
  unruggable-gateways
)

STAMP="$ENSV2_COMMIT $(git hash-object "$PATCH")"
if [ -f "$DIR/.installed" ] && [ "$(cat "$DIR/.installed")" = "$STAMP" ]; then
  echo "Dependencies already installed."
  exit 0
fi

rm -rf "$DIR"
git init -q "$DIR"
git -C "$DIR" remote add origin "$ENSV2_REPO"
git -C "$DIR" fetch -q --depth 1 origin "$ENSV2_COMMIT"
git -C "$DIR" -c advice.detachedHead=false checkout -q FETCH_HEAD
for m in "${SUBMODULES[@]}"; do
  git -C "$DIR" submodule update -q --init --depth 1 "contracts/lib/$m"
done
git -C "$DIR" apply "$PATCH"
echo "$STAMP" > "$DIR/.installed"
echo "Installed ENSv2 at $ENSV2_COMMIT with the PulseChain patch."
