// The two DOM helpers every panel uses.

export const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
/** Escapes text for HTML content and double-quoted attributes. */
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ENTITIES[c]);
