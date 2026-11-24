import test from 'node:test';
import assert from 'node:assert/strict';
import { defineContent, mergeContent, engineContent } from '../../engine/index.js';

const campaignBook = book => defineContent('file:///campaign/assets/', book);

test('a campaign adds new entries and changes the engine’s field by field, keeping the engine’s art', () => {
  const books = mergeContent(engineContent, campaignBook({
    monsters: { wyrm: { name: 'wyrm', cr: 2, hp: 40, ac: 14, dmg: 12, h: 1, w: .6 }, troll: { name: 'cave troll' } },
    items: { torch: { description: 'A torch.' } },
  }));
  assert.equal(books.monsters.wyrm.assets, 'file:///campaign/assets/monsters/wyrm/');
  assert.equal(books.monsters.troll.name, 'cave troll'); assert.equal(books.monsters.troll.cr, 5);
  assert.match(books.monsters.troll.assets, /engine\/assets\/monsters\/troll\/$/);
  assert.equal(books.items.torch.description, 'A torch.'); assert.equal(books.items.torch.icon, 'torch');
});

test('an override that names its own art takes it from the campaign', () => {
  const books = mergeContent(engineContent, campaignBook({ monsters: { troll: { art: 'swamp-troll' } } }));
  assert.equal(books.monsters.troll.assets, 'file:///campaign/assets/monsters/swamp-troll/');
});

test('icon sheets live in the book’s icons folder, with an optional detailed version', () => {
  const books = mergeContent(engineContent, campaignBook({
    icons: { relics: { image: 'relics.png', tile: 16, icons: ['bone-key'], detailed: { image: 'relics-hd.png', tile: 64 } } },
  }));
  assert.equal(books.icons.relics.url, 'file:///campaign/assets/icons/relics.png');
  assert.equal(books.icons.relics.detailed.url, 'file:///campaign/assets/icons/relics-hd.png');
  // a later book that only adds icons to the list keeps the sheet's image and folder
  const later = mergeContent(books, defineContent('file:///other/', { icons: { relics: { icons: ['bone-key', 'tooth'] } } }));
  assert.equal(later.icons.relics.url, 'file:///campaign/assets/icons/relics.png');
});

test('a malformed icon sheet or an unknown kind is an error', () => {
  assert.throws(() => mergeContent(engineContent, campaignBook({ icons: { bad: { image: 'x.png' } } })), /needs an image, a tile size and a list of icons/);
  assert.throws(() => campaignBook({ spells: {} }), /unknown kind/);
});
