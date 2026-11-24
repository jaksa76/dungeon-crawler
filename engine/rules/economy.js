// Gold is independent of pack capacity. Merchant stock belongs to the placed entity, so it follows world persistence.
export function createWallet() {
  let amount = 0;
  return {
    get amount() { return amount; },
    gain(qty) {
      if (!Number.isSafeInteger(qty) || qty < 1) return 0;
      const added = Math.min(Number.MAX_SAFE_INTEGER - amount, qty);
      amount += added;
      return added;
    },
    spend(qty) {
      if (!Number.isSafeInteger(qty) || qty < 1 || amount < qty) return false;
      amount -= qty;
      return true;
    },
    persistence: {
      id: 'wallet',
      save: () => amount,
      load(value, ctx) {
        amount = 0;
        if (Number.isSafeInteger(value) && value >= 0) amount = value;
        else ctx.issue('the saved gold balance was invalid');
      },
      reset() { amount = 0; },
    },
  };
}

export function merchantTrade(entity, { title, text, stock }, inventory, items, wallet) {
  const entries = Object.entries(stock ?? {});
  for (const [id, { price, qty }] of entries) {
    if (!Object.hasOwn(items, id) || items[id].currency || !Number.isSafeInteger(price) || price < 1 || !Number.isSafeInteger(qty) || qty < 0)
      throw new Error(`Invalid stock for ${title ?? entity.name}: ${id}`);
  }
  const stocked = ([id, { qty }]) => {
    const remaining = entity.state.shopStock?.[id];
    return Number.isSafeInteger(remaining) && remaining >= 0 ? remaining : qty;
  };
  const sellPrice = id => {
    const item = items[id], listed = entries.find(([key]) => key === id)?.[1].price;
    if (!item || item.currency || item.sell === false || (!listed && !(Number.isSafeInteger(item.value) && item.value > 0))) return 0;
    return Math.max(1, Math.floor((listed ?? item.value) / 2));
  };
  const fail = message => ({ ok: false, message });
  return {
    title: title ?? entity.name ?? 'Merchant', text,
    view: () => ({
      gold: wallet.amount,
      stock: entries.map(entry => ({ id: entry[0], price: entry[1].price, qty: stocked(entry) })),
      pack: inventory.slots.flatMap((stack, index) => {
        const price = stack && sellPrice(stack.id);
        return price ? [{ ...stack, index, price }] : [];
      }),
    }),
    buy(id) {
      const entry = entries.find(([key]) => key === id);
      if (!entry || stocked(entry) < 1) return fail('This item is sold out.');
      const { price } = entry[1];
      if (wallet.amount < price) return fail('You do not have enough gold.');
      if (inventory.add(id, 1)) return fail('Your pack is full.');
      wallet.spend(price);
      entity.state.shopStock = { ...entity.state.shopStock, [id]: stocked(entry) - 1 };
      return { ok: true, message: `You buy ${items[id].name} for ${price} gold.` };
    },
    sell(index, expectedId) {
      const stack = inventory.slots[index], price = stack && sellPrice(stack.id);
      if (!price || stack.id !== expectedId) return fail('This item cannot be sold here.');
      if (Number.MAX_SAFE_INTEGER - wallet.amount < price) return fail('Your purse is full.');
      const { id } = inventory.remove(index, 1);
      wallet.gain(price);
      return { ok: true, message: `You sell ${items[id].name} for ${price} gold.` };
    },
  };
}
