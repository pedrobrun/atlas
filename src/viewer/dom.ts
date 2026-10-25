export const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ENTITIES[c]);
