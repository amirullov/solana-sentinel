#!/usr/bin/env bash
set -euo pipefail

# Local devnet-only signers. Never copy the JSON files into the repository.
key_dir="${SENTINEL_KEY_DIR:-$HOME/.config/solana-sentinel/devnet}"
umask 077
mkdir -p -- "$key_dir"
chmod 700 -- "$key_dir"

for role in deployer admin publisher; do
  key_file="$key_dir/$role.json"
  if [[ ! -e "$key_file" ]]; then
    solana-keygen new --no-bip39-passphrase --silent -o "$key_file" >/dev/null
  fi
  chmod 600 -- "$key_file"
  printf '%s: ' "$role"
  solana-keygen pubkey "$key_file"
done

printf 'Key directory: %s\n' "$key_dir"
