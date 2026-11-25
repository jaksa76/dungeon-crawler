// A story moment: full-screen pages, each a picture with text over its lower part, that the player advances. It covers the
// whole canvas (the scene and the HUD), on top of everything. See docs/engine/screens.md.
//
//   const story = createStory({ kit, story, done })   // story: { title?, pages: [{ image?, title?, text }] }
//   story.draw(width, height)   story.next()   story.skip()
//
// A tap anywhere, Enter, Space or the right arrow turns the page; the last page closes it and calls `done`. Escape skips
// the rest. Text too long for the lower part of the screen (about half its height) carries on over the same picture. A picture of 400 x 240 covers both canvases (320 x 240 and 400 x 180) at scale 1 and is drawn crisp, like
// the main menu's background; other sizes are cover-fitted, smoothed. A page without a picture is text on black.

import { THEME, wrapText } from './canvas.js';
import { loadImage } from '../render/compositor.js';

const GOLD = '#e8c688', PAD = 10;

export function createStory({ kit, story, done = () => {} }) {
  const pages = story.pages?.length ? story.pages : [story];
  const images = pages.map(() => null);
  pages.forEach((page, i) => { if (page.image) loadImage(page.image).then(img => { images[i] = img; }); });
  let at = 0, part = 0, parts = 1, finished = false; // `part` of the page's text, of `parts` (worked out as it is drawn)
  const finish = () => { if (finished) return; finished = true; done(); };
  const next = () => { if (part < parts - 1) part++; else if (at < pages.length - 1) { at++; part = 0; } else finish(); };

  function draw(W, H) {
    const { g } = kit, page = pages[at], img = images[at];
    kit.origin(0, 0);
    kit.fill(0, 0, W, H, '#060408');
    if (img) {
      const k = Math.max(W / img.width, H / img.height), w = Math.round(img.width * k), h = Math.round(img.height * k);
      g.save(); g.imageSmoothingEnabled = k !== Math.floor(k); g.imageSmoothingQuality = 'high';
      g.drawImage(img, Math.floor((W - w) / 2), Math.floor((H - h) / 2), w, h); g.restore();
    }
    // The text, bottom up: the hint line, the text, the title; a dark band behind them so they read on any picture.
    const width = W - 2 * PAD, lh = kit.font.h + 1, room = Math.max(2, Math.floor(H * 0.45 / lh) - 3);
    const all = wrapText(page.text ?? '', width);
    parts = Math.max(1, Math.ceil(all.length / room)); part = Math.min(part, parts - 1);
    const lines = all.slice(part * room, (part + 1) * room);
    const title = part > 0 ? null : at === 0 ? page.title ?? story.title : page.title;
    const textTop = H - PAD - 10 - lines.length * lh, top = textTop - (title ? 12 : 0) - 6;
    const shade = g.createLinearGradient(0, top - 24, 0, H);
    shade.addColorStop(0, 'rgba(6,4,8,0)'); shade.addColorStop(0.3, 'rgba(6,4,8,0.78)'); shade.addColorStop(1, 'rgba(6,4,8,0.92)');
    g.fillStyle = shade; g.fillRect(0, top - 24, W, H - top + 24);
    if (title) kit.text(title.toUpperCase(), PAD, textTop - 12, GOLD, { shadow: true });
    lines.forEach((line, i) => kit.text(line, PAD, textTop + i * lh, THEME.text, { shadow: true }));
    const hint = at < pages.length - 1 || part < parts - 1 ? 'Continue' : 'Close';
    kit.text(pages.length > 1 ? `${at + 1}/${pages.length}  ${hint}` : hint, W - PAD, H - PAD - kit.font.h + 1, THEME.dim, { align: 'right' });
    kit.hit(0, 0, W, H, { key: 'story:page', title: hint, tap: next });
  }
  return { draw, next, skip: finish, get page() { return at; }, get pages() { return pages.length; } };
}
