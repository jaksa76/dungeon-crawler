// The shop, drawn in the 320x180 panel with the same item art as the satchel: Buy and Sell tabs and a scrolling list. A
// merchant with an `image` (its shop seen across the counter, the keeper inside: 120 x 150 pixel art, drawn 1:1) has it
// on the left, and the wares in two-line rows beside it.
//
//   createShopScreen({ kit, icons, shop, items })   // { kind, title, draw() }
//
// `shop`: { title, text, image?, view() -> { gold, stock: [{ id, price, qty }], pack: [{ id, price, qty, index }] }, buy(id), sell(index, id), close }.

import { THEME, fitText } from './canvas.js';
import { loadImage } from '../render/compositor.js';

export const SHOP_IMAGE = { x: 5, y: 20, w: 120, h: 150 }; // where a merchant's picture goes in the panel

export function createShopScreen({ kit, icons, shop, items }) {
  let buying = true, note = '', picture = null;
  if (shop.image) loadImage(shop.image).then(img => { picture = img; });
  return {
    kind: 'shop', title: shop.title,
    draw() {
      const { gold, stock, pack } = shop.view(), P = SHOP_IMAGE;
      const left = shop.image ? P.x + P.w + 5 : 10, right = 315; // the wares: beside the picture, or the whole panel
      if (shop.image) {
        kit.frame(P.x - 1, P.y - 1, P.w + 2, P.h + 2, { fill: THEME.well, edge: THEME.frameHi });
        if (picture) kit.image(picture, P.x, P.y); // 1:1, so a picture of the wrong size shows as it is rather than stretched
      }
      kit.text(`Gold: ${gold}`, left, 24, THEME.text);
      const tabs = shop.image ? right - 86 : 130; // beside the gold, where they have always been without a picture
      kit.button(tabs, 21, 40, 15, 'Buy', { selected: buying, tap: () => { buying = true; note = ''; } });
      kit.button(tabs + 44, 21, 40, 15, 'Sell', { selected: !buying, tap: () => { buying = false; note = ''; } });
      if (shop.text) kit.text(fitText(shop.text, shop.image ? right - left : 300), left, 40, THEME.dim);
      const entries = buying ? stock : pack, top = shop.text ? 52 : 42, narrow = !!shop.image;
      const listX = shop.image ? left - 3 : 5; // a little clear of the picture's frame
      kit.scroll('shop', listX, top, right - listX, 150 - top + 20 - (note ? 10 : 0), width => {
        if (!entries.length) return 8 + kit.paragraph(buying ? 'The merchant is out of stock.' : 'You have nothing this merchant can buy.', 5, 4, width - 10, THEME.dim);
        entries.forEach(({ id, price, qty, index }, i) => {
          const y = 1 + i * 22, key = buying ? id : index;
          const label = buying ? `${items[id].name} (${qty} in stock)` : `${items[id].name} x${qty}`;
          const action = buying && !qty ? 'Sold out' : buying && gold < price ? `${price} gold - too dear` : `${buying ? 'Buy' : 'Sell'} ${price} gold`;
          const disabled = buying && (!qty || gold < price);
          kit.button(1, y, width - 1, 20, '', { key: `shop:${key}`, disabled, title: label, tap: () => { note = (buying ? shop.buy(id) : shop.sell(index, id)).message; } });
          kit.icon(icons, items[id].icon, 4, y + 2, 16, { alpha: disabled ? 0.5 : 1 });
          if (narrow) { // two lines: the item, then how many and the price
            kit.text(fitText(items[id].name, width - 30), 24, y + 2, disabled ? THEME.faint : THEME.text);
            const count = buying ? `${qty} in stock` : `x${qty}`;
            kit.text(count, 24, y + 11, THEME.dim);
            kit.text(action, width - 6, y + 11, disabled ? THEME.faint : THEME.select, { align: 'right' });
          } else {
            kit.text(fitText(label, 170), 24, y + 6, disabled ? THEME.faint : THEME.text);
            kit.text(action, width - 6, y + 6, disabled ? THEME.faint : THEME.select, { align: 'right' });
          }
        });
        return 2 + entries.length * 22;
      });
      if (note) kit.text(fitText(note, shop.image ? right - left : 300), left, 166, THEME.select);
    },
  };
}
