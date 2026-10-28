import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { atlasPaths, readJsonOr } from './project.ts';
import { isStale, lacksReasons } from './types.ts';
import { loadAtlas } from './load.ts';
import { renderBrief } from './context.ts';
import { describeModule } from './describe.ts';
import { CHILD } from './claude.ts';

const root = path.join(import.meta.dirname, '..');
const cli = path.join(import.meta.dirname, 'cli.ts');
const script = (name: string) => path.join(import.meta.dirname, `${name}.ts`);
const REFRESH_LIMIT = 8;

function findProject(start: string): string | null {
  for (let dir = path.resolve(start); ; dir = path.dirname(dir)) {
    if (fs.existsSync(atlasPaths(dir).config)) return dir;
    if (dir === path.dirname(dir)) return null;
  }
}

function projectOrExit(start: string): string {
  const project = findProject(start);
  if (project) return project;
  console.error(`atlas: no .atlas/atlas.config.json in ${path.resolve(start)} or above.`);
  process.exit(1);
}

function run(name: string, project: string): boolean {
  return (
    spawnSync(process.execPath, [script(name), project], { stdio: ['ignore', 'inherit', 'inherit'] })
      .status === 0
  );
}

const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

async function servedProject(port: number): Promise<string | null> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const body: unknown = await res.json();
    return typeof body === 'object' && body && 'project' in body && typeof body.project === 'string'
      ? body.project
      : null;
  } catch {
    return null;
  }
}

const portIsFree = (port: number) =>
  new Promise<boolean>((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });

async function ensureServer(project: string): Promise<number> {
  const record = path.join(atlasPaths(project).out, 'server.json');
  const last = readJsonOr<{ port?: number }>(record, {});
  if (last.port && (await servedProject(last.port)) === project) return last.port;
  let port = 4317;
  while (!(await portIsFree(port))) port++;
  const log = fs.openSync(path.join(atlasPaths(project).out, 'serve.log'), 'a');
  spawn(process.execPath, [script('serve'), project, String(port)], {
    detached: true,
    stdio: ['ignore', log, log],
  }).unref();
  for (let i = 0; i < 50 && (await servedProject(port)) !== project; i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  fs.writeFileSync(record, JSON.stringify({ port }));
  return port;
}

async function open(start: string) {
  const project = projectOrExit(start);
  if (!run('skeleton', project) || !run('build', project)) process.exit(1);
  const url = `http://127.0.0.1:${await ensureServer(project)}`;
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  spawn(opener, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref();
  console.log(url);
}

async function staleModules(project: string) {
  const { atlas } = await loadAtlas(project);
  return atlas.nodes.filter((n) => n.kind === 'module' && isStale(n)).map((n) => n.id);
}

async function status(start: string) {
  const project = projectOrExit(start);
  const { atlas, unknownIds, modulesWithoutCapability } = await loadAtlas(project);
  const modules = atlas.nodes.filter((n) => n.kind === 'module');
  const report = {
    project,
    modules: modules.length,
    described: modules.filter((n) => n.desc).length,
    stale: modules.filter(isStale).map((n) => n.id),
    withoutCapability: modulesWithoutCapability,
    systemsNeverCalled: atlas.nodes
      .filter((n) => n.kind === 'external' && !atlas.edges.some((e) => e.to === n.id))
      .map((n) => n.id),
    unknownIds,
  };
  console.log(JSON.stringify(report, null, 2));
}

const PARALLEL = 4;

async function undescribedModules(project: string) {
  const { atlas } = await loadAtlas(project);
  return atlas.nodes
    .filter(
      (n) => n.kind === 'module' && (!n.desc || n.files.some((f) => !f.desc) || lacksReasons(n, atlas.edges)),
    )
    .map((n) => n.id);
}

async function refresh(start: string, all: boolean) {
  const project = projectOrExit(start);
  const lock = path.join(atlasPaths(project).out, 'refresh.lock');
  const holder = Number(fs.existsSync(lock) && fs.readFileSync(lock, 'utf8'));
  if (holder && isAlive(holder)) return console.error(`atlas: a refresh is already running (pid ${holder}).`);
  fs.writeFileSync(lock, String(process.pid));
  try {
    const stale = await staleModules(project);
    const queue = all
      ? [...new Set([...stale, ...(await undescribedModules(project))])]
      : stale.slice(0, REFRESH_LIMIT);
    let done = 0;
    const worker = async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        await describeModule(project, id)?.catch((e: Error) => console.error(e.message));
        console.error(`refresh: ${++done} described (${id})`);
      }
    };
    await Promise.all(Array.from({ length: all ? PARALLEL : 1 }, worker));
    run('build', project);
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

async function readHookInput(): Promise<{ cwd?: string }> {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  try {
    const input: unknown = JSON.parse(text);
    return typeof input === 'object' && input && 'cwd' in input && typeof input.cwd === 'string'
      ? { cwd: input.cwd }
      : {};
  } catch {
    return {};
  }
}

async function sessionStart(project: string) {
  if (!fs.existsSync(atlasPaths(project).skeleton) && !run('skeleton', project)) return;
  const { atlas } = await loadAtlas(project);
  const store = atlasPaths(project).store;
  const brief = renderBrief(atlas, {
    cli,
    context: atlasPaths(project).context,
    semantic: path.join(store, 'semantic.json'),
    reference: path.join(root, 'skills', 'atlas', 'semantic-format.md'),
  });
  console.log(
    JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: brief } }),
  );
}

async function stop(project: string) {
  if (!run('skeleton', project) || !run('build', project)) return;
  if (!(await staleModules(project)).length) return;
  const log = fs.openSync(path.join(atlasPaths(project).out, 'refresh.log'), 'a');
  spawn(process.execPath, [cli, 'refresh', project], { detached: true, stdio: ['ignore', log, log] }).unref();
}

async function hook(event: string | undefined) {
  if (process.env[CHILD]) return;
  const { cwd } = await readHookInput();
  const project = findProject(cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
  if (!project) return;
  if (event === 'session-start') await sessionStart(project);
  else if (event === 'stop') await stop(project);
}

const USAGE = `atlas <command> [dir]

  open [dir]       build the map, start the local server if needed, open it in the browser
  build [dir]      skeleton + semantic merge -> .atlas/out/atlas.html and atlas-context.md
  status [dir]     modules, descriptions, stale ones, ids the semantic layer gets wrong
  refresh [dir] [--all]  rewrite out-of-date descriptions; --all also writes missing ones, 4 at a time
  serve [dir] [port]
  hook session-start|stop   (called by the plugin's hooks)

[dir] defaults to the current directory; the project is the nearest folder with .atlas/atlas.config.json.`;

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));
const [command, arg, extra] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const dir = arg ?? '.';
if (command === 'open') await open(dir);
else if (command === 'build') {
  const project = projectOrExit(dir);
  if (!run('skeleton', project) || !run('build', project)) process.exit(1);
} else if (command === 'status') await status(dir);
else if (command === 'refresh') await refresh(dir, flags.has('--all'));
else if (command === 'serve')
  spawnSync(process.execPath, [script('serve'), projectOrExit(dir), extra ?? '4317'], { stdio: 'inherit' });
else if (command === 'hook') await hook(arg);
else {
  console.log(USAGE);
  if (command && command !== 'help') process.exit(1);
}
