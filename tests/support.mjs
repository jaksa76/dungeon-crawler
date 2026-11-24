// What the tests share: the engine's books on their own, and the Ravensmoor campaign resolved the way the engine
// resolves it when the game starts.
import { mergeContent, engineContent, resolveLevel } from '../engine/index.js';
import { createWorld } from '../engine/core/world.js';
import { campaign } from '../games/ravensmoor/campaign.js';

export { campaign };
export const engineBooks = mergeContent(engineContent);
export const books = mergeContent(engineContent, campaign.content);
export const levels = Object.fromEntries(Object.entries(campaign.levels).map(([id, def]) => [id, resolveLevel(id, def, books)]));
// A fresh world of the campaign's instances (each call a new one: tests change them).
export const campaignWorld = () => createWorld({ levels, books });
// A file in an entry's art folder, as a file: URL (for fs).
export const artFile = (entry, file) => new URL(file, entry.assets);
// The ids a book (engine or campaign) defines itself.
export const own = (book, kind) => Object.keys(book[kind]);
