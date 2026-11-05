#!/usr/bin/env bash
# Installs the two libraries this repo builds on, at pinned versions, into lib/.
# Needs Foundry (https://getfoundry.sh). GitHub Actions runs this for you.
set -euo pipefail

FORGE_STD="foundry-rs/forge-std@v1.17.0"
OPENZEPPELIN="OpenZeppelin/openzeppelin-contracts@v5.4.0"

if [ -f lib/forge-std/src/Test.sol ] && [ -f lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol ]; then
  echo "Dependencies already installed."
  exit 0
fi

forge install --no-git "$FORGE_STD" "$OPENZEPPELIN"
