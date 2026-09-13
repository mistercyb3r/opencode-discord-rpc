#!/usr/bin/env node

const RPC = require("discord-rpc");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const CONFIG_PATH = path.join(process.env.XDG_CONFIG_HOME || path.join(process.env.HOME || "", ".config"), "opencode-rpc", "config.json");
const DEFAULT_CONFIG = {
  clientId: "",
  updateIntervalSeconds: 15,
  idleAfterMinutes: 20,
  showProject: true,
  showBranch: true,
  showGitStats: true,
  detectGames: true,
};
let userConfig = DEFAULT_CONFIG;
try {
  userConfig = { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) };
} catch {
  // The installer creates this file; missing config is handled by the startup check.
}
const CLIENT_ID = userConfig.clientId;
const OPENCODE_ICON = "https://opencode.ai/web-app-manifest-512x512.png";
const OPENCODE_DB = path.join(process.env.HOME || "", ".local/share/opencode/opencode.db");
const UPDATE_MS = Math.max(5, Number(userConfig.updateIntervalSeconds) || 15) * 1000;
const IDLE_MS = Math.max(1, Number(userConfig.idleAfterMinutes) || 20) * 60 * 1000;
const startedAt = new Date();

const LANGUAGE_BY_EXTENSION = {
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".py": "Python",
  ".rs": "Rust",
  ".go": "Go",
  ".java": "Java",
  ".c": "C",
  ".h": "C",
  ".cpp": "C++",
  ".cc": "C++",
  ".hpp": "C++",
  ".cxx": "C++",
  ".cs": "C#",
  ".php": "PHP",
  ".rb": "Ruby",
  ".swift": "Swift",
  ".kt": "Kotlin",
  ".kts": "Kotlin",
  ".scala": "Scala",
  ".sh": "Shell",
  ".bash": "Bash",
  ".zsh": "Zsh",
  ".fish": "Fish",
  ".nu": "Nushell",
  ".ps1": "PowerShell",
  ".psm1": "PowerShell",
  ".bat": "Batch",
  ".cmd": "Batch",
  ".sql": "SQL",
  ".html": "HTML",
  ".htm": "HTML",
  ".css": "CSS",
  ".scss": "CSS",
  ".sass": "CSS",
  ".less": "CSS",
  ".vue": "Vue",
  ".svelte": "Svelte",
  ".lua": "Lua",
  ".dart": "Dart",
  ".ex": "Elixir",
  ".exs": "Elixir",
  ".erl": "Erlang",
  ".clj": "Clojure",
  ".cljs": "Clojure",
  ".hs": "Haskell",
  ".zig": "Zig",
  ".nim": "Nim",
  ".cr": "Crystal",
  ".d": "D",
  ".tf": "Terraform",
  ".proto": "Protobuf",
  ".graphql": "GraphQL",
  ".prisma": "Prisma",
  ".pl": "Prolog",
  ".vim": "Vim script",
  ".r": "R",
  ".jl": "Julia",
  ".elm": "Elm",
  ".fs": "F#",
  ".fsx": "F#",
  ".groovy": "Groovy",
};

function run(command, args = []) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2500,
    }).trim();
  } catch {
    return "";
  }
}

function openCodeRunning() {
  return Boolean(run("pgrep", ["-x", "opencode"]));
}

function processCommands() {
  return run("ps", ["-eo", "comm=,args="])
    .split("\n")
    .filter(Boolean)
    .map(line => line.trim());
}

function activeGame() {
  if (!userConfig.detectGames) return "";
  const games = [
    ["No Man's Sky", /NoMansSky|NMS\.exe/i],
    ["Balatro", /Balatro/i],
    ["RuneScape", /RuneScape|runescape/i],
  ];

  for (const command of processCommands()) {
    if (/steam|gamescope|fossilize|wineboot|wineserver/i.test(command)) continue;
    const game = games.find(([, pattern]) => pattern.test(command));
    if (game) return game[0];
  }

  return "";
}

function activeCommand() {
  const patterns = [
    [/\bcargo\s+(check|test|build|run)\b/i, "Rust"],
    [/\b(pytest|python\s+[-\w]*m\s+pytest)\b/i, "Python"],
    [/\b(pnpm|npm|yarn|bun)\s+(test|build|dev|check)\b/i, "JavaScript"],
    [/\b(go\s+test|go\s+build)\b/i, "Go"],
    [/\b(docker\s+compose|docker-compose)\b/i, "Docker"],
    [/\b(make|cmake|just)\b/i, "Build"],
  ];

  for (const command of processCommands()) {
    if (/opencode-rpc|steam|discord|arrpc/i.test(command)) continue;
    const match = patterns.find(([pattern]) => pattern.test(command));
    if (match) return `${match[1]} build/test`;
  }

  return "";
}

