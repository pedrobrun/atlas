export type Lang = 'en' | 'pt';
export type Confidence = 'verified' | 'inferred' | 'generated';

export interface ModuleRule {
  /** Regex over a file path relative to the source; first matching rule wins. */
  match: string;
  /** Area id, may use capture groups ($1…). */
  area: string;
  /** Display name for the area, if it differs from the id. */
  areaName?: string;
  /** Module name inside the area, may use capture groups. */
  module: string;
}

export interface SourceConfig {
  id: string;
  /** Folder of the git repo, relative to the project. */
  dir: string;
  name?: string;
  /** CSS hex color, e.g. "#3b9ae8". */
  color?: string;
  /** e.g. "legacy" for code being extracted elsewhere. */
  role?: string;
  /** Import prefixes resolved inside this source, e.g. { "@/": "src/" }. */
  aliases?: Record<string, string>;
  modules: ModuleRule[];
}

/** A system outside the codebase (database, SaaS, queue, AI API) and how to spot code that talks to it. */
export interface ExternalConfig {
  id: string;
  name: string;
  /** e.g. "database", "payments", "queue"; shown in the viewer. */
  kind?: string;
  /** Import specifiers; "@aws-sdk/*" matches every subpath. */
  packages?: string[];
  /** Environment variable prefixes, e.g. "STRIPE_". */
  env?: string[];
  /** Regexes over source text, for systems reached without an SDK. */
  code?: string[];
}

export interface AtlasConfig {
  name: string;
  /** Language the viewer opens in. */
  language?: Lang;
  sources: SourceConfig[];
  externals?: ExternalConfig[];
  chat?: { suggestions?: Partial<Record<Lang, string[]>> };
}

export type Bilingual<K extends string> = { [P in K]?: string } & { [P in `${K}_en`]?: string };

export function textOf<K extends string>(
  o: Bilingual<K> | null | undefined,
  k: K,
  lang: 'en' | 'base',
): string {
  const fields: Partial<Record<string, string>> = { ...o };
  const english = fields[`${k}_en`];
  const base = fields[k];
  return (lang === 'en' ? (english ?? base) : (base ?? english)) ?? '';
}

export interface Anchor extends Bilingual<'note'> {
  path: string;
  line: number;
  note: string;
}

export interface Desc extends Bilingual<'biz' | 'tech'> {
  confidence?: Confidence;
  anchors?: Anchor[];
  describedHash?: string;
}

export interface FileEntry {
  path: string;
  hash: string;
  loc: number;
  desc?: Desc;
}

export type NodeKind = 'repo' | 'area' | 'module' | 'external';

export interface SkNode {
  id: string;
  kind: NodeKind;
  name: string;
  parent?: string;
  files: FileEntry[];
  loc: number;
  sha?: string;
  branch?: string;
  role?: string | null;
  /** For an external node, what kind of system it is. */
  system?: string;
}

export interface Edge {
  from: string;
  to: string;
  kind: 'uses' | 'consumes' | 'calls';
  w: number;
  /** First place the link shows up, as path:line. */
  at?: string;
}

export interface Skeleton {
  generatedAt: string;
  nodes: SkNode[];
  edges: Edge[];
}

export interface Capability extends Bilingual<'name' | 'biz' | 'tech'> {
  id: string;
  name: string;
  /** Module ids this capability claims. */
  rules: RegExp[];
}

export interface FlowStep extends Bilingual<'text'> {
  unit: string;
  text: string;
  anchor: string | null;
}

export interface Flow extends Bilingual<'name' | 'biz'> {
  id: string;
  name: string;
  confidence: Confidence;
  steps: FlowStep[];
}

export interface Invariant extends Bilingual<'name' | 'biz'> {
  id: string;
  name: string;
  guard: 'test' | 'type' | 'partial' | 'none';
  guardPath: string;
  scope: string[];
  decision?: string;
}

export interface Decision extends Bilingual<'name' | 'note'> {
  id: string;
  name: string;
  path: string;
  units: string[];
}

export interface Concept extends Bilingual<'name' | 'biz'> {
  id: string;
  name: string;
  store?: string;
  confidence?: Confidence;
  owner: string[];
  writes: string[];
  reads: string[];
}

export interface LegacyStatus extends Bilingual<'label' | 'note'> {
  label: string;
  note: string;
}

export interface Semantic {
  system?: Desc;
  caps?: Capability[];
  desc?: Record<string, Desc>;
  legacy?: Record<string, LegacyStatus>;
  legacyStatus?: Record<string, string>;
  invariants?: Invariant[];
  decisions?: Decision[];
  concepts?: Concept[];
  flows?: Flow[];
}

/** English twins for the semantic layer, keyed like it. */
export interface SemanticEn {
  system?: Desc;
  caps?: Record<string, Partial<Capability>>;
  desc?: Record<string, Desc>;
  anchorNotes?: Record<string, string>;
  legacy?: Record<string, Partial<LegacyStatus>>;
  invariants?: Record<string, Partial<Invariant>>;
  decisions?: Record<string, Partial<Decision>>;
  concepts?: Record<string, Partial<Concept>>;
  flows?: Record<string, { name?: string; biz?: string; steps?: string[] }>;
}

export interface DescriptionsStore {
  nodes: Record<string, Desc>;
  files: Record<string, Desc>;
}

export interface MapNode extends SkNode {
  hash: string;
  cap?: string | null;
  desc?: Desc;
  legacy?: string;
}

export const isStale = (n: MapNode) => !!n.desc && n.desc.describedHash !== n.hash;

export interface Atlas {
  config: PageData['config'];
  generatedAt: string;
  system: Desc;
  nodes: MapNode[];
  edges: Edge[];
  caps: Capability[];
  invariants: Invariant[];
  decisions: Decision[];
  flows: Flow[];
  legacy: Record<string, LegacyStatus>;
}

export interface PageSource {
  id: string;
  name: string;
  color?: string;
}

export interface PageData {
  config: { name: string; lang: Lang; sources: PageSource[]; suggestions: Partial<Record<Lang, string[]>> };
  system: Desc;
  nodes: MapNode[];
  edges: Edge[];
  caps: Omit<Capability, 'rules'>[];
  invariants: Invariant[];
  flows: Flow[];
  legacy: Record<string, LegacyStatus>;
}

export interface ChatRequest {
  message: string;
  session: string | null;
  lang: Lang;
  about: string | null;
}

export type ChatEvent =
  | { type: 'status'; text: string }
  | { type: 'delta'; text: string }
  | { type: 'done'; text: string; session?: string; error: string | null };

export interface DescribeRequest {
  id: string;
}
export interface DescribeResponse {
  module: Desc | null;
  files: Record<string, Desc>;
}

export interface SaveFlowResponse {
  ok: boolean;
  log: string[];
}

export interface FlowDraft {
  id?: string;
  name_en?: string;
  name_pt?: string;
  biz_en?: string;
  biz_pt?: string;
  confidence?: string;
  steps?: { unit: string; text_en?: string; text_pt?: string; anchor?: string }[];
}
