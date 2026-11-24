// Content books. The engine ships one (engine/content/index.js): the rule book's items, the creature book's monsters,
// and the NPCs, props, buildings and environments a campaign builds its levels from. A campaign may add a book of its
// own: new ids add things, an id the engine already has changes it (house rules).
//
//   defineContent(baseUrl, { items, monsters, npcs, props, buildings, environments, doors, icons, damageTypes, materials })
//
// `baseUrl` is the folder that holds the book's art (`new URL('./assets/', import.meta.url)`), laid out by kind:
//   monsters/<art>/  npcs/<art>/  props/<art>/  walls/<art>/  environments/<art>/  icons/<sheet image>
//
// `icons` are icon spritesheets, for items the engine's atlas has no picture for:
//   { <sheet id>: { image: 'ravensmoor.png', tile: 16, icons: ['raven-amulet', ...], detailed?: { image, tile } } }
// The image is a grid of square tiles, `tile` pixels across, read left to right and top to bottom in the order of
// `icons`. A tile of 32 pixels or less is pixel art: it is drawn at whole multiples of its size, without smoothing.
// `detailed` is an optional painted version, same order, for the player's "detailed" icon style; without it the
// pixel sheet serves both styles. An item names an icon from a sheet like one from the engine's atlas
// (`icon: 'raven-amulet'`), and a sheet's icon with the same id as an atlas icon replaces it.
//
// `damageTypes` are the kinds of harm a campaign's weapons do: { blade: { name: 'blade' }, ... }. A weapon's
// `damageType`, a creature's `damageType` and every `resist` (on creatures and armour) must name one of them.
//
// `materials` are what weapons and armour are made of: { steel: { name: 'Steel', colours: [dark ... light], damage: 1.3,
// speed: 1, defence: 2 } }. `colours` repaint the grey metal of an icon (ui/icons.js); `damage` and `speed` multiply a
// weapon's damage range and time between blows, `defence` is added to armour's, `value` multiplies the item's `value`
// and `drop` (see below) is the item's, when a material needs its own. An item with `materials` is a family:
// it becomes one item per material, `<material>-<id>` (see forgeFamilies below), and is not an item itself.
//
// An entry's `art` defaults to its id. An entry that overrides one from an earlier book keeps that book's art unless it
// names an `art` of its own, so a campaign can retune the engine's troll without painting a new one.

export const KINDS = ['items', 'monsters', 'npcs', 'props', 'buildings', 'environments', 'doors', 'icons', 'damageTypes', 'materials'];
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
    const base = old && !('art' in entry) && !('image' in entry) ? old[BASE] : entry[BASE];
    merged[kind][id] = Object.assign({ ...old, ...entry }, { [BASE]: base });
  }
  for (const id of Object.keys(merged.props)) if (merged.npcs[id]) throw new Error(`content: "${id}" is both a prop and an NPC`);
  for (const [kind, folder] of Object.entries(ART_FOLDERS)) for (const [id, entry] of Object.entries(merged[kind])) {
    entry.id = id; entry.art ??= id;
    if (entry[BASE]) entry.assets = new URL(`${folder}/${entry.art}/`, entry[BASE]).href;
  }
  for (const [id, entry] of Object.entries(merged.damageTypes)) { entry.id = id; entry.name ??= id; }
  for (const [id, entry] of Object.entries(merged.materials)) { entry.id = id; entry.name ??= id; }
  merged.items = forgeFamilies(merged.items, merged.materials);
  for (const [id, entry] of Object.entries(merged.items)) entry.id = id;
  checkDamageTypes(merged);
  for (const [id, entry] of Object.entries(merged.doors)) {
    if (!merged.buildings[entry.building]) throw new Error(`content: door "${id}" shows an unknown building "${entry.building}"`);
    entry.id = id;
  }
  for (const [id, sheet] of Object.entries(merged.icons)) {
    if (typeof sheet.image !== 'string' || !(sheet.tile > 0) || !Array.isArray(sheet.icons)) throw new Error(`content: icon sheet "${id}" needs an image, a tile size and a list of icons`);
    const folder = new URL('icons/', sheet[BASE]);
    Object.assign(sheet, { id, url: new URL(sheet.image, folder).href });
    if (sheet.detailed) sheet.detailed = { ...sheet.detailed, url: new URL(sheet.detailed.image, folder).href };
  }
  return merged;
}

// Families -> items. A family is an item with `materials`: a list of material ids, or { <material>: { ...overrides } }
// for a tier that differs (its own description, say). Each material makes the item `<material>-<family id>`, named
// "<Material> <family name>", with the family's icon repainted in the material's colours (`<icon>@<material>`), the
// damage range and speed scaled and the defence raised by the material's numbers. `aliases: { <material>: [old ids] }`
// keeps saves that name an old item. `{material}` in the description becomes the material's name, in lower case.
export function forgeFamilies(items, materials) {
  const out = {};
  for (const [id, entry] of Object.entries(items)) {
    if (!entry.materials) { out[id] = entry; continue; }
    const { materials: list, aliases, ...family } = entry;
    const tiers = Array.isArray(list) ? Object.fromEntries(list.map(m => [m, {}])) : list;
    for (const [m, overrides] of Object.entries(tiers)) {
      const material = materials[m];
      if (!material) throw new Error(`content: item family "${id}" names an unknown material "${m}"`);
      const item = { ...family, family: id, material: m };
      item.name = `${material.name} ${family.name.toLowerCase()}`;
      if (family.icon) item.icon = `${family.icon}@${m}`;
      if (Array.isArray(family.damage)) item.damage = family.damage.map(v => Math.max(1, Math.round(v * (material.damage ?? 1))));
      if (family.speed !== undefined) item.speed = Math.round(family.speed * (material.speed ?? 1));
      if (family.defence !== undefined) item.defence = family.defence + (material.defence ?? 0);
      if (family.value !== undefined) item.value = Math.max(1, Math.round(family.value * (material.value ?? 1)));
      if (material.drop !== undefined) item.drop = material.drop;
      if (typeof family.description === 'string') item.description = family.description.replaceAll('{material}', material.name.toLowerCase());
      if (aliases?.[m]) item.aliases = aliases[m];
      Object.assign(item, overrides);
      out[`${m}-${id}`] = item;
    }
  }
  return out;
}

// Every damage type an item or creature names is one the books declare.
function checkDamageTypes({ items, monsters, damageTypes }) {
  const check = (what, type) => { if (!Object.hasOwn(damageTypes, type)) throw new Error(`content: ${what} names an unknown damage type "${type}"`); };
  for (const [kind, entries] of [['item', items], ['creature', monsters]]) for (const [id, entry] of Object.entries(entries)) {
    if (entry.damageType != null) check(`${kind} "${id}"`, entry.damageType);
    for (const type of Object.keys(entry.resist ?? {})) check(`${kind} "${id}" (resist)`, type);
  }
}