function activeProcessIds() {
  return run("pgrep", ["-x", "opencode"])
    .split("\n")
    .filter(Boolean);
}

function sessionInfo(pid) {
  try {
    const commandLine = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").replaceAll("\0", " ");
    const sessionId = commandLine.match(/(?:^|\s)-s\s+(\S+)/)?.[1];
    if (!sessionId || !fs.existsSync(OPENCODE_DB)) return "";
    const row = run("sqlite3", [
      OPENCODE_DB,
      `SELECT directory || char(9) || time_updated || char(9) || title FROM session WHERE id = '${sessionId.replaceAll("'", "''")}' LIMIT 1;`,
    ]);
    const [directory, updated, title] = row.split("\t");
    return directory ? { directory, updated: Number(updated) || 0, title: title || "" } : null;
  } catch {
    return null;
  }
}

function activeSessions() {
  const sessions = [];

  for (const pid of activeProcessIds()) {
    const session = sessionInfo(pid);
    if (session) sessions.push(session);
    try {
      const cwd = fs.realpathSync(`/proc/${pid}/cwd`);
      if (!session) sessions.push({ directory: cwd, updated: 0, title: "" });
    } catch {
      // The process may exit while the list is being inspected.
    }
  }

  return [...new Map(sessions.map(session => [session.directory, session])).values()]
    .sort((a, b) => b.updated - a.updated);
}

function gitRoot(cwd) {
  if (!cwd) return "";
  return run("git", ["-C", cwd, "rev-parse", "--show-toplevel"]);
}

