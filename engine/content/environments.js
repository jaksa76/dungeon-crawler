// The ground and the sky around a level. Art: engine/assets/environments/<id>/ holds floor.png and, for an open sky,
// backdrop-<N|E|S|W>.png. `atmosphere` darkens what is far away (a colour, and the distances where the fog starts and
// is complete); `exploration.radius` is how far the player's map is revealed around them (none: the whole level).
// A level may override either.
export const environments = {
  town: { backdrop: true },
  dungeon: { atmosphere: { color: '#08090e', near: 0.55, far: 3.2 }, exploration: { radius: 3 } },
};
