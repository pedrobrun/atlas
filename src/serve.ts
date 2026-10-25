// Local server: serves a project's map and answers chat questions by running the user's
// own Claude Code headless in the project, read-only, with the map as context.
// Usage: node src/serve.ts <project> [port]   (the project has a .atlas folder; see README)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type {
  ChatEvent,
  ChatRequest,
  Desc,
  DescribeRequest,
  DescribeResponse,
  DescriptionsStore,
  Flow,
  SaveFlowResponse,
  Skeleton,
} from './types.ts';
import { atlasPaths, moduleHash, readJsonOr } from './project.ts';
import type { DescDraft } from './parse.ts';
import { parseChatRequest, parseDescribeRequest, parseDescription, parseFlow, parseFlows } from './parse.ts';
import {
  chatFlags,
  chatSystemPrompt,
  contextSection,
  describeFlags,
  describePrompt,
  fencedJson,
  readAgentLine,
} from './agent.ts';

const project = path.resolve(process.argv[2] || '.');
const port = +(process.argv[3] || 4317);
const paths = atlasPaths(project);

const claude = (args: string[]) => spawn('claude', args, { cwd: project, stdio: ['ignore', 'pipe', 'pipe'] });
const rebuild = () =>
  spawn(process.execPath, [path.join(import.meta.dirname, 'build.ts'), project], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
const sendJson = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

function chat(res: http.ServerResponse, { message, session, lang, about }: ChatRequest) {
  res.writeHead(200, { 'content-type': 'application/x-ndjson', 'cache-control': 'no-cache' });
  const send = (e: ChatEvent) => res.write(JSON.stringify(e) + '\n');
  const system = chatSystemPrompt({ lang, about, contextPath: paths.context });
  const child = claude(chatFlags(message, system, session));
  let pending = '';
  child.stdout.on('data', (chunk: Buffer) => {
    pending += chunk;
    let nl;
    while ((nl = pending.indexOf('\n')) >= 0) {
      readAgentLine(pending.slice(0, nl), project).forEach(send);
      pending = pending.slice(nl + 1);
    }
  });
  child.stderr.on('data', (d: Buffer) => process.stderr.write(d));
  child.on('close', () => res.end());
  // The browser going away (not the request body ending) is what should stop the agent.
  res.on('close', () => {
    if (!res.writableEnded) child.kill();
  });
}

// When someone opens a module with no description, the agent reads its files and describes the
// module and each file. Cached in descriptions.local.json, keyed to the hash of the code it read.
const toDesc = (o: DescDraft, describedHash: string): Desc => ({
  biz: o.biz_pt,
  biz_en: o.biz_en,
  tech: o.tech_pt,
  tech_en: o.tech_en,
  confidence: 'generated',
  describedHash,
});

function describe(res: http.ServerResponse, { id }: DescribeRequest) {
  const skeleton = readJsonOr<Skeleton>(paths.skeleton, { generatedAt: '', nodes: [], edges: [] });
  const mod = skeleton.nodes.find((n) => n.id === id && n.kind === 'module');
  if (!mod) {
    res.writeHead(404);
    res.end();
    return;
  }
  const section = contextSection(fs.readFileSync(paths.context, 'utf8'), id);
  const child = claude(describeFlags(describePrompt({ id, section, files: mod.files.map((f) => f.path) })));
  let out = '';
  child.stdout.on('data', (d: Buffer) => (out += d));
  child.stderr.on('data', (d: Buffer) => process.stderr.write(d));
  child.on('close', () => {
    try {
      const got = parseDescription(fencedJson(JSON.parse(out).result || ''));
      const store = readJsonOr<DescriptionsStore>(paths.descriptions, { nodes: {}, files: {} });
      if (got.module) store.nodes[id] = toDesc(got.module, moduleHash(mod.files));
      const files: Record<string, Desc> = {};
      for (const f of mod.files) {
        const draft = got.files[f.path];
        if (draft) files[f.path] = store.files[f.path] = toDesc(draft, f.hash);
      }
      fs.writeFileSync(paths.descriptions, JSON.stringify(store, null, 2));
      rebuild(); // so a reload keeps them
      sendJson(res, 200, { module: got.module ? store.nodes[id] : null, files } satisfies DescribeResponse);
    } catch (e) {
      process.stderr.write(`describe ${id} failed: ${e}\n${out.slice(-400)}\n`);
      res.writeHead(500);
      res.end(String(e));
    }
  });
}

// Saved flows are kept next to the semantic layer and the page is rebuilt.
function saveFlow(res: http.ServerResponse, flow: Flow) {
  const flows = parseFlows(readJsonOr<unknown>(paths.flows, []));
  const i = flows.findIndex((f) => f.id === flow.id);
  if (i >= 0) flows[i] = flow;
  else flows.push(flow);
  fs.writeFileSync(paths.flows, JSON.stringify(flows, null, 2));
  let log = '';
  const build = rebuild();
  build.stderr.on('data', (d: Buffer) => (log += d));
  build.on('close', (code) => {
    sendJson(res, code ? 500 : 200, {
      ok: !code,
      log: log.trim().split('\n').slice(-3),
    } satisfies SaveFlowResponse);
  });
}

// Each route parses its body first; a body it can't use is a 400 with the reason.
const routes: Record<string, (res: http.ServerResponse, body: unknown) => void> = {
  '/chat': (res, body) => chat(res, parseChatRequest(body)),
  '/describe': (res, body) => describe(res, parseDescribeRequest(body)),
  '/flows': (res, body) => saveFlow(res, parseFlow(body)),
};

function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  const route = req.method === 'POST' ? routes[req.url ?? ''] : undefined;
  if (route) {
    let body = '';
    req.on('data', (d: Buffer) => (body += d));
    req.on('end', () => {
      try {
        route(res, JSON.parse(body));
      } catch (e) {
        res.writeHead(400);
        res.end(String(e));
      }
    });
  } else if (req.url === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    fs.createReadStream(paths.page).pipe(res);
  } else {
    res.writeHead(404);
    res.end();
  }
}

http
  .createServer(handle)
  .listen(port, '127.0.0.1', () => console.log(`atlas: http://127.0.0.1:${port}  (project ${project})`));
