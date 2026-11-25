// The satchel, drawn in the 320x180 panel: the hero's figure with the nine equipment slots, the pack as a grid, what is
// selected and what can be done with it. Tap to select; drag a stack onto another slot to move, merge or swap it, onto a
// matching equipment slot to wear it, from the figure onto a pack slot to take it off, or onto a quick slot (the HUD's)
// to put it on the quick bar. See docs/engine/inventory.md.
//
//   const screen = createSatchel({ kit, icons, sprite, hero, inventory, equipment, ... })   // { kind, title, draw(kit) }

import { THEME } from './canvas.js';
import { TIER_NAMES } from './icons.js';

// Where each equipment slot sits in the hero's niche (panel pixels): two columns down the figure's sides, boots below it.
const SPOTS = { head: [8, 24], amulet: [8, 47], weapon: [8, 70], ring1: [8, 93], armour: [62, 24], gloves: [62, 47], shield: [62, 70], ring2: [62, 93], boots: [35, 124] };
const GRID = { x: 91, y: 23, cell: 20, rows: 6 };

export function createSatchel({ kit, icons, sprite, hero, inventory, equipment, inventoryColumns = 8, itemDefs, damageTypes = {}, say, toast = () => {}, drop,
  onUse, onEquip, onUnequip, wouldChange = () => null, wallet = null, quick = null, effectName = id => id, openCharacter = () => {} }) {
  let selected = null, selectedGear = null, lastPicked = ''; // a pack slot, or a worn slot's id; never both

  const typeName = t => damageTypes[t]?.name ?? t;
  const outlineOf = def => (def?.enchant ? { colour: damageTypes[def.enchant.type]?.colour ?? '#ffffff', tier: def.enchant.tier ?? 1 } : null);
  const stackLabel = ({ id, qty }) => `${itemDefs[id].name}${qty > 1 ? ` x${qty}` : ''}`;

  // What an item does in a fight, in one line: "Blunt 10-14, a blow every 0.85 s." / "Defence 2, blade damage x0.8."
  // A weapon's damage is what the hero would deal with it, strength included.
  function itemStats(def) {
    const parts = [];
    if (def.enchant) parts.push(`${typeName(def.enchant.type)} enchantment, ${TIER_NAMES[def.enchant.tier] ?? ''} (tier ${def.enchant.tier})`);
    if (def.elemental) parts.push(`+${def.elemental.damage[0]}-${def.elemental.damage[1]} ${typeName(def.elemental.type)} damage`);
    if (def.onHit) parts.push(`${Math.round((def.onHit.chance ?? 1) * 100)}% ${effectName(def.onHit.effect).toLowerCase()} on hit`);
    if (Array.isArray(def.damage)) {
      const [lo, hi] = hero.statsWith ? hero.statsWith({ ...equipment.gear(), weapon: def }).damage : def.damage, type = def.damageType ? typeName(def.damageType) : 'damage';
      parts.push(`${type[0].toUpperCase()}${type.slice(1)} ${lo}-${hi}`, `a blow every ${+(def.speed / 1000).toFixed(2)} s`);
    }
    if (def.defence) parts.push(`Defence ${def.defence}`);
    for (const [k, v] of Object.entries(def.resist ?? {})) parts.push(`${typeName(k)} damage x${v}`);
    for (const [k, v] of Object.entries(def.bonus ?? {})) parts.push(`${v > 0 ? '+' : ''}${v} ${k}`);
    return parts.length ? `${parts.join(', ')}.` : '';
  }

  const payloadFor = (extra, def) => ({ ...extra, ref: { kind: 'item', id: def.id }, name: def.name,
    draw: (k, x, y) => k.icon(icons, def.icon, Math.round(x) - 8, Math.round(y) - 8, 16, { outline: outlineOf(def) }) });

  function dropOnPack(p, i) {
    if (p.pack !== undefined) { if (inventory.move(p.pack, i)) { selected = i; selectedGear = null; } return; }
    const r = onUnequip(p.gear, i); toast(r.message);
    if (r.ok) { selectedGear = null; selected = inventory.slots[i] ? i : null; say(r.message); }
  }
  function dropOnGear(p, slotId) {
    const r = onEquip(p.pack, slotId); toast(r.message);
    if (r.ok) { selected = null; selectedGear = slotId; say(r.message); }
  }

  function drawPackCell(i, stack, x, y) {
    const key = `pack:${i}`, def = stack ? { id: stack.id, ...itemDefs[stack.id] } : null;
    kit.fill(x, y, 19, 19, THEME.well); kit.outline(x, y, 19, 19, kit.state.drop === key ? '#ffe0a0' : i === selected ? THEME.select : THEME.wellEdge);
    if (def) {
      kit.icon(icons, def.icon, x + 1, y + 1, 16, { outline: outlineOf(def) });
      if (stack.qty > 1) kit.text(String(stack.qty), x + 18, y + 10, THEME.white, { align: 'right', shadow: true });
    }
    kit.hit(x, y, 19, 19, { key, title: def ? stackLabel(stack) : '', tap: () => { selected = stack ? i : null; selectedGear = null; },
      drag: () => (def ? payloadFor({ pack: i }, def) : null),
      accepts: p => (p.pack !== undefined ? p.pack !== i : p.gear !== undefined), drop: p => dropOnPack(p, i) });
  }

  function drawGearCell(slot, x, y) {
    const id = equipment.worn[slot.id], key = `gear:${slot.id}`, def = id ? { id, ...itemDefs[id] } : null;
    kit.fill(x, y, 18, 18, THEME.well); kit.outline(x, y, 18, 18, kit.state.drop === key ? '#ffe0a0' : slot.id === selectedGear ? THEME.select : THEME.wellEdge);
    if (def) kit.icon(icons, def.icon, x + 1, y + 1, 16, { outline: outlineOf(def) });
    else kit.icon(icons, slot.ghost, x + 1, y + 1, 16, { alpha: 0.28 }); // a faint picture of what goes here
    kit.hit(x, y, 18, 18, { key, title: def ? `${slot.label}: ${def.name}` : slot.label, tap: () => { selectedGear = id ? slot.id : null; selected = null; },
      drag: () => (def ? payloadFor({ gear: slot.id }, def) : null),
      accepts: p => p.pack !== undefined, drop: p => dropOnGear(p, slot.id) });
  }

  return {
    kind: 'inventory', title: 'Your satchel',
    selectedSlot: () => selected,
    draw() {
      if (selected !== null && !inventory.slots[selected]) selected = null;
      if (selectedGear !== null && !equipment.worn[selectedGear]) selectedGear = null;

      // The hero and what they wear.
      kit.frame(5, 20, 80, 155);
      kit.image(sprite, 21, 25);
      for (const slot of equipment.slots) { const [x, y] = SPOTS[slot.id] ?? [35, 100]; drawGearCell(slot, x, y); }

      // The pack.
      const cols = inventoryColumns, rows = Math.ceil(inventory.size / cols);
      kit.frame(GRID.x - 3, GRID.y - 3, cols * GRID.cell + 6 + (rows > GRID.rows ? 4 : 0), GRID.rows * GRID.cell + 6);
      const cells = () => {
        inventory.slots.forEach((stack, i) => drawPackCell(i, stack, (i % cols) * GRID.cell + 1, Math.floor(i / cols) * GRID.cell + 1));
        return rows * GRID.cell;
      };
      if (rows <= GRID.rows) kit.withOrigin(GRID.x - 1, GRID.y - 1, cells);
      else kit.scroll('satchel-pack', GRID.x - 1, GRID.y - 1, cols * GRID.cell + 4, GRID.rows * GRID.cell, cells);

      // What is selected.
      const stack = selected === null ? null : inventory.slots[selected], worn = selectedGear === null ? null : equipment.worn[selectedGear];
      const def = stack ? itemDefs[stack.id] : worn ? itemDefs[worn] : null;
      kit.frame(88, 148, 166, 27);
      let text;
      if (!def) {
        kit.text('Nothing selected', 91, 150, THEME.select);
        text = `Select an item to read about it. Drag it onto the figure to wear it, or onto the quick bar. Damage ${hero.damage[0]}-${hero.damage[1]}${hero.damageType ? ` ${typeName(hero.damageType)}` : ''}, defence ${hero.defence}.`;
      } else {
        kit.text(`${def.name}${stack?.qty > 1 ? ` x${stack.qty}` : ''}`, 91, 150, THEME.select);
        const changes = stack ? wouldChange(stack.id) : null;
        text = [itemStats(def), changes ? (changes.length ? `If worn: ${changes.join(', ')}.` : 'If worn: no change.') : '', def.description].filter(Boolean).join(' ');
      }
      const picked = `${selected}|${selectedGear}`;
      if (picked !== lastPicked) { lastPicked = picked; kit.resetScroll('satchel-text'); }
      kit.scroll('satchel-text', 90, 158, 162, 16, w => kit.paragraph(text, 1, 0, w, THEME.text));

      // The gold, and what can be done with the selection.
      if (wallet) kit.text(`Gold: ${wallet.amount}`, 258, 22, THEME.text);
      const actions = [];
      if (worn) actions.push(['Take off', () => { const r = onUnequip(selectedGear); if (r.ok) { selectedGear = null; say(r.message); } toast(r.message); }]);
      else if (stack) {
        const index = selected;
        if (def.slot) actions.push(['Equip', () => { const r = onEquip(index); if (r.ok) { selected = null; say(r.message); } toast(r.message); }]);
        if (def.use || !def.slot) actions.push(['Use', () => { const result = onUse(index); if (result?.message) toast(result.message); }, !def.use]);
        const dropIt = qty => () => { const name = stackLabel({ id: stack.id, qty }); drop(index, qty); say(`You drop ${name}.`); toast(`You drop ${name}.`); };
        actions.push([stack.qty > 1 ? 'Drop one' : 'Drop', dropIt(1)]);
        if (stack.qty > 1) actions.push(['Drop all', dropIt(stack.qty)]);
      }
      if (quick && def && (def.use || def.slot)) {
        const ref = { kind: 'item', id: stack?.id ?? worn };
        actions.push([quick.has(ref) ? 'Off quick' : 'Quick bar', () => { const line = quick.toggle(ref, def.name); say(line); toast(line); }]);
      }
      actions.forEach(([label, tap, disabled], i) => kit.button(258, 34 + i * 17, 57, 15, label, { tap, disabled: !!disabled }));
      if (hero.progress) kit.button(258, 158, 57, 17, hero.unspent > 0 ? 'Char. +' : 'Character', { tap: openCharacter, selected: hero.unspent > 0 });
    },
  };
}
