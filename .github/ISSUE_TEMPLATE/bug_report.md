---
name: Bug report
about: Something does not work as expected
title: "[Bug] "
labels: bug
assignees: ''
---

## What happened?

Describe what you expected and what happened instead.

## System

- Distribution:
- Desktop environment:
- Node.js version (`node --version`):
- Discord bridge: Discord IPC / arRPC / other

## Logs

Paste relevant output from:

```bash
systemctl --user status opencode-rpc.service --no-pager
journalctl --user -u opencode-rpc.service -n 50 --no-pager
```

Please remove personal paths, tokens, and private project names.
