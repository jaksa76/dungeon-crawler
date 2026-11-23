// Visual playback is deliberately transient: M4 saves actor health/position,
// while this WeakMap can be rebuilt after loading without migrating a save.
export const CLIPS = {
  idle: { frames: 2, frameMs: 360, loop: true },
  move: { frames: 4, frameMs: 110 },
  attack: { frames: 4, frameMs: 120, impactFrame: 2 },
  hurt: { frames: 2, frameMs: 110 },
  dead: { frames: 4, frameMs: 140, holdMs: 900 },
};
export const DIRECTIONS = ['front', 'back', 'left', 'right'];
let column = 0;
export const FRAME_LAYOUT = Object.fromEntries(Object.entries(CLIPS).map(([state, clip]) => {
  const entry = { column, frames: clip.frames }; column += clip.frames; return [state, entry];
}));
export const FRAME_COLUMNS = column;
// Extra horizontal room lets weapon swings keep the body at its idle scale.
export const FRAME_WIDTH_SCALE = 2;
export const FRAME_PADDING = 4;
export const clipFor = (actor, state) => ({ ...CLIPS[state], ...actor.animations?.[state] });
export const durationOf = (actor, state) => {
  const clip = clipFor(actor, state); return clip.frames * clip.frameMs + (clip.holdMs ?? 0);
};

export function createMonsterAnimator() {
  const playback = new WeakMap();
  let pausedAt = null;
  function get(actor) {
    if (!playback.has(actor)) playback.set(actor, { state: 'idle', startedAt: 0 });
    return playback.get(actor);
  }
  function sample(actor, time) {
    const now = pausedAt ?? time, entry = get(actor);
    let clip = clipFor(actor, entry.state), elapsed = Math.max(0, now - entry.startedAt);
    if (!clip.loop && entry.state !== 'dead' && elapsed >= clip.frames * clip.frameMs) {
      entry.startedAt += clip.frames * clip.frameMs; entry.state = 'idle';
      clip = clipFor(actor, 'idle'); elapsed = Math.max(0, now - entry.startedAt);
    }
    const frame = clip.loop ? Math.floor(elapsed / clip.frameMs) % clip.frames : Math.min(clip.frames - 1, Math.floor(elapsed / clip.frameMs));
    const remaining = entry.startedAt + durationOf(actor, entry.state) - now;
    return { state: entry.state, frame, frames: clip.frames, startedAt: entry.startedAt,
      finished: !clip.loop && elapsed >= clip.frames * clip.frameMs,
      opacity: entry.state === 'dead' ? Math.max(0, Math.min(1, remaining / 200)) : 1 };
  }
  function play(actor, state, now, { force = false, restart = false } = {}) {
    const current = sample(actor, now);
    if (current.state === 'dead' && state !== 'dead') return false;
    if (!force && (current.state === 'hurt' || current.state === 'attack') && state === 'move') return false;
    if (!force && current.state === 'hurt' && state === 'attack') return false;
    if (current.state === state && !restart && !force) return false;
    playback.set(actor, { state, startedAt: now }); return true;
  }
  return { sample, play,
    pause(now) { pausedAt ??= now; },
    resume(actors, now) {
      if (pausedAt === null) return 0;
      const delta = Math.max(0, now - pausedAt);
      for (const actor of actors) get(actor).startedAt += delta;
      pausedAt = null; return delta;
    },
  };
}
