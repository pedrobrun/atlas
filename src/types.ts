// The contract between a project's .atlas folder, the scripts, the server and the viewer.

export type Lang = 'en' | 'pt';
export type Confidence = 'verified' | 'inferred' | 'generated';

// ---------- <project>/.atlas/atlas.config.json ----------

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

export interface AtlasConfig {
  name: string;
  /** Language the viewer opens in. */
  language?: Lang;
  languages?: Lang[];
  sources: SourceConfig[];
  chat?: { suggestions?: Partial<Record<Lang, string[]>> };
}

// ---------- text ----------
// Content fields hold the project's base text; an `<field>_en` twin holds English.
// The viewer picks by language and falls back to the other.

export interface Anchor { path: string; line: number; note: string; note_en?: string }

export interface Desc {
  biz?: string; biz_en?: string;
  tech?: string; tech_en?: string;
  confidence?: Confidence;
  anchors?: Anchor[];
  /** Hash of the code the text was written against; differs from the node's hash when stale. */
  describedHash?: string;
}

// ---------- skeleton (written by skeleton.ts) ----------

export interface FileEntry { path: string; hash: string; loc: number; desc?: Desc; stale?: boolean }

export type NodeKind = 'repo' | 'area' | 'module';

export interface SkNode {
  id: string;
  kind: NodeKind;
  name: string;
  parent?: string;
  files: FileEntry[];
  loc: number;
  // repos
  sha?: string;
  branch?: string;
  role?: string | null;
  // added by build.ts
  hash?: string;
  cap?: string | null;
  desc?: Desc;
  stale?: boolean;
  legacy?: string;
}

export interface Edge { from: string; to: string; kind: 'uses' | 'consumes'; w: number }

export interface Skeleton { generatedAt: string; nodes: SkNode[]; edges: Edge[] }

// ---------- semantic layer (<project>/.atlas/semantic.{ts,mjs}) ----------

export interface Capability {
  id: string;
  name: string; name_en?: string;
  biz?: string; biz_en?: string;
  tech?: string; tech_en?: string;
  /** Module ids this capability claims. */
  rules: RegExp[];
}

export interface FlowStep { unit: string; text: string; text_en?: string; anchor: string | null }

export interface Flow {
  id: string;
  name: string; name_en?: string;
  biz?: string; biz_en?: string;
  confidence: Confidence;
  steps: FlowStep[];
  /** Documented from the chat rather than written by hand. */
  local?: boolean;
}

export interface Invariant {
  id: string;
  name: string; name_en?: string;
  biz?: string; biz_en?: string;
  guard: 'test' | 'type' | 'partial' | 'none';
  guardPath: string;
  scope: string[];
  decision?: string;
}

export interface Decision { id: string; name: string; name_en?: string; path: string; units: string[]; note?: string; note_en?: string }

export interface Concept {
  id: string;
  name: string; name_en?: string;
  biz?: string; biz_en?: string;
  store?: string;
  confidence?: Confidence;
  owner: string[]; writes: string[]; reads: string[];
}

export interface LegacyStatus { label: string; label_en?: string; note: string; note_en?: string }

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

// ---------- the store the agent writes (<project>/.atlas/*.local.json) ----------

export interface DescriptionsStore { nodes: Record<string, Desc>; files: Record<string, Desc> }

// ---------- what build.ts embeds in the page ----------

export interface PageSource { id: string; name: string; color?: string; role: string | null }

export interface PageData {
  config: { name: string; lang: Lang; languages: Lang[]; sources: PageSource[]; suggestions: Partial<Record<Lang, string[]>> };
  system: Desc;
  generatedAt: string;
  nodes: SkNode[];
  edges: Edge[];
  caps: Omit<Capability, 'rules'>[];
  invariants: Invariant[];
  decisions: Decision[];
  concepts: Concept[];
  flows: Flow[];
  legacy: Record<string, LegacyStatus>;
}

// ---------- server protocols ----------

export interface ChatRequest { message: string; session: string | null; lang: Lang; about: string | null }

/** /chat streams one JSON object per line. */
export type ChatEvent =
  | { type: 'status'; text: string }
  | { type: 'delta'; text: string }
  | { type: 'done'; text: string; session?: string; error: string | null };

export interface DescribeRequest { id: string }
export interface DescribeResponse { module: Desc | null; files: Record<string, Desc> }

export interface SaveFlowResponse { ok: boolean; log: string[] }

/** What a drafted flow looks like when the agent writes it (both languages inline). */
export interface FlowDraft {
  id?: string;
  name_en?: string; name_pt?: string;
  biz_en?: string; biz_pt?: string;
  confidence?: string;
  steps?: { unit: string; text_en?: string; text_pt?: string; anchor?: string }[];
}
