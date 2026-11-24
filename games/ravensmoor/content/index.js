// Ravensmoor's content book: what this campaign adds to the engine's books, or changes in them.
import { defineContent } from '../../../engine/index.js';
import { monsters } from './monsters.js';

export const content = defineContent(new URL('../assets/', import.meta.url), {
  monsters,
  items: {
    torch: { description: 'A pitch-soaked torch. The Undercrypt is very dark.' }, // the engine's torch, with a hint
  },
});
