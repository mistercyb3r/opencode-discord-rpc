#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/opencode-rpc"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/opencode-rpc"
SERVICE_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"

command -v node >/dev/null || { echo "Node.js 18+ is required." >&2; exit 1; }
command -v sqlite3 >/dev/null || { echo "sqlite3 is required." >&2; exit 1; }

mkdir -p "$INSTALL_DIR" "$CONFIG_DIR" "$SERVICE_DIR"
cp "$REPO_DIR/index.js" "$REPO_DIR/package.json" "$REPO_DIR/package-lock.json" "$INSTALL_DIR/"
(cd "$INSTALL_DIR" && npm ci --omit=dev)

if [[ ! -f "$CONFIG_DIR/config.json" ]]; then
  cp "$REPO_DIR/config.example.json" "$CONFIG_DIR/config.json"
  echo "Edit $CONFIG_DIR/config.json and set clientId to your Discord application ID."
fi

sed "s|%h/.local/share/opencode-rpc|$INSTALL_DIR|g" "$REPO_DIR/opencode-rpc.service" > "$SERVICE_DIR/opencode-rpc.service"
systemctl --user daemon-reload
systemctl --user enable --now opencode-rpc.service
echo "Installed OpenCode Discord RPC."
