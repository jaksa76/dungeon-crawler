// Ravensmoor's content book: what this campaign adds to the engine's books, or changes in them.
import { defineContent } from '../../../engine/index.js';
import { monsters } from './monsters.js';
import { items } from './items.js';
import { icons } from './icons.js';
import { arms, damageTypes, materials } from './arms.js';
import { spells, enchantments, magicItems } from './magic.js';

export const content = defineContent(new URL('../assets/', import.meta.url), {
  monsters, items: { ...items, ...arms, ...magicItems }, icons, damageTypes, materials, spells, enchantments,
});
