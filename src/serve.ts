import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { ChatEvent, ChatRequest, DescribeRequest, Flow, SaveFlowResponse } from './types.ts';
import { atlasPaths, readJsonOr } from './project.ts';
import { parseChatRequest, parseDescribeRequest, parseFlow, parseFlows } from './parse.ts';
import { chatFlags, chatSystemPrompt, readAgentLine } from './agent.ts';
import { runClaude } from './claude.ts';
import { describeModule } from './describe.ts';

const project = path.resolve(process.argv[2] || '.');
const port = +(process.argv[3] || 4317);
const paths = atlasPaths(project);

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
  const child = runClaude(project, chatFlags(message, system, session));
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

function describe(res: http.ServerResponse, { id }: DescribeRequest) {
  const described = describeModule(project, id);
  if (!described) {
    res.writeHead(404);
    res.end();
    return;
  }
  described.then(
    (body) => {
      rebuild();
      sendJson(res, 200, body);
    },
    (e) => {
      process.stderr.write(`${e.message}\n`);
      res.writeHead(500);
      res.end(String(e));
    },
  );
}

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
  } else if (req.url === '/health') {
    sendJson(res, 200, { project });
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
