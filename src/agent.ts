import type { ChatEvent, Lang } from './types.ts';

export const chatFlags = (prompt: string, system: string, session: string | null) => [
  ...['-p', prompt, '--output-format', 'stream-json', '--verbose', '--include-partial-messages'],
  ...['--tools', 'Read', 'Grep', 'Glob', '--allowedTools', 'Read', 'Grep', 'Glob'],
  ...['--strict-mcp-config', '--effort', 'medium', '--append-system-prompt', system],
  ...(session ? ['--resume', session] : []),
];

export const describeFlags = (prompt: string) => [
  ...['-p', prompt, '--output-format', 'json', '--tools', ''],
  ...['--strict-mcp-config', '--model', 'sonnet', '--effort', 'low'],
];

export function chatSystemPrompt({
  lang,
  about,
  contextPath,
}: {
  lang: Lang;
  about: string | null;
  contextPath: string;
}) {
  return `You are Atlas, the architecture guide for the codebase in the current directory (several repos side by side).
Before answering, read ${contextPath} — the architecture map: capabilities, modules with descriptions and dependencies, flows, invariants and decisions.
Rules:
- Ground every claim. Prefer the map; when it is not enough, or a description is marked STALE or [inferred], read the code (Read/Grep/Glob) and say so. Cite code as path:line.
- Refer to modules with their exact atlas id in double brackets, e.g. [[web/api/orders]]. Capabilities: [[cap:billing]]. Never invent ids.
- Be concise: a short answer first, then detail only if it helps. Plain markdown, no headings.
- If your answer points at specific modules, end with one last line: SHOW: id1, id2, ... (atlas ids, most relevant first, max 12). The viewer lights these up in 3D.
- Answer in ${lang === 'pt' ? 'Brazilian Portuguese' : 'English'}.
Documenting a flow (writing down a named, step-by-step path through EXISTING code, like the ones under "## Flows" in the map — never a new feature):
- If the user wants to document a flow but hasn't said which, propose 3–4 important flows that already exist in the code but are NOT in the map yet (one line each, with the modules they cross) and ask which one.
- Once you know which, trace it in the code. Every step must name an existing module id from the map and an anchor path:line you actually read. Keep it to 4–10 steps.
- Then output exactly one fenced block, nothing after it except the SHOW line:
\`\`\`atlas-flow
{"id":"kebab-id","name_en":"…","name_pt":"…","biz_en":"one sentence, plain language","biz_pt":"…","confidence":"verified","steps":[{"unit":"module-id","text_en":"…","text_pt":"…","anchor":"path:line"}]}
\`\`\`
  Use "inferred" for confidence if any step lacks an anchor you read. The viewer previews it in 3D and the user decides whether to save it.
${about ? `The viewer is currently looking at ${about}; "this"/"isso" refers to it.` : ''}`;
}

export function contextSection(context: string, id: string) {
  const start = context.indexOf(`### ${id}\n`);
  return start >= 0 ? context.slice(start, context.indexOf('\n###', start + 4)) : '';
}

export function describePrompt({
  id,
  section,
  files,
}: {
  id: string;
  section: string;
  files: { path: string; text: string }[];
}) {
  const describeModule =
    section.includes('STALE description') || !/\[(verified|inferred|generated)\]/.test(section);
  const moduleShape = describeModule
    ? '"module":{"biz_en":"…","biz_pt":"…","tech_en":"…","tech_pt":"…"},'
    : '';
  return `Describe one module of this codebase for an architecture map.
Module id: ${id}
What the map already says about it:
${section}
Its files follow, each in a block headed by its path.
${files.map((f) => `\n=== ${f.path}\n${f.text}`).join('\n')}

Output ONLY one fenced block and nothing else:
\`\`\`atlas-desc
{${moduleShape}"files":{"<path>":{"biz_en":"…","biz_pt":"…","tech_en":"…","tech_pt":"…"}}}
\`\`\`
biz: one plain sentence on what it is for, for someone who doesn't read code.
tech: one or two sentences on how it does it, naming the key functions, routes or components.
Describe the code as it is now; never mention what the map said before.
_pt fields in Brazilian Portuguese. Use the file paths exactly as they appear after ===.`;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

function toolStatus(name: string, input: Record<string, unknown>, project: string) {
  const where = (str(input.file_path) || str(input.path) || '').replace(project + '/', '');
  if (name === 'Read') return `read ${where}`;
  if (name === 'Grep') return `grep "${str(input.pattern)}"${where ? ' in ' + where : ''}`;
  if (name === 'Glob') return `glob ${str(input.pattern)}`;
  return name;
}

export function readAgentLine(line: string, project: string): ChatEvent[] {
  let ev: unknown;
  try {
    ev = JSON.parse(line);
  } catch {
    return [];
  }
  if (!isRecord(ev)) return [];
  if (ev.type === 'stream_event' && isRecord(ev.event) && ev.event.type === 'content_block_delta') {
    const delta = ev.event.delta;
    return isRecord(delta) && delta.type === 'text_delta'
      ? [{ type: 'delta', text: str(delta.text) ?? '' }]
      : [];
  }
  if (ev.type === 'assistant' && isRecord(ev.message) && Array.isArray(ev.message.content)) {
    return ev.message.content
      .filter((b): b is Record<string, unknown> => isRecord(b) && b.type === 'tool_use')
      .map((b) => ({
        type: 'status',
        text: toolStatus(str(b.name) ?? '', isRecord(b.input) ? b.input : {}, project),
      }));
  }
  if (ev.type === 'result') {
    const error = ev.is_error ? (str(ev.subtype) ?? 'error') : null;
    return [{ type: 'done', text: str(ev.result) || '', session: str(ev.session_id), error }];
  }
  return [];
}

export function fencedJson(text: string): unknown {
  const fenced = text.match(/```(?:atlas-desc|json)?\s*([\s\S]*?)```/);
  return JSON.parse(fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
}
