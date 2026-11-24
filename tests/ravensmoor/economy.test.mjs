import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../../engine/core/session.js';
import { books, campaign, levels } from '../support.mjs';

const play = options => createSession({ ...campaign, levels, books, ...options });

test('gold from a cache goes straight to the purse, even with a full pack', () => {
  const session = play({ inventorySize: 2 });
  const cache = { id: 'economy-test-cache' };
  session.openContainer(cache, { contents: [{ item: 'iron-sword' }, { item: 'gold', qty: 30 }] });
  assert.deepEqual(session.takeAll(), [{ id: 'gold', qty: 30 }]);
  assert.equal(session.wallet.amount, 30);
  assert.equal(session.inventory.count('gold'), 0);
  assert.deepEqual(session.openBox.stacks, [{ id: 'iron-sword', qty: 1 }]);
  assert.deepEqual(session.takeAll(), []);
  assert.equal(session.wallet.amount, 30);
});

test('the alchemist opens through dialogue, then trades against stock, pack space and gold', () => {
  const session = play({ inventorySize: 2 });
  session.begin({ welcome: false });
  Object.assign(session.player, { x: 2, z: 1, dir: 0 });
  session.interact();
  assert.ok(session.dialogue.current.choices.find(choice => choice.label === 'Browse wares').choose());
  const shop = session.openShop;
  assert.equal(session.dialogue.current, null);
  assert.equal(shop.buy('health-potion').ok, false);
  assert.equal(shop.view().stock[0].qty, 8);
  session.api.gainGold(30);
  assert.equal(shop.buy('torch').ok, false, 'a purchase without pack space does not charge the hero');
  assert.equal(session.wallet.amount, 30);
  assert.equal(shop.buy('health-potion').ok, true, 'an existing stack can accept a potion');
  assert.equal(session.wallet.amount, 20);
  const potion = shop.view().pack.find(stack => stack.id === 'health-potion');
  assert.equal(potion.qty, 2);
  assert.equal(shop.sell(potion.index, 'mana-potion').ok, false, 'an old selection cannot sell the wrong item');
  assert.equal(shop.sell(potion.index, potion.id).ok, true);
  assert.equal(session.inventory.count(potion.id), 1);
  assert.equal(session.wallet.amount, 25);
  session.move('left');
  assert.equal(shop.buy(potion.id).ok, false, 'walking or turning away invalidates the old shop');
});

test('both the purse and finite merchant stock survive saves, with zero gold for old saves', async () => {
  const session = play({ level: 'market' });
  session.begin({ welcome: false });
  Object.assign(session.player, { x: 3, z: 1, dir: 0 });
  session.interact();
  const shop = session.openShop;
  session.api.gainGold(90);
  assert.equal(shop.buy('iron-mace').ok, true);
  assert.equal(shop.buy('iron-mace').ok, false);
  const saved = session.persistence.snapshot();
  const restored = play({ level: 'market' });
  assert.deepEqual((await restored.load(saved)).issues, []);
  restored.begin({ welcome: false, loaded: true });
  restored.interact();
  assert.equal(restored.wallet.amount, 54);
  assert.equal(restored.inventory.count('iron-mace'), 1);
  assert.equal(restored.openShop.buy('iron-mace').ok, false);
  delete saved.sections.engine.wallet;
  assert.deepEqual((await restored.load(saved)).issues, []);
  assert.equal(restored.wallet.amount, 0);
});
