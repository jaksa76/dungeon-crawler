// Things that stand in a level: furniture, containers, fixtures. Size in tiles (w/h must match the art's proportions;
// `sideW` is the width seen from the side when it differs). `behavior` is the default for Use; a placement in a level
// may give its own (see engine/rules/interaction.js and loot.js). Art: engine/assets/props/<id>/.
export const props = {
  stall: { w: 1.295, h: 1.05, sideW: 0.49, behavior: { type: 'examine', text: 'Wares crowd the stall’s counter.' } },
  well: { w: 0.619, h: 0.8, behavior: { type: 'examine', text: 'Moss clings to the old stones of the well.' } },
  barrel: { w: 0.231, h: 0.32, behavior: { type: 'open', title: 'Barrel', text: 'You pry up the lid of the sealed barrel. It smells faintly of pickled fish.',
    loot: { entries: [{ item: 'health-potion', weight: 2 }, { item: 'mana-potion' }] } } },
  crate: { w: 0.265, h: 0.28, behavior: { type: 'open', title: 'Crate', text: 'The nails are loose. Under the straw there is something wrapped in cloth.',
    loot: { entries: [{ item: 'torch' }, { item: 'scroll' }, { item: 'leather-cap' }] } } },
  chest: { w: 0.289, h: 0.26 },
  lamppost: { w: 0.62, h: 1.35, behavior: { type: 'examine', text: 'The lamp burns steadily, keeping the shadows at bay.' } },
};
