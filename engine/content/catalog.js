// Content books. The engine ships one (engine/content/index.js): the rule book's items, the creature book's monsters,
// and the NPCs, props, buildings and environments a campaign builds its levels from. A campaign may add a book of its
// own: new ids add things, an id the engine already has changes it (house rules).
//
//   defineContent(baseUrl, { items, monsters, npcs, props, buildings, environments })
//
// `baseUrl` is the folder that holds the book's art (`new URL('./assets/', import.meta.url)`), laid out by kind:
//   monsters/<art>/  npcs/<art>/  props/<art>/  walls/<art>/  environments/<art>/
// An entry's `art` defaults to its id. An entry that overrides one from an earlier book keeps that book's art unless it
// names an `art` of its own, so a campaign can retune the engine's troll without painting a new one.

export const KINDS = ['items', 'monsters', 'npcs', 'props', 'buildings', 'environments'];
export const ART_FOLDERS = { monsters: 'monsters', npcs: 'npcs', props: 'props', buildings: 'walls', environments: 'environments' };

const BASE = Symbol('base');

export function defineContent(baseUrl, book) {
  const base = String(baseUrl).endsWith('/') ? String(baseUrl) : `${baseUrl}/`;
  for (const kind of Object.keys(book)) if (!KINDS.includes(kind)) throw new Error(`content: unknown kind "${kind}"`);
  const out = {};
  for (const kind of KINDS) {
    out[kind] = {};
    for (const [id, entry] of Object.entries(book[kind] ?? {})) out[kind][id] = Object.assign({ ...entry }, { [BASE]: base });
  }
  return out;
}

// Books merged in order: later books add to and override earlier ones. Every entry with art gets `id`, `art` and
// `assets`, the URL of its art folder.
export function mergeContent(...books) {
  const merged = Object.fromEntries(KINDS.map(kind => [kind, {}]));
  for (const book of books) for (const kind of KINDS) for (const [id, entry] of Object.entries(book[kind] ?? {})) {
    const old = merged[kind][id];
    const base = old && !('art' in entry) ? old[BASE] : entry[BASE];
    merged[kind][id] = Object.assign({ ...old, ...entry }, { [BASE]: base });
  }
  for (const id of Object.keys(merged.props)) if (merged.npcs[id]) throw new Error(`content: "${id}" is both a prop and an NPC`);
  for (const [kind, folder] of Object.entries(ART_FOLDERS)) for (const [id, entry] of Object.entries(merged[kind])) {
    entry.id = id; entry.art ??= id;
    if (entry[BASE]) entry.assets = new URL(`${folder}/${entry.art}/`, entry[BASE]).href;
  }
  for (const [id, entry] of Object.entries(merged.items)) entry.id = id;
  return merged;
}
