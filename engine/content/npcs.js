// Townsfolk. Like props they stand against one side of a tile and never block it. `w` and `h` are their size in
// tiles (they must match the art's proportions); `behavior` is what Use does (see engine/rules/interaction.js).
// Art: engine/assets/npcs/<id>/.
export const npcs = {
  guard: { w: 0.416, h: 0.88 },
  villager: { w: 0.266, h: 0.68 },
  hooded: { w: 0.326, h: 0.7 },
};
