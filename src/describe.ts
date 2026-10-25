import fs from 'node:fs';
import type { Desc, DescribeResponse, DescriptionsStore, Skeleton } from './types.ts';
import type { DescDraft } from './parse.ts';
import { parseDescription } from './parse.ts';
import { atlasPaths, moduleHash, readJsonOr } from './project.ts';
import { contextSection, describeFlags, describePrompt, fencedJson } from './agent.ts';
import { runClaude } from './claude.ts';

const toDesc = (o: DescDraft, describedHash: string): Desc => ({
  biz: o.biz_pt,
  biz_en: o.biz_en,
  tech: o.tech_pt,
  tech_en: o.tech_en,
  confidence: 'generated',
  describedHash,
});

export function describeModule(project: string, id: string): Promise<DescribeResponse> | null {
  const paths = atlasPaths(project);
  const skeleton = readJsonOr<Skeleton>(paths.skeleton, { generatedAt: '', nodes: [], edges: [] });
  const mod = skeleton.nodes.find((n) => n.id === id && n.kind === 'module');
  if (!mod) return null;
  const section = contextSection(fs.readFileSync(paths.context, 'utf8'), id);
  const child = runClaude(
    project,
    describeFlags(describePrompt({ id, section, files: mod.files.map((f) => f.path) })),
  );
  let out = '';
  child.stdout.on('data', (d: Buffer) => (out += d));
  child.stderr.on('data', (d: Buffer) => process.stderr.write(d));
  return new Promise((resolve, reject) => {
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
        resolve({ module: got.module ? store.nodes[id] : null, files });
      } catch (e) {
        reject(new Error(`describe ${id} failed: ${e}\n${out.slice(-400)}`));
      }
    });
  });
}
