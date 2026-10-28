import type {
  Anchor,
  AtlasConfig,
  Capability,
  ChatRequest,
  Concept,
  Decision,
  Desc,
  DescribeRequest,
  ExternalConfig,
  Flow,
  FlowStep,
  LegacyStatus,
  ModuleRule,
  Semantic,
  SourceConfig,
} from './types.ts';

type Fields = Record<string, unknown>;

export const isRecord = (v: unknown): v is Fields => typeof v === 'object' && v !== null && !Array.isArray(v);

function object(v: unknown, what: string): Fields {
  if (!isRecord(v)) throw new Error(`${what}: expected an object`);
  return { ...v };
}
function string(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`${what}: expected a string`);
  return v;
}
const optionalString = (v: unknown, what: string) => (v === undefined ? undefined : string(v, what));
const nullableString = (v: unknown, what: string) => (v === null || v === undefined ? null : string(v, what));
function english(f: Fields, keys: string[], what: string): Record<string, string | undefined> {
  return Object.fromEntries(keys.map((k) => [`${k}_en`, optionalString(f[`${k}_en`], `${what}.${k}_en`)]));
}
function array<T>(v: unknown, what: string, item: (x: unknown, what: string) => T): T[] {
  if (!Array.isArray(v)) throw new Error(`${what}: expected an array`);
  return v.map((x, i) => item(x, `${what}[${i}]`));
}
function number(v: unknown, what: string): number {
  if (typeof v !== 'number') throw new Error(`${what}: expected a number`);
  return v;
}
const optional = <T>(v: unknown, what: string, item: (x: unknown, what: string) => T) =>
  v === undefined ? undefined : item(v, what);
function record<T>(v: unknown, what: string, item: (x: unknown, what: string) => T): Record<string, T> {
  return Object.fromEntries(Object.entries(object(v, what)).map(([k, x]) => [k, item(x, `${what}.${k}`)]));
}
const strings = (v: unknown, what: string) => array(v, what, string);
function oneOf<T extends string>(v: unknown, options: readonly T[], what: string): T {
  const found = options.find((o) => o === v);
  if (found === undefined) throw new Error(`${what}: expected one of ${options.join(', ')}`);
  return found;
}
const stringRecord = (v: unknown, what: string) => record(v, what, string);

function moduleRule(v: unknown, what: string): ModuleRule {
  const r = object(v, what);
  return {
    match: string(r.match, `${what}.match`),
    area: string(r.area, `${what}.area`),
    areaName: optionalString(r.areaName, `${what}.areaName`),
    module: string(r.module, `${what}.module`),
  };
}

function external(v: unknown, what: string): ExternalConfig {
  const e = object(v, what);
  return {
    id: string(e.id, `${what}.id`),
    name: string(e.name, `${what}.name`),
    kind: optionalString(e.kind, `${what}.kind`),
    packages: optional(e.packages, `${what}.packages`, strings),
    env: optional(e.env, `${what}.env`, strings),
    code: optional(e.code, `${what}.code`, (x, w) => array(x, w, (r, rw) => regex(r, rw).source)),
  };
}

function source(v: unknown, what: string): SourceConfig {
  const s = object(v, what);
  return {
    id: string(s.id, `${what}.id`),
    dir: string(s.dir, `${what}.dir`),
    name: optionalString(s.name, `${what}.name`),
    color: optionalString(s.color, `${what}.color`),
    role: optionalString(s.role, `${what}.role`),
    aliases: s.aliases === undefined ? undefined : stringRecord(s.aliases, `${what}.aliases`),
    modules: array(s.modules, `${what}.modules`, moduleRule),
  };
}

export function parseConfig(v: unknown): AtlasConfig {
  const c = object(v, 'atlas.config.json');
  const chat = c.chat === undefined ? undefined : object(c.chat, 'chat');
  const suggestions =
    chat?.suggestions === undefined ? undefined : object(chat.suggestions, 'chat.suggestions');
  const list = (lang: 'en' | 'pt') =>
    suggestions?.[lang] === undefined
      ? undefined
      : array(suggestions[lang], `chat.suggestions.${lang}`, string);
  return {
    name: string(c.name, 'name'),
    language: c.language === undefined ? undefined : oneOf(c.language, ['en', 'pt'] as const, 'language'),
    sources: array(c.sources, 'sources', source),
    externals: optional(c.externals, 'externals', (x, w) => array(x, w, external)),
    chat: chat && { suggestions: suggestions && { en: list('en'), pt: list('pt') } },
  };
}

export function parseChatRequest(v: unknown): ChatRequest {
  const r = object(v, 'chat request');
  return {
    message: string(r.message, 'message'),
    session: nullableString(r.session, 'session'),
    lang: oneOf(r.lang, ['en', 'pt'] as const, 'lang'),
    about: nullableString(r.about, 'about'),
  };
}

export function parseDescribeRequest(v: unknown): DescribeRequest {
  return { id: string(object(v, 'describe request').id, 'id') };
}

const confidence = (v: unknown, what: string) => oneOf(v, ['verified', 'generated'] as const, what);

function flowStep(v: unknown, what: string): FlowStep {
  const s = object(v, what);
  return {
    unit: string(s.unit, `${what}.unit`),
    text: string(s.text, `${what}.text`),
    text_en: optionalString(s.text_en, `${what}.text_en`),
    anchor: string(s.anchor, `${what}.anchor`),
  };
}

