// Joins the skeleton with the semantic layer, the agent-written descriptions and the saved
// flows into one map. Pure: no IO; it reports problems instead of exiting.
import type {
  AtlasConfig,
  Atlas,
  DescriptionsStore,
  Flow,
  MapNode,
  Semantic,
  SemanticEn,
  Skeleton,
} from './types.ts';
import { moduleHash } from './project.ts';

export interface MergeInput {
  config: AtlasConfig;
  skeleton: Skeleton;
  semantic: Semantic;
  english: SemanticEn;
  descriptions: DescriptionsStore;
  savedFlows: Flow[];
}

export interface MergeResult {
  atlas: Atlas;
  /** Semantic entries pointing at ids the skeleton doesn't have. Any of these fails the build. */
  unknownIds: string[];
  modulesWithoutCapability: string[];
  droppedFlowSteps: string[];
}

/** Adds `<field>_en` for every English string given, next to the base-language field. */
const withEnglish = <T extends object>(target: T, english: object | undefined): T =>
  Object.assign(
    target,
    Object.fromEntries(
      Object.entries(english ?? {})
        .filter(([, v]) => typeof v === 'string')
        .map(([k, v]) => [`${k}_en`, v]),
    ),
  );

export function mergeMap(input: MergeInput): MergeResult {
  const { config, skeleton, descriptions } = input;
  const semantic = structuredClone(input.semantic);
  const en = input.english;
  const caps = semantic.caps ?? [];
  const known = new Set(skeleton.nodes.map((n) => n.id));

  const nodes: MapNode[] = skeleton.nodes.map((sk) => {
    const n: MapNode = { ...structuredClone(sk), hash: moduleHash(sk.files) };
    if (n.kind === 'module') n.cap = caps.find((c) => c.rules.some((r) => r.test(n.id)))?.id ?? null;
    const written = semantic.desc?.[n.id];
    if (written) n.desc = { ...written, describedHash: written.describedHash ?? n.hash };
    const legacy = semantic.legacyStatus?.[n.id];
    if (legacy) n.legacy = legacy;
    if (!n.desc && descriptions.nodes[n.id]) n.desc = descriptions.nodes[n.id];
    for (const f of n.files) if (descriptions.files[f.path]) f.desc = descriptions.files[f.path];
    if (n.desc) {
      withEnglish(n.desc, en.desc?.[n.id]);
      for (const a of n.desc.anchors ?? []) {
        const note = en.anchorNotes?.[a.note];
        if (note) a.note_en = note;
      }
    }
    return n;
  });

  const unknownIds: string[] = [];
  const check = (where: string) => (id: string) => {
    if (!known.has(id)) unknownIds.push(`${where}: ${id}`);
  };
  Object.keys(semantic.desc ?? {}).forEach(check('desc'));
  Object.keys(semantic.legacyStatus ?? {}).forEach(check('legacy'));
  for (const i of semantic.invariants ?? []) i.scope.forEach(check(`invariant ${i.id}`));
  for (const d of semantic.decisions ?? []) d.units.forEach(check(`decision ${d.id}`));
  for (const c of semantic.concepts ?? [])
    [...c.owner, ...c.writes, ...c.reads].forEach(check(`concept ${c.id}`));
  for (const f of semantic.flows ?? []) f.steps.forEach((s) => check(`flow ${f.id}`)(s.unit));

  for (const c of caps) withEnglish(c, en.caps?.[c.id]);
  const legacy = semantic.legacy ?? {};
  for (const [k, v] of Object.entries(legacy)) withEnglish(v, en.legacy?.[k]);
  const invariants = (semantic.invariants ?? []).map((i) => withEnglish(i, en.invariants?.[i.id]));
  const decisions = (semantic.decisions ?? []).map((d) => withEnglish(d, en.decisions?.[d.id]));
  const flows = (semantic.flows ?? []).map((f) => {
    const english = en.flows?.[f.id];
    withEnglish(f, english);
    if (english?.steps) f.steps.forEach((step, i) => (step.text_en = english.steps![i]));
    return f;
  });

  // Flows documented from the chat already carry both languages; steps whose module is gone are dropped.
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
      system: withEnglish({ ...semantic.system }, en.system),
      nodes,
      edges: skeleton.edges,
      caps,
      invariants,
      decisions,
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
