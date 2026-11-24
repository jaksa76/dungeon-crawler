// The shop uses the same dialog and item art as the satchel.
export function renderShop(shop, { root, itemIcon, items }) {
  const make = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const button = (label, act) => {
    const control = make('button', label);
    control.type = 'button';
    control.addEventListener('click', act);
    return control;
  };
  if (shop.text) root.append(make('p', shop.text));
  const balance = make('p', '', 'rpg-gold');
  const controls = make('div', '', 'rpg-shop-tabs');
  const note = make('p', '', 'rpg-note');
  note.setAttribute('role', 'status');
  note.hidden = true;
  const list = make('div', '', 'rpg-loot');
  root.append(balance, controls, note, list);
  let buying = true;
  const buyTab = button('Buy', () => changeTab(true)), sellTab = button('Sell', () => changeTab(false));
  controls.append(buyTab, sellTab);

  function changeTab(next) {
    buying = next;
    note.hidden = true;
    draw();
  }
  function draw(focusKey) {
    const { gold, stock, pack } = shop.view();
    balance.textContent = `Gold: ${gold}`;
    buyTab.setAttribute('aria-pressed', buying);
    sellTab.setAttribute('aria-pressed', !buying);
    list.replaceChildren();
    const entries = buying ? stock : pack;
    if (!entries.length) list.append(make('p', buying ? 'The merchant is out of stock.' : 'You have nothing this merchant can buy.'));
    let nextFocus;
    for (const { id, price, qty, index } of entries) {
      const key = buying ? id : index;
      const row = button('', () => {
        const result = buying ? shop.buy(id) : shop.sell(index, id);
        note.textContent = result.message;
        note.hidden = false;
        draw(key);
      });
      row.className = 'rpg-row';
      const label = buying ? `${items[id].name} (${qty} in stock)` : `${items[id].name} ×${qty}`;
      const action = buying && !qty ? 'Sold out' : buying && gold < price ? `${price} gold · not enough gold` : `${buying ? 'Buy' : 'Sell'} · ${price} gold`;
      row.append(itemIcon(id, 40), make('span', label), make('span', action, 'rpg-take'));
      row.disabled = buying && (!qty || gold < price);
      if (key === focusKey && !row.disabled) nextFocus = row;
      list.append(row);
    }
    if (focusKey !== undefined) (nextFocus ?? (buying ? buyTab : sellTab)).focus({ preventScroll: true });
  }
  draw();
}
