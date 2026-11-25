# The phone interface

A phone held sideways shows the **400 x 180** layout of the one canvas: the 320 x 180 scene between two 40 x 180 rails. Held
upright it shows a **Rotate your device** overlay. How the canvas is sized and scaled, the HUD, the menus and the drawing kit are in
[ui.md](ui.md); this page is what the player does on a phone.

## Controls

- **Move stick** (bottom of the left rail): put a finger on it and push. Up steps forward, down steps back, left and right strafe. Slide the
  finger to change direction without lifting; hold to keep going (after a short pause it repeats, like a held key).
- **Turn pill** (bottom of the right rail): put a finger on its left or right half, or slide along it, to turn. Holding repeats.
- **Tap the scene** to attack a creature (hold to keep swinging) or to use an object. **Drag across the scene** to move, as an alternative to the sticks: drag down to step forward, up to step back, left to turn right, right to turn left. The picture follows your finger and the move counts when you lift, if the drag went far enough. There are no Attack, Cast or Use buttons.
- **Quick slots** (the right rail, eight of them in two columns): tap to use, press and hold for what it is, drag to move, swap or (dragged off the
  bar) empty a slot. Spells live here: the first spell you learn takes the first free slot. See [quickbar.md](quickbar.md).
- **Menu buttons** (the left rail, six in two columns): character, spells (help when the game has no spells), journal, satchel, full screen, settings.
  Tapping the head opens the character screen too; a gold plus on it means unspent skill points.
- **Full screen** also asks Android Chrome to lock the screen to landscape. iPhone Safari has no full screen for pages; the overlay asks
  for the rotation there, and the player turns off their orientation lock if it is on.

## Sizes

Everything is drawn on one pixel grid, shown at a whole number of device pixels per pixel: a Pixel 7a (2400 x 1080 device pixels) shows
it at 6x with no border; an iPhone 12 to 14 at 6x with a thin border at the sides; an iPhone SE at 3x. A touch target is a whole number of
canvas pixels, so its size on screen follows the scale: the 18-pixel quick slots and menu buttons are about 41 CSS pixels on a Pixel 7a, the
move stick 82, the turn pill 82 x 55. On the smallest phones (3x or less) they get small; the layout is built for 6x.

`?layout=mobile` shows this layout in a desktop browser (with the window held wider than tall), to try it without a phone.
