// The engine's own content book: everything a campaign can use without making it.
import { defineContent } from './catalog.js';
import { items } from './items.js';
import { monsters } from './bestiary.js';
import { npcs } from './npcs.js';
import { props } from './props.js';
import { buildings } from './buildings.js';
import { environments } from './environments.js';

export const engineContent = defineContent(new URL('../assets/', import.meta.url), { items, monsters, npcs, props, buildings, environments });