function languagesFromFiles(files) {
  const counts = new Map();

  for (const file of files) {
    const language = LANGUAGE_BY_EXTENSION[path.extname(file).toLowerCase()];
    if (!language) continue;
    counts.set(language, (counts.get(language) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([language]) => language);
}

function changedFiles(root) {
  return run("git", ["-C", root, "status", "--porcelain", "--untracked-files=all"])
    .split("\n")
    .filter(Boolean)
    .map(line => line.slice(3));
}

function detectLanguage(cwd) {
  if (!cwd) return [];

  const root = gitRoot(cwd);
  if (!root) return [];

  const files = changedFiles(root);
  const languages = languagesFromFiles(files);
  return languages.length > 0
    ? languages
    : languagesFromFiles(run("git", ["-C", root, "ls-files"]).split("\n"));
}

function gitBranch(root) {
  return run("git", ["-C", root, "branch", "--show-current"]) || "detached";
}

function detectFramework(root) {
  if (!root) return "";

  if (fs.existsSync(path.join(root, "CMakeLists.txt"))) return "CMake";
  if (fs.existsSync(path.join(root, "Makefile"))) return "Make";
  if (fs.existsSync(path.join(root, "Justfile"))) return "Just";
  if (fs.existsSync(path.join(root, "justfile"))) return "Just";

  if (fs.existsSync(path.join(root, "Cargo.toml"))) {
    return fs.existsSync(path.join(root, "src-tauri")) ? "Tauri" : "Rust";
  }
  if (fs.existsSync(path.join(root, "go.mod"))) return "Go";
  if (fs.existsSync(path.join(root, "pyproject.toml"))) return "Python";
  if (fs.existsSync(path.join(root, "mix.exs"))) return "Elixir";
  if (fs.existsSync(path.join(root, "build.gradle")) || fs.existsSync(path.join(root, "build.gradle.kts"))) return "Gradle";
  if (fs.existsSync(path.join(root, "pom.xml"))) return "Maven";

  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
    if (dependencies.next) return "Next.js";
    if (dependencies.astro) return "Astro";
    if (dependencies["@angular/core"]) return "Angular";
    if (dependencies["@tauri-apps/api"]) return "Tauri";
    if (dependencies.electron) return "Electron";
    if (dependencies.expo) return "Expo";
    if (dependencies["@nestjs/core"]) return "NestJS";
    if (dependencies.hono) return "Hono";
    if (dependencies.express) return "Express";
    if (dependencies.react) return "React";
    if (dependencies.vue) return "Vue";
    if (dependencies.svelte) return "Svelte";
    if (dependencies.vite) return "Vite";
    if (fs.existsSync(path.join(root, "Dockerfile"))) return "Docker";
  } catch {
    // Ignore incomplete or invalid package files while a project is being edited.
  }

  return fs.existsSync(path.join(root, "Dockerfile")) ? "Docker" : "";
}

function changeSummary(cwd) {
  const root = gitRoot(cwd);
  if (!root) return "";

  const numstat = run("git", ["-C", root, "diff", "--numstat", "HEAD"]);
  let added = 0;
  let deleted = 0;

  for (const line of numstat.split("\n").filter(Boolean)) {
    const parts = line.split("\t");
    if (parts.length >= 2) {
      const additions = Number.parseInt(parts[0], 10);
      const deletions = Number.parseInt(parts[1], 10);
      if (!Number.isNaN(additions)) added += additions;
      if (!Number.isNaN(deletions)) deleted += deletions;
    }
  }

  const untracked = run("git", ["-C", root, "ls-files", "--others", "--exclude-standard"])
    .split("\n")
    .filter(Boolean);

  const files = changedFiles(root).length;
  if (added === 0 && deleted === 0 && untracked.length === 0) return "clean";

  const parts = [];
  if (files > 0) parts.push(`${files} changed`);
  if (added > 0 || deleted > 0) parts.push(`+${added} / -${deleted}`);
  if (untracked.length > 0) parts.push(`${untracked.length} new`);
  return parts.join(" · ");
}

function activity() {
  const game = activeGame();
  if (game) {
    return {
      type: 0,
      details: "Gaming",
      state: game,
      startTimestamp: startedAt,
      largeImageKey: OPENCODE_ICON,
      largeImageText: "Gaming session",
      instance: false,
    };
  }

  const session = activeSessions().find(candidate => gitRoot(candidate.directory));
  const cwd = session?.directory || "";
  const root = gitRoot(cwd);
  const languages = detectLanguage(cwd);
  const framework = detectFramework(root);
  const changes = changeSummary(cwd);
  const command = activeCommand();
  const idle = session?.updated && Date.now() - session.updated > IDLE_MS;
  const stateParts = [];

  if (languages.length > 0) stateParts.push(languages.join(" + "));
  if (framework && !languages.includes(framework)) stateParts.push(framework);
  if (userConfig.showProject && root) stateParts.push(path.basename(root));
  if (userConfig.showBranch && root) stateParts.push(gitBranch(root));
  if (idle) stateParts.push("idle");
  else if (command) stateParts.push(command);
  else if (changes && userConfig.showGitStats) stateParts.push(changes);

  return {
    type: 0,
    details: "OpenCode Programming",
    state: stateParts.length > 0 ? stateParts.join(" · ") : "Multi-language · Building something cool",
    startTimestamp: startedAt,
    largeImageKey: OPENCODE_ICON,
    largeImageText: "OpenCode · Open source coding agent",
    buttons: [
      { label: "OpenCode", url: "https://opencode.ai" },
      { label: "View on GitHub", url: "https://github.com/anomalyco/opencode" },
    ],
    instance: false,
  };
}

if (!CLIENT_ID) {
  console.error(`Missing Discord clientId. Create ${CONFIG_PATH} from config.example.json.`);
  process.exit(1);
}

RPC.register(CLIENT_ID);
let client;
let active = false;
let updateTimer;
let reconnectTimer;

function clearTimers() {
  if (updateTimer) clearInterval(updateTimer);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  updateTimer = undefined;
  reconnectTimer = undefined;
}

async function connect() {
  clearTimers();
  client = new RPC.Client({ transport: "ipc" });
  client.on("ready", async () => {
    await update();
    updateTimer = setInterval(() => update().catch(console.error), UPDATE_MS);
  });
  client.on("disconnected", () => {
    active = false;
    reconnectTimer = setTimeout(connect, 5_000);
  });

  try {
    await client.login({ clientId: CLIENT_ID });
  } catch (error) {
    console.error(`Discord RPC unavailable: ${error.message}`);
    reconnectTimer = setTimeout(connect, 5_000);
  }
}

async function update() {
  const running = openCodeRunning();
  if (running) {
    await client.setActivity(activity());
    active = true;
  } else if (active) {
    await client.clearActivity();
    active = false;
  }
}

connect();
