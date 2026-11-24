// Persistence mechanics: a registry of sections, the save envelope, and a store of save slots. No DOM, no clock
// (callers pass `now`). The engine knows nothing about what a section holds.
//
// A section is a piece of state that someone owns (the pack, the hero, a game's quest log):
//
//   { id, version?, save(), load(data, ctx), reset?(), migrate?, after? }
//
//   save()     plain JSON-able data (copied on the way out, so later changes never leak into a snapshot)
//   load()     put data back; may be async. `ctx.issue(text)` reports data that had to be dropped.
//   reset()    back to the starting state: called when a save has no data for the section (a feature added
//              after the save was made) or when its data cannot be used
//   version    of the data format (default 1); `migrate: { n: data => data' }` turns version n into n + 1
//   after      ids that must load first: 'hero' in the same namespace, or qualified like 'engine.hero'
//
// Sections live in one of two namespaces, so engine and game ids can never collide: `engine` for what the
// framework's components save, `game` for everything a game adds. Engine sections load before game sections.
// Sections found in a save but not registered (or too new to read) are kept and written back untouched.

export const FORMAT = 1;
const ID = /^[a-z][a-z0-9_-]*$/i;

export function createPersistence({ now = Date.now } = {}) {
  const sections = new Map(); // 'engine.hero' -> section
  let kept = {}; // sections of the last loaded save that nobody took: { engine: { id: entry }, game: {...} }
  const register = ns => section => {
    const { id, version = 1 } = section;
    if (typeof id !== 'string' || !ID.test(id)) throw new Error(`a ${ns} section needs an id of letters, digits, - and _`);
    if (typeof section.save !== 'function' || typeof section.load !== 'function') throw new Error(`section "${ns}.${id}" needs save() and load()`);
    if (!Number.isInteger(version) || version < 1) throw new Error(`section "${ns}.${id}" has a bad version`);
    if (sections.has(`${ns}.${id}`)) throw new Error(`section "${ns}.${id}" is already registered`);
    sections.set(`${ns}.${id}`, { ...section, ns, id, version, name: `${ns}.${id}` });
  };

  // Registration order, engine before game, each section after what it names.
  function order() {
    const all = [...sections.values()].sort((a, b) => (a.ns === b.ns ? 0 : a.ns === 'engine' ? -1 : 1));
    const done = new Set(), out = [], visiting = new Set();
    const visit = section => {
      if (done.has(section.name)) return;
      if (visiting.has(section.name)) throw new Error(`sections depend on each other in a loop at "${section.name}"`);
      visiting.add(section.name);
      for (const after of section.after ?? []) {
        const name = after.includes('.') ? after : `${section.ns}.${after}`, dep = sections.get(name);
        if (!dep) throw new Error(`section "${section.name}" comes after "${name}", which is not registered`);
        visit(dep);
      }
      visiting.delete(section.name); done.add(section.name); out.push(section);
    };
    all.forEach(visit);
    return out;
  }

  const copy = data => { const text = JSON.stringify(data); return text === undefined ? undefined : JSON.parse(text); }; // undefined and functions cannot be saved: nothing is stored

  return {
    engine: { register: register('engine') },
    game: { register: register('game') },
    get names() { return order().map(s => s.name); },

    // Everything registered, as one JSON object. `label` is a line for the slot list ("The Crypt").
    snapshot({ label = '' } = {}) {
      const out = { format: FORMAT, savedAt: now(), label, sections: { engine: {}, game: {} } };
      for (const [ns, entries] of Object.entries(kept)) Object.assign(out.sections[ns] ??= {}, copy(entries));
      for (const s of order()) out.sections[s.ns][s.id] = { v: s.version, data: copy(s.save()) };
      return out;
    },

    // Put a save back, section by section. Returns { issues }: what could not be used, as
    // { section, problem: 'newer'|'no-migration'|'failed'|'data', message }. Never throws for bad data.
    async restore(envelope, ctx = {}) {
      if (!isEnvelope(envelope)) throw new TypeError('not a save of this format');
      const issues = [], taken = new Set();
      for (const s of order()) {
        const entry = envelope.sections[s.ns]?.[s.id];
        const report = (problem, message) => issues.push({ section: s.name, problem, message });
        const fresh = async () => { try { await s.reset?.(); } catch (error) { report('failed', `reset: ${error.message}`); } };
        if (!entry || typeof entry.v !== 'number') { await fresh(); continue; }
        if (entry.v > s.version) { report('newer', `saved by a newer version (${entry.v} > ${s.version})`); await fresh(); continue; }
        let data = entry.data, ok = true;
        for (let v = entry.v; v < s.version && ok; v++) {
          if (!s.migrate?.[v]) { report('no-migration', `no migration from version ${v}`); ok = false; break; }
          try { data = s.migrate[v](copy(data)); } catch (error) { report('failed', `migration from ${v}: ${error.message}`); ok = false; }
        }
        if (!ok) { await fresh(); continue; }
        taken.add(s.name);
        try { await s.load(copy(data), { ...ctx, issue: message => report('data', message) }); }
        catch (error) { report('failed', error.message); await fresh(); taken.delete(s.name); }
      }
      // keep whatever nobody took, for the next save
      kept = {};
      for (const [ns, entries] of Object.entries(envelope.sections)) for (const [id, entry] of Object.entries(entries ?? {})) {
        if (!taken.has(`${ns}.${id}`)) (kept[ns] ??= {})[id] = copy(entry);
      }
      return { issues };
    },

    // Back to the starting state, everywhere.
    async reset() { kept = {}; for (const s of order()) await s.reset?.(); },

    // A string that changes when the saved data does (not when only the time does), to skip pointless writes.
    digest(envelope) { const { savedAt, ...rest } = envelope; return JSON.stringify(rest); },
  };
}

