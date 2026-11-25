const alchemistDialogue = {
  start: 'greeting',
  nodes: {
    greeting: {
      text: 'Dried herbs hang above rows of corked vials. “The Undercrypt is cold. Bring something to keep your strength up.”',
      choices: [{ label: 'Browse wares', effect: game => game.openShop('alchemist') }, { label: 'Leave' }],
    },
  },
};

export const alchemist = {
  id: 'alchemist', prop: 'stall', name: 'the alchemist’s stall',
  behavior: { type: 'talk', dialogue: alchemistDialogue },
  merchant: {
    title: 'Alchemist’s stall',
    image: new URL('../assets/shops/alchemist.png', import.meta.url).href, // 120 x 150, painted by Codex (art/ravensmoor/painted/shop-*)
    text: 'Healing and mana draughts; torches.',
    stock: {
      'health-potion': { qty: 8, price: 10 },
      'mana-potion': { qty: 6, price: 12 },
      torch: { qty: 5, price: 4 },
    },
  },
};

export const smithy = {
  id: 'smithy', npc: 'villager', name: 'the Greybridge smith',
  behavior: { type: 'shop' },
  merchant: {
    title: 'Greybridge smithy',
    image: new URL('../assets/shops/smithy.png', import.meta.url).href,
    text: 'Iron, some steel, one mithril blade.',
    stock: {
      'iron-sword': { qty: 2, price: 26 },
      'iron-mace': { qty: 1, price: 36 },
      'iron-spear': { qty: 1, price: 34 },
      'iron-mail': { qty: 1, price: 55 },
      'steel-sword': { qty: 1, price: 60 },
      'steel-mace': { qty: 1, price: 70 },
      'steel-mail': { qty: 1, price: 110 },
      'mithril-sword': { qty: 1, price: 240 },
    },
  },
};
