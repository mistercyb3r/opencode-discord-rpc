# OpenCode Discord Rich Presence

Dynamic Discord Rich Presence for [OpenCode](https://opencode.ai). It shows the active project, language, framework, branch, Git activity, build/test commands, idle state, and optionally the current Steam game.

## Requirements

- Linux with systemd user services
- Node.js 18+
- `sqlite3`
- Discord desktop or a compatible Discord IPC bridge such as [arRPC](https://github.com/ampen-labs/arrpc)
- OpenCode using its default database at `~/.local/share/opencode/opencode.db`

## Discord application

1. Create an application at <https://discord.com/developers/applications>.
2. Copy its Application ID.
3. Add image assets under **Rich Presence → Art Assets** if you want custom artwork.

## Install

```bash
git clone https://github.com/mistercyb3r/opencode-discord-rpc.git
cd opencode-discord-rpc
./install.sh
```

Edit `~/.config/opencode-rpc/config.json` and replace `YOUR_DISCORD_APPLICATION_ID` with your Application ID. Restart the service:

```bash
systemctl --user restart opencode-rpc.service
```

If your Discord bridge is not already running, install and start arRPC separately. The included service starts after `arrpc.service` when available, but does not install Discord or the bridge.

## Configuration

```json
{
  "clientId": "YOUR_DISCORD_APPLICATION_ID",
  "updateIntervalSeconds": 15,
  "idleAfterMinutes": 20,
  "showProject": true,
  "showBranch": true,
  "showGitStats": true,
  "detectGames": true
}
```

Project names and branch names are shown, but absolute paths, commit messages, and file contents are not sent to Discord. Set `showProject` or `showBranch` to `false` for more privacy.

## Troubleshooting

```bash
systemctl --user status opencode-rpc.service
journalctl --user -u opencode-rpc.service -f
```

The service reconnects automatically when Discord or the RPC bridge restarts.

## License

MIT