// One section's data inside an envelope, without loading it. Useful for what must be known before the
// components exist (the level to open first). `name` is qualified: 'engine.player'.
export function peek(envelope, name) {
  const [ns, id] = name.split('.');
  return envelope?.sections?.[ns]?.[id]?.data;
}

const isEnvelope = e => !!e && typeof e === 'object' && e.format === FORMAT && !!e.sections && typeof e.sections === 'object';

// Save slots in a Storage (localStorage). Storage can be missing, full or blocked (private browsing): every call
// then fails quietly, and save() says false so the game can tell the player.
export function createSaveStore(storage, prefix = 'game') {
  const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };
  const key = slot => `${prefix}:slot:${slot}`, indexKey = `${prefix}:slots`;
  const validSlot = slot => typeof slot === 'string' && ID.test(slot);
  const index = () => safe(() => { const list = JSON.parse(storage.getItem(indexKey)); return Array.isArray(list) ? list.filter(validSlot) : []; }, []);
  const store = {
    load: slot => (validSlot(slot) ? safe(() => { const e = JSON.parse(storage.getItem(key(slot))); return isEnvelope(e) ? e : null; }, null) : null),
    save: (slot, envelope) => validSlot(slot) && safe(() => {
      storage.setItem(key(slot), JSON.stringify(envelope));
      const slots = index(); if (!slots.includes(slot)) storage.setItem(indexKey, JSON.stringify([...slots, slot]));
      return true;
    }, false),
    clear: slot => validSlot(slot) && safe(() => { storage.removeItem(key(slot)); storage.setItem(indexKey, JSON.stringify(index().filter(s => s !== slot))); return true; }, false),
    has: slot => store.load(slot) !== null,
    // Saves that can still be read, newest first: [{ slot, savedAt, label }]
    list: () => index().map(slot => ({ slot, e: store.load(slot) })).filter(x => x.e)
      .map(({ slot, e }) => ({ slot, savedAt: e.savedAt, label: e.label ?? '' })).sort((a, b) => b.savedAt - a.savedAt),
  };
  return store;
}
