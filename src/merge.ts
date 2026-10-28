import type { AtlasConfig, Atlas, DescriptionsStore, Flow, MapNode, Semantic, Skeleton } from './types.ts';
import { moduleHash } from './project.ts';

export interface MergeInput {
  config: AtlasConfig;
  skeleton: Skeleton;
  semantic: Semantic;
  descriptions: DescriptionsStore;
  savedFlows: Flow[];
}

export interface MergeResult {
  atlas: Atlas;
  unknownIds: string[];
  modulesWithoutCapability: string[];
  droppedFlowSteps: string[];
}

export function mergeMap(input: MergeInput): MergeResult {
  const { config, skeleton, descriptions } = input;
  const semantic = structuredClone(input.semantic);
  const caps = semantic.caps ?? [];
  const known = new Set(skeleton.nodes.map((n) => n.id));

  const nodes: MapNode[] = skeleton.nodes.map((sk) => {
    const n: MapNode = { ...structuredClone(sk), hash: moduleHash(sk.files) };
    if (n.kind === 'module') n.cap = caps.find((c) => c.rules.some((r) => r.test(n.id)))?.id ?? null;
    const written = semantic.desc?.[n.id];
    const fromSemantic = written && { ...written, describedHash: written.describedHash ?? n.hash };
    const stored = descriptions.nodes[n.id];
    n.desc = [fromSemantic, stored].find((d) => d?.describedHash === n.hash) ?? fromSemantic ?? stored;
    if (!n.desc) delete n.desc;
    const legacy = semantic.legacyStatus?.[n.id];
    if (legacy) n.legacy = legacy;
    for (const f of n.files) if (descriptions.files[f.path]) f.desc = descriptions.files[f.path];
    const uses = descriptions.uses?.[n.id];
    if (uses) n.uses = uses;
    return n;
  });

  const unknownIds: string[] = [];
  const check = (where: string) => (id: string) => {
    if (!known.has(id)) unknownIds.push(`${where}: ${id}`);
  };
  Object.keys(semantic.desc ?? {}).forEach(check('desc'));
  Object.keys(semantic.legacyStatus ?? {}).forEach(check('legacy'));
  for (const d of semantic.decisions ?? []) d.units.forEach(check(`decision ${d.id}`));
  for (const c of semantic.concepts ?? [])
    [...c.owner, ...c.writes, ...c.reads].forEach(check(`concept ${c.id}`));
  for (const f of semantic.flows ?? []) f.steps.forEach((s) => check(`flow ${f.id}`)(s.unit));

  const legacy = semantic.legacy ?? {};
  const flows = semantic.flows ?? [];

  const droppedFlowSteps: string[] = [];
  for (const f of structuredClone(input.savedFlows)) {
    const gone = f.steps.filter((s) => !known.has(s.unit)).map((s) => s.unit);
    if (gone.length)
      droppedFlowSteps.push(`flow ${f.id}: unknown units ${gone.join(', ')}; dropped those steps`);
    flows.push({ ...f, steps: f.steps.filter((s) => known.has(s.unit)) });
  }

  return {
    atlas: {
      config: {
        name: config.name,
        lang: config.language || 'en',
        sources: config.sources.map(({ id, name, dir, color }) => ({ id, name: name || dir, color })),
        suggestions: config.chat?.suggestions || {},
      },
      generatedAt: skeleton.generatedAt,
      system: { ...semantic.system },
      nodes,
      edges: skeleton.edges,
      caps,
      decisions: semantic.decisions ?? [],
      flows,
      legacy,
    },
    unknownIds,
    modulesWithoutCapability: caps.length
      ? nodes.filter((n) => n.kind === 'module' && !n.cap).map((n) => n.id)
      : [],
    droppedFlowSteps,
  };
}
