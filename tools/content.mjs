// What the art tools work on: the engine's content books and the Ravensmoor campaign's, merged as the game merges
// them. Each entry knows its art folder, so a tool writes the engine's troll to engine/assets/monsters/troll/ and the
// campaign's snake to games/ravensmoor/assets/monsters/snake/. Source art lives in art/engine/ or art/ravensmoor/
// by the same rule.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeContent, engineContent } from '../engine/index.js';
import { campaign } from '../games/ravensmoor/campaign.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const books = mergeContent(engineContent, campaign.content);
// The folder (absolute path) that holds an entry's runtime art.
export const artDir = entry => fileURLToPath(entry.assets);
// Repo-relative path of an entry's runtime art folder, or of a file in it.
export const artPath = (entry, file = '') => path.relative(ROOT, path.join(artDir(entry), file));
// Where source art for `id` of `kind` lives: 'art/engine' for the engine's own, 'art/ravensmoor' for the campaign's.
export const sourceRoot = (kind, id) => Object.hasOwn(campaign.content[kind] ?? {}, id) && !Object.hasOwn(engineContent[kind], id) ? 'art/ravensmoor' : 'art/engine';