export function parseFlow(v: unknown, what = 'flow'): Flow {
  const f = object(v, what);
  return {
    id: string(f.id, `${what}.id`),
    name: string(f.name, `${what}.name`),
    name_en: optionalString(f.name_en, `${what}.name_en`),
    biz: optionalString(f.biz, `${what}.biz`),
    biz_en: optionalString(f.biz_en, `${what}.biz_en`),
    confidence: confidence(f.confidence, `${what}.confidence`),
    steps: array(f.steps, `${what}.steps`, flowStep),
  };
}

export const parseFlows = (v: unknown) => array(v, 'flows.local.json', parseFlow);

export interface DescDraft {
  biz_en?: string;
  biz_pt?: string;
  tech_en?: string;
  tech_pt?: string;
}
function descDraft(v: unknown, what: string): DescDraft {
  const d = object(v, what);
  return {
    biz_en: optionalString(d.biz_en, `${what}.biz_en`),
    biz_pt: optionalString(d.biz_pt, `${what}.biz_pt`),
    tech_en: optionalString(d.tech_en, `${what}.tech_en`),
    tech_pt: optionalString(d.tech_pt, `${what}.tech_pt`),
  };
}
export interface UseDraft {
  why_en?: string;
  why_pt?: string;
}
function useDraft(v: unknown, what: string): UseDraft {
  const u = object(v, what);
  return {
    why_en: optionalString(u.why_en, `${what}.why_en`),
    why_pt: optionalString(u.why_pt, `${what}.why_pt`),
  };
}
export function parseDescription(v: unknown): {
  module?: DescDraft;
  files: Record<string, DescDraft>;
  uses: Record<string, UseDraft>;
} {
  const d = object(v, 'description');
  const files = d.files === undefined ? {} : object(d.files, 'files');
  return {
    module: d.module === undefined ? undefined : descDraft(d.module, 'module'),
    uses: d.uses === undefined ? {} : record(d.uses, 'uses', useDraft),
    files: Object.fromEntries(
      Object.entries(files).map(([path, x]) => [path, descDraft(x, `files.${path}`)]),
    ),
  };
}

function anchor(v: unknown, what: string): Anchor {
  const a = object(v, what);
  return {
    path: string(a.path, `${what}.path`),
    line: number(a.line, `${what}.line`),
    note: string(a.note, `${what}.note`),
    ...english(a, ['note'], what),
  };
}

function desc(v: unknown, what: string): Desc {
  const d = object(v, what);
  return {
    biz: optionalString(d.biz, `${what}.biz`),
    tech: optionalString(d.tech, `${what}.tech`),
    ...english(d, ['biz', 'tech'], what),
    confidence: optional(d.confidence, `${what}.confidence`, confidence),
    anchors: optional(d.anchors, `${what}.anchors`, (x, w) => array(x, w, anchor)),
    describedHash: optionalString(d.describedHash, `${what}.describedHash`),
  };
}

function regex(v: unknown, what: string): RegExp {
  const source = string(v, what);
  try {
    return new RegExp(source);
  } catch {
    throw new Error(`${what}: not a valid regular expression`);
  }
}

function capability(v: unknown, what: string): Capability {
  const c = object(v, what);
  return {
    id: string(c.id, `${what}.id`),
    name: string(c.name, `${what}.name`),
    biz: optionalString(c.biz, `${what}.biz`),
    tech: optionalString(c.tech, `${what}.tech`),
    ...english(c, ['name', 'biz', 'tech'], what),
    rules: array(c.rules, `${what}.rules`, regex),
  };
}

function decision(v: unknown, what: string): Decision {
  const d = object(v, what);
  return {
    id: string(d.id, `${what}.id`),
    name: string(d.name, `${what}.name`),
    note: optionalString(d.note, `${what}.note`),
    ...english(d, ['name', 'note'], what),
    path: string(d.path, `${what}.path`),
    units: strings(d.units, `${what}.units`),
  };
}

function concept(v: unknown, what: string): Concept {
  const c = object(v, what);
  return {
    id: string(c.id, `${what}.id`),
    name: string(c.name, `${what}.name`),
    biz: optionalString(c.biz, `${what}.biz`),
    ...english(c, ['name', 'biz'], what),
    store: optionalString(c.store, `${what}.store`),
    confidence: optional(c.confidence, `${what}.confidence`, confidence),
    owner: strings(c.owner, `${what}.owner`),
    writes: strings(c.writes, `${what}.writes`),
    reads: strings(c.reads, `${what}.reads`),
  };
}

function legacyStatus(v: unknown, what: string): LegacyStatus {
  const l = object(v, what);
  return {
    label: string(l.label, `${what}.label`),
    note: string(l.note, `${what}.note`),
    ...english(l, ['label', 'note'], what),
  };
}

function groundedDesc(v: unknown, what: string): Desc {
  const d = desc(v, what);
  if (!d.anchors?.length)
    throw new Error(`${what}.anchors: expected the path:line places in the code that prove it`);
  return d;
}

export function parseSemantic(v: unknown): Semantic {
  const s = object(v, 'semantic.json');
  const list = <T>(k: string, item: (x: unknown, what: string) => T) =>
    optional(s[k], k, (x, w) => array(x, w, item));
  return {
    system: optional(s.system, 'system', desc),
    caps: list('caps', capability),
    desc: optional(s.desc, 'desc', (x, w) => record(x, w, groundedDesc)),
    legacy: optional(s.legacy, 'legacy', (x, w) => record(x, w, legacyStatus)),
    legacyStatus: optional(s.legacyStatus, 'legacyStatus', stringRecord),
    decisions: list('decisions', decision),
    concepts: list('concepts', concept),
    flows: list('flows', parseFlow),
  };
}
