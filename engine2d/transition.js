// Subtle motion between two composed views of the 2D crawler. Meant to be felt, not noticed.
//
//   turn / strafe  the view pans a few percent sideways while the old picture fades into the new one
//   forward / back the old picture zooms a few percent (in for forward, out for back) while the new one fades in
//
// drawTransition() draws one frame at progress u (0 = the old view, 1 = the new one); geometry and opacity are
// both linear in u, and the easing is applied to time by the caller. That is what lets a swipe show the first
// part of a transition while the finger is still down (u up to PEEK) and the game carry on from that same u.

export const PEEK = 0.35;        // how far into the transition a full-threshold swipe drags the view
export const RELEASE_MS = 120;   // a swipe that is let go of too early settles back this fast

// pan: `amp` is the sideways travel as a share of the view's width. zoom: `amt` is the scale change.
const MOTION = {
  turn: { kind: 'pan', amp: 0.05, ms: 160 },
  strafe: { kind: 'pan', amp: 0.03, ms: 150 },
  move: { kind: 'zoom', amt: 0.06, ms: 180 },
};
const BY_COMMAND = {
  left: ['turn', -1], right: ['turn', 1],
  strafeLeft: ['strafe', -1], strafeRight: ['strafe', 1],
  forward: ['move', 1], back: ['move', -1],
};
// Turning right pans the view right, so the scene slides left. (Flip this to scroll the picture the other way.)
const PAN_SCENE_OPPOSITE = true;

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// { kind, sign, ms, amp | amt } for a game command, or null for commands that don't move the view.
// With reduced motion asked for, every move is a short plain crossfade.
export function motionFor(cmd) {
  const entry = BY_COMMAND[cmd];
  if (!entry) return null;
  if (reducedMotion.matches) return { kind: 'fade', sign: 1, ms: 120 };
  const [name, sign] = entry;
  return { ...MOTION[name], sign };
}

export const easeOut = (t) => 1 - (1 - t) ** 3;

// Draw `from` and `to` (canvases of the same size, `to` may be null) at progress u. With no `to` the view
// only leans a hair into the move, as a swipe into a wall does.
export function drawTransition(g, from, to, motion, u) {
  const w = from.width, h = from.height;
  // One picture, shifted by dx, scaled by s about the middle. Always called with s large enough for the
  // picture to still cover the whole frame.
  const layer = (img, dx, s, alpha) => {
    if (alpha <= 0) return;
    g.save();
    g.globalAlpha = alpha;
    g.translate(w / 2 + dx, h / 2);
    g.scale(s, s);
    g.drawImage(img, -w / 2, -h / 2, w, h);
    g.restore();
  };

  if (!to) { layer(from, 0, 1 + 0.012 * u, 1); return; }

  if (motion.kind === 'pan') {
    const travel = motion.amp * w * motion.sign * (PAN_SCENE_OPPOSITE ? -1 : 1);
    const dxFrom = travel * u, dxTo = -travel * (1 - u);
    // Scale each picture just enough that its shifted edge never leaves a gap at the frame's side.
    layer(from, dxFrom, 1 + 2 * Math.abs(dxFrom) / w, 1);
    layer(to, dxTo, 1 + 2 * Math.abs(dxTo) / w, u);
  } else if (motion.kind === 'zoom') {
    const z = motion.amt;
    if (motion.sign > 0) { // forward: the old view grows past the frame, the new one grows up to it
      layer(from, 0, 1 + z * u, 1);
      layer(to, 0, 1 - z * (1 - u), u);
    } else { // back: the new view shrinks down to the frame, the old one shrinks away over it
      layer(to, 0, 1 + z * (1 - u), 1);
      layer(from, 0, 1 - z * u, 1 - u);
    }
  } else { // plain crossfade
    layer(from, 0, 1, 1);
    layer(to, 0, 1, u);
  }
}
