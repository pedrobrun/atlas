import { isStale } from './types.ts';
import type { Atlas, Bilingual, Edge } from './types.ts';

function english<K extends string>(o: Bilingual<K> | undefined, k: K): string {
  const fields: Partial<Record<string, string>> = { ...o };
  return fields[`${k}_en`] || fields[k] || '';
}

function neighbours(edges: Edge[], pick: (e: Edge) => boolean, side: 'from' | 'to') {
  const weight = new Map<string, number>();
  for (const e of edges) if (pick(e)) weight.set(e[side], (weight.get(e[side]) ?? 0) + e.w);
  return [...weight]
    .sort((a, b) => b[1] - a[1])
    .map(([id, w]) => `${id} (${w})`)
    .join(', ');
}

function commonDir(paths: string[]) {
  const parts = paths.map((p) => p.split('/'));
  const shared: string[] = [];
  for (let i = 0; parts.every((p) => p.length > i + 1 && p[i] === parts[0][i]); i++) shared.push(parts[0][i]);
  return shared.join('/');
}

export function renderContext(atlas: Atlas): string {
  const { config, system, nodes, edges, caps, flows, decisions, legacy } = atlas;
  const capName = new Map(caps.map((c) => [c.id, english(c, 'name')]));
  const lines = [
    `# Atlas — ${config.name}`,
    '',
    `Generated ${atlas.generatedAt}. Paths are relative to the project root (the cwd).`,
    '',
  ];
  if (system.tech || system.biz) lines.push(english(system, 'tech'), english(system, 'biz'), '');

  lines.push('## Sources (repos)');
  for (const n of nodes.filter((x) => x.kind === 'repo')) {
    const role = n.role ? ` (${n.role})` : '';
    const desc = n.desc ? '— ' + english(n.desc, 'tech') : '';
    lines.push(`- ${n.id}: ${n.name} @ ${n.branch} ${n.sha}${role} ${desc}`);
  }

  if (caps.length) {
    lines.push('', '## Capabilities (semantic grouping of modules)');
    for (const c of caps) {
      const members = nodes.filter((n) => n.cap === c.id).map((n) => n.id);
      lines.push(
        `- cap:${c.id} — ${english(c, 'name')}: ${english(c, 'tech')}`,
        `  modules: ${members.join(', ')}`,
      );
    }
  }

  lines.push(
    '',
    '## Modules',
    'Format: id · directory · lines · capability · status. Then description, evidence, dependencies (weight = import count).',
    '',
  );
  for (const n of nodes.filter((x) => x.kind === 'module')) {
    const flags = [isStale(n) ? 'STALE description' : null, n.legacy ? `legacy:${n.legacy}` : null]
      .filter(Boolean)
      .join(', ');
    const cap = n.cap ? ' · ' + capName.get(n.cap) : '';
    lines.push(
      `### ${n.id}`,
      `${commonDir(n.files.map((f) => f.path))} · ${n.loc} lines${cap}${flags ? ' · ' + flags : ''}`,
    );
    if (n.desc) {
      const biz = n.desc.biz ? '— ' + english(n.desc, 'biz') : '';
      lines.push(`${english(n.desc, 'tech')} ${biz} [${n.desc.confidence}]`);
    }
    if (n.desc?.anchors)
      lines.push(`evidence: ${n.desc.anchors.map((a) => `${a.path}:${a.line} (${a.note})`).join('; ')}`);
    const uses = neighbours(edges, (e) => e.from === n.id, 'to');
    const reasons = Object.entries(n.uses ?? {}).map(([id, u]) => `${id}: ${english(u, 'why')}`);
    const usedBy = neighbours(edges, (e) => e.to === n.id, 'from');
    if (uses) lines.push(`uses: ${uses}`);
    if (reasons.length) lines.push(`why it uses them: ${reasons.join(' | ')}`);
    if (usedBy) lines.push(`used by: ${usedBy}`);
    lines.push(`files: ${n.files.map((f) => f.path.split('/').pop()).join(', ')}`, '');
  }

  const systems = nodes.filter((n) => n.kind === 'external');
  if (systems.length) {
    lines.push('## External systems', 'Systems outside the codebase. Refer to them by id like modules.', '');
    for (const n of systems) {
      const callers = edges.filter((e) => e.to === n.id).map((e) => `${e.from} (${e.at})`);
      lines.push(`### ${n.id} · ${n.name}${n.system ? ' · ' + n.system : ''}`);
      if (n.desc) lines.push(english(n.desc, 'tech') || english(n.desc, 'biz'));
      lines.push(`called from: ${callers.join(', ') || 'nowhere found'}`, '');
    }
  }

  if (flows.length) {
    lines.push('## Documented flows');
    for (const f of flows) {
      lines.push(`### flow:${f.id} — ${english(f, 'name')} [${f.confidence}]`);
      f.steps.forEach((s, i) => lines.push(`${i + 1}. ${s.unit} — ${english(s, 'text')} (${s.anchor})`));
      lines.push('');
    }
  }
  if (decisions.length) {
    lines.push('## Decisions');
    for (const d of decisions) lines.push(`- ${d.id} ${english(d, 'name')} — ${d.path}`);
    lines.push('');
  }
  if (Object.keys(legacy).length) {
    lines.push('## Legacy statuses');
    for (const [k, v] of Object.entries(legacy)) lines.push(`- ${k}: ${english(v, 'note')}`);
  }
  return lines.join('\n');
}

export interface BriefPaths {
  cli: string;
  context: string;
  semantic: string;
  reference: string;
}

export function renderBrief(atlas: Atlas, paths: BriefPaths): string {
  const modules = atlas.nodes.filter((n) => n.kind === 'module');
  const stale = modules.filter(isStale).map((n) => n.id);
  const lines = [`# Atlas map of ${atlas.config.name}`, ''];
  if (atlas.system.tech || atlas.system.biz) lines.push(english(atlas.system, 'tech'), '');
  if (atlas.caps.length) {
    lines.push('Capabilities:');
    for (const c of atlas.caps) {
      const count = modules.filter((n) => n.cap === c.id).length;
      lines.push(`- ${english(c, 'name')} (${count} modules): ${english(c, 'biz') || english(c, 'tech')}`);
    }
    lines.push('');
  }
  const systems = atlas.nodes.filter((n) => n.kind === 'external').map((n) => n.name);
  if (systems.length) lines.push(`External systems: ${systems.join(', ')}.`, '');
  lines.push(
    `The full map is ${paths.context}: every module with its description, dependencies and evidence, plus documented flows and decisions. Read the parts you need before changing an area you don't know.`,
    '',
    'Keep the map true as you work:',
    `- When you add, remove or rename a module, or change a documented flow, update ${paths.semantic} in the same change (format: ${paths.reference}) and run \`node ${paths.cli} build\`. Fix whatever it reports.`,
    '- Descriptions of modules whose code changed are rewritten on their own after your turn.',
    `- \`node ${paths.cli} open\` shows the map in 3D.`,
  );
  if (stale.length) lines.push('', `Descriptions out of date right now: ${stale.slice(0, 20).join(', ')}.`);
  return lines.join('\n');
}
