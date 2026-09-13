#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/opencode-rpc"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/opencode-rpc"
SERVICE_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"

command -v node >/dev/null || { echo "Node.js 18+ is required." >&2; exit 1; }
command -v sqlite3 >/dev/null || { echo "sqlite3 is required." >&2; exit 1; }
NODE_PATH="$(command -v node)"

node_major="$(node --version | cut -d. -f1 | tr -d 'v')"
if (( node_major < 18 )); then
  echo "Node.js 18 or newer is required; found $(node --version)." >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR" "$CONFIG_DIR" "$SERVICE_DIR"
cp "$REPO_DIR/index.js" "$REPO_DIR/package.json" "$REPO_DIR/package-lock.json" "$INSTALL_DIR/"
(cd "$INSTALL_DIR" && npm ci --omit=dev)

if [[ ! -f "$CONFIG_DIR/config.json" ]]; then
  cp "$REPO_DIR/config.example.json" "$CONFIG_DIR/config.json"
  echo
  read -r -p "Discord Application ID (press Enter to configure later): " client_id
  if [[ -n "$client_id" ]]; then
    CLIENT_ID="$client_id" CONFIG_PATH="$CONFIG_DIR/config.json" node - <<'NODE'
const fs = require("node:fs");
const configPath = process.env.CONFIG_PATH;
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
config.clientId = process.env.CLIENT_ID;
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
NODE
  else
    echo "Set clientId in $CONFIG_DIR/config.json before starting the service."
  fi
fi

sed -e "s|%h/.local/share/opencode-rpc|$INSTALL_DIR|g" -e "s|__NODE_PATH__|$NODE_PATH|g" "$REPO_DIR/opencode-rpc.service" > "$SERVICE_DIR/opencode-rpc.service"
systemctl --user daemon-reload
if [[ -n "${client_id:-}" ]]; then
  systemctl --user enable --now opencode-rpc.service
fi
echo "Installed OpenCode Discord RPC."
