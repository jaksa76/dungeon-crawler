// The shop, drawn in the 320x180 panel with the same item art as the satchel: Buy and Sell tabs and a scrolling list.
//
//   createShopScreen({ kit, icons, shop, items })   // { kind, title, draw() }
//
// `shop`: { title, text, view() -> { gold, stock: [{ id, price, qty }], pack: [{ id, price, qty, index }] }, buy(id), sell(index, id), close }.

import { THEME, fitText } from './canvas.js';

export function createShopScreen({ kit, icons, shop, items }) {
  let buying = true, note = '';
  return {
    kind: 'shop', title: shop.title,
    draw() {
      const { gold, stock, pack } = shop.view();
      kit.text(`Gold: ${gold}`, 10, 24, THEME.text);
      kit.button(130, 21, 40, 15, 'Buy', { selected: buying, tap: () => { buying = true; note = ''; } });
      kit.button(174, 21, 40, 15, 'Sell', { selected: !buying, tap: () => { buying = false; note = ''; } });
      if (shop.text) kit.text(fitText(shop.text, 300), 10, 40, THEME.dim);
      const entries = buying ? stock : pack, top = shop.text ? 52 : 42;
      kit.scroll('shop', 5, top, 310, 150 - top + 20 - (note ? 10 : 0), width => {
        if (!entries.length) { kit.text(buying ? 'The merchant is out of stock.' : 'You have nothing this merchant can buy.', 5, 4, THEME.dim); return 14; }
        entries.forEach(({ id, price, qty, index }, i) => {
          const y = 1 + i * 22, key = buying ? id : index;
          const label = buying ? `${items[id].name} (${qty} in stock)` : `${items[id].name} x${qty}`;
          const action = buying && !qty ? 'Sold out' : buying && gold < price ? `${price} gold - too dear` : `${buying ? 'Buy' : 'Sell'} ${price} gold`;
          const disabled = buying && (!qty || gold < price);
          kit.button(1, y, width - 1, 20, '', { key: `shop:${key}`, disabled, title: label, tap: () => { note = (buying ? shop.buy(id) : shop.sell(index, id)).message; } });
          kit.icon(icons, items[id].icon, 4, y + 2, 16, { alpha: disabled ? 0.5 : 1 });
          kit.text(fitText(label, 170), 24, y + 6, disabled ? THEME.faint : THEME.text);
          kit.text(action, width - 6, y + 6, disabled ? THEME.faint : THEME.select, { align: 'right' });
        });
        return 2 + entries.length * 22;
      });
      if (note) kit.text(fitText(note, 300), 10, 166, THEME.select);
    },
  };
}
