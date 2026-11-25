// Townsfolk. Like props they stand against one side of a tile and never block it. `w` and `h` are their size in
// tiles (they must match the art's proportions); `behavior` is what Use does (see engine/rules/interaction.js).
// Art: engine/assets/npcs/<id>/. `portrait` is the picture shown when one talks (64 x 64 pixel art): a file in the art
// folder, or a full URL.
export const npcs = {
  guard: { w: 0.416, h: 0.88, portrait: 'portrait.png' },
  villager: { w: 0.266, h: 0.68, portrait: 'portrait.png' },
  hooded: { w: 0.326, h: 0.7, portrait: 'portrait.png' },
};
