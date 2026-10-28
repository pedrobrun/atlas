import fs from 'node:fs';
import path from 'node:path';
import type { Desc, DescribeResponse, DescriptionsStore, Skeleton, Use } from './types.ts';
import type { DescDraft, UseDraft } from './parse.ts';
import { parseDescription } from './parse.ts';
import { atlasPaths, moduleHash, readJsonOr } from './project.ts';
import { contextSection, describeFlags, describePrompt, fencedJson } from './agent.ts';
import { runClaude } from './claude.ts';

const TIMEOUT_MS = 4 * 60_000;

const MAX_LINES = 400;

function source(project: string, file: string) {
  const lines = fs.readFileSync(path.join(project, file), 'utf8').split('\n');
  const cut = lines.length > MAX_LINES ? `\n… ${lines.length - MAX_LINES} more lines` : '';
  return { path: file, text: lines.slice(0, MAX_LINES).join('\n') + cut };
}

const toDesc = (o: DescDraft, describedHash: string): Desc => ({
  biz: o.biz_pt,
  biz_en: o.biz_en,
  tech: o.tech_pt,
  tech_en: o.tech_en,
  confidence: 'generated',
  describedHash,
});

const toUse = (u: UseDraft): Use | null => {
  const why = u.why_pt || u.why_en;
  return why ? { why, why_en: u.why_en || why } : null;
};

export function describeModule(project: string, id: string): Promise<DescribeResponse> | null {
  const paths = atlasPaths(project);
  const skeleton = readJsonOr<Skeleton>(paths.skeleton, { generatedAt: '', nodes: [], edges: [] });
  const mod = skeleton.nodes.find((n) => n.id === id && n.kind === 'module');
  if (!mod) return null;
  const section = contextSection(fs.readFileSync(paths.context, 'utf8'), id);
  const child = runClaude(
    project,
    describeFlags(
      describePrompt({
        id,
        section,
        files: mod.files.map((f) => source(project, f.path)),
        uses: [...new Set(skeleton.edges.filter((e) => e.from === id).map((e) => e.to))],
      }),
    ),
  );
  let out = '';
  child.stdout.on('data', (d: Buffer) => (out += d));
  child.stderr.on('data', (d: Buffer) => process.stderr.write(d));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (signal)
        return reject(new Error(`describe ${id}: the agent took over ${TIMEOUT_MS / 60_000} minutes`));
      try {
        const got = parseDescription(fencedJson(JSON.parse(out).result || ''));
        const store = readJsonOr<DescriptionsStore>(paths.descriptions, { nodes: {}, files: {} });
        if (got.module) store.nodes[id] = toDesc(got.module, moduleHash(mod.files));
        const files: Record<string, Desc> = {};
        for (const f of mod.files) {
          const draft = got.files[f.path];
          if (draft) files[f.path] = store.files[f.path] = toDesc(draft, f.hash);
        }
        const uses: Record<string, Use> = {};
        for (const target of skeleton.edges.filter((e) => e.from === id).map((e) => e.to)) {
          const use = got.uses[target] && toUse(got.uses[target]);
          if (use) uses[target] = use;
        }
        if (Object.keys(uses).length) (store.uses ??= {})[id] = uses;
        fs.writeFileSync(paths.descriptions, JSON.stringify(store, null, 2));
        resolve({ module: got.module ? store.nodes[id] : null, files, uses });
      } catch (e) {
        reject(new Error(`describe ${id} failed: ${e}\n${out.slice(-400)}`));
      }
    });
  });
}
