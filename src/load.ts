import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DescriptionsStore, Semantic, SemanticEn, Skeleton } from './types.ts';
import { atlasPaths, moduleHash, readJson, readJsonOr } from './project.ts';
import { mergeMap } from './merge.ts';
import { isRecord, parseConfig, parseFlows, parseSemantic } from './parse.ts';

async function loadModule<T>(store: string, name: string): Promise<Partial<T>> {
  for (const ext of ['.ts', '.mjs', '.js']) {
    const file = path.join(store, name + ext);
    if (fs.existsSync(file)) return { ...(await import(pathToFileURL(file).href)) };
  }
  return {};
}

function stampDescriptions(file: string, skeleton: Skeleton) {
  const raw = readJson(file);
  if (!isRecord(raw) || !isRecord(raw.desc)) return;
  const hashes = new Map(skeleton.nodes.map((n) => [n.id, moduleHash(n.files)]));
  let stamped = 0;
  for (const [id, d] of Object.entries(raw.desc)) {
    if (!isRecord(d) || d.describedHash !== undefined || !hashes.has(id)) continue;
    d.describedHash = hashes.get(id);
    stamped++;
  }
  if (stamped) fs.writeFileSync(file, JSON.stringify(raw, null, 2) + '\n');
}

async function loadSemantic(store: string, skeleton: Skeleton): Promise<Semantic> {
  const json = path.join(store, 'semantic.json');
  if (!fs.existsSync(json)) return loadModule<Semantic>(store, 'semantic');
  stampDescriptions(json, skeleton);
  return parseSemantic(readJson(json));
}

export async function loadAtlas(project: string) {
  const paths = atlasPaths(project);
  const skeleton = readJson(paths.skeleton) as Skeleton;
  return mergeMap({
    config: parseConfig(readJson(paths.config)),
    skeleton,
    semantic: await loadSemantic(paths.store, skeleton),
    english: await loadModule<SemanticEn>(paths.store, 'semantic_en'),
    descriptions: readJsonOr<DescriptionsStore>(paths.descriptions, { nodes: {}, files: {} }),
    savedFlows: parseFlows(readJsonOr<unknown>(paths.flows, [])),
  });
}
