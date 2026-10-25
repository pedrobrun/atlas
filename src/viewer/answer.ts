// Reading the agent's answer: its text, the modules it asks to light up, and a drafted flow.
import type { Flow, FlowDraft } from '../types.ts';

export interface Answer {
  body: string;
  /** Ids from the closing `SHOW:` line that exist in the map. */
  show: string[];
  /** A flow the agent documented, when its fenced block is complete and well-formed. */
  draft: FlowDraft | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const optionalString = (v: unknown) => (typeof v === 'string' ? v : undefined);

function parseDraft(json: string): FlowDraft | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;
  const steps = Array.isArray(raw.steps)
    ? raw.steps.filter(isRecord).filter((s) => typeof s.unit === 'string')
    : [];
  return {
    id: optionalString(raw.id),
    name_en: optionalString(raw.name_en),
    name_pt: optionalString(raw.name_pt),
    biz_en: optionalString(raw.biz_en),
    biz_pt: optionalString(raw.biz_pt),
    confidence: optionalString(raw.confidence),
    steps: steps.map((s) => ({
      unit: String(s.unit),
      text_en: optionalString(s.text_en),
      text_pt: optionalString(s.text_pt),
      anchor: optionalString(s.anchor),
    })),
  };
}

/**
 * Splits an answer, complete or still streaming. A flow block that hasn't closed yet is cut
 * from the text so half a JSON object never shows.
 */
export function readAnswer(text: string, inMap: (id: string) => boolean): Answer {
  let draft: FlowDraft | null = null;
  const block = text.match(/```atlas-flow\s*([\s\S]*?)```/);
  if (block) {
    draft = parseDraft(block[1]);
    text = text.replace(block[0], '');
  } else {
    const open = text.indexOf('```atlas-flow');
    if (open >= 0) text = text.slice(0, open);
  }
  const showLine = text.match(/\n?\s*SHOW:\s*(.+)\s*$/);
  if (!showLine) return { body: text, show: [], draft };
  const show = showLine[1]
    .split(/[,\s]+/)
    .map((id) => id.replace(/^\[\[|\]\]$/g, ''))
    .filter(inMap);
  return { body: text.slice(0, showLine.index), show, draft };
}

/** A drafted flow in the map's shape: Portuguese as the base text, steps on unknown modules dropped. */
export function toFlow(draft: FlowDraft, inMap: (id: string) => boolean): Flow {
  const id = (draft.id || draft.name_en || 'flow')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return {
    id,
    name: draft.name_pt || draft.name_en || id,
    name_en: draft.name_en || draft.name_pt,
    biz: draft.biz_pt || draft.biz_en,
    biz_en: draft.biz_en || draft.biz_pt,
    confidence: draft.confidence === 'verified' ? 'verified' : 'inferred',
    steps: (draft.steps || [])
      .filter((s) => inMap(s.unit))
      .map((s) => ({
        unit: s.unit,
        text: s.text_pt || s.text_en || '',
        text_en: s.text_en || s.text_pt,
        anchor: s.anchor || null,
      })),
  };
}
