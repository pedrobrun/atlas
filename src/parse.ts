// Turning JSON from outside (config files, request bodies, the agent's output, the local store)
// into the typed shapes the rest of the code trusts. Each parser throws on what it can't use.
import type {
  AtlasConfig,
  ChatRequest,
  DescribeRequest,
  Flow,
  FlowStep,
  ModuleRule,
  SourceConfig,
} from './types.ts';

type Fields = Record<string, unknown>;

function object(v: unknown, what: string): Fields {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`${what}: expected an object`);
  return { ...v };
}
function string(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`${what}: expected a string`);
  return v;
}
const optionalString = (v: unknown, what: string) => (v === undefined ? undefined : string(v, what));
const nullableString = (v: unknown, what: string) => (v === null || v === undefined ? null : string(v, what));
function array<T>(v: unknown, what: string, item: (x: unknown, what: string) => T): T[] {
  if (!Array.isArray(v)) throw new Error(`${what}: expected an array`);
  return v.map((x, i) => item(x, `${what}[${i}]`));
}
function oneOf<T extends string>(v: unknown, options: readonly T[], what: string): T {
  const found = options.find((o) => o === v);
  if (found === undefined) throw new Error(`${what}: expected one of ${options.join(', ')}`);
  return found;
}
function stringRecord(v: unknown, what: string): Record<string, string> {
  return Object.fromEntries(Object.entries(object(v, what)).map(([k, x]) => [k, string(x, `${what}.${k}`)]));
}

function moduleRule(v: unknown, what: string): ModuleRule {
  const r = object(v, what);
  return {
    match: string(r.match, `${what}.match`),
    area: string(r.area, `${what}.area`),
    areaName: optionalString(r.areaName, `${what}.areaName`),
    module: string(r.module, `${what}.module`),
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

function flowStep(v: unknown, what: string): FlowStep {
  const s = object(v, what);
  return {
    unit: string(s.unit, `${what}.unit`),
    text: string(s.text, `${what}.text`),
    text_en: optionalString(s.text_en, `${what}.text_en`),
    anchor: nullableString(s.anchor, `${what}.anchor`),
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
    confidence: oneOf(f.confidence, ['verified', 'inferred', 'generated'] as const, `${what}.confidence`),
    steps: array(f.steps, `${what}.steps`, flowStep),
  };
}

export const parseFlows = (v: unknown) => array(v, 'flows.local.json', parseFlow);

/** The agent's description of a module and its files, each in English and Portuguese. */
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
export function parseDescription(v: unknown): { module?: DescDraft; files: Record<string, DescDraft> } {
  const d = object(v, 'description');
  const files = d.files === undefined ? {} : object(d.files, 'files');
  return {
    module: d.module === undefined ? undefined : descDraft(d.module, 'module'),
    files: Object.fromEntries(
      Object.entries(files).map(([path, x]) => [path, descDraft(x, `files.${path}`)]),
    ),
  };
}
