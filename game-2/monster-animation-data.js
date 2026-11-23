// Art columns are shared, but each creature's playback timing is game data.
export function monsterAnimations(kind) {
  const heavy = ['ogre', 'owlbear', 'troll'].includes(kind), quick = ['rat', 'spider', 'kobold'].includes(kind);
  return {
    idle: { frames: 2, frameMs: heavy ? 500 : 360, loop: true },
    move: { frames: 4, frameMs: heavy ? 150 : quick ? 85 : 110 },
    attack: { frames: 4, frameMs: heavy ? 180 : quick ? 100 : 140, impactFrame: 2 },
    hurt: { frames: 2, frameMs: 110 },
    dead: { frames: 4, frameMs: heavy ? 180 : 140, holdMs: heavy ? 1100 : 900 },
  };
}
