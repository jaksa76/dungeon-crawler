# Sound

`engine/ui/sound.js`, on Web Audio. Nothing plays until the player presses a key or touches the screen, and nothing plays
in the headless session (bots and tests). Settings → Sound turns it all off; the choice is saved in the browser.

## Effects

Recorded samples (mp3), one event each:

| Event | When | Engine's samples |
|---|---|---|
| `step` | the hero steps (not turns) | 5 footsteps |
| `door` | a door opens or closes | 2 |
| `hit` | the hero's blow lands (not a spell or a burn) | 3 |
| `hurt` | a creature's blow lands on the hero (not poison) | 2 |
| `pickup` | something goes into the pack | 2 |
| `gold` | gold goes into the purse | 2 |

One of an event's samples plays at random, at a slightly varied pitch, so repeats do not sound mechanical; the same event
within 60 ms plays once (taking everything from a chest is one sound). The engine's own
are in `engine/assets/sound/` (all CC0; sources in `CREDITS.md` there). A campaign replaces them per event:

```js
sounds: { step: [new URL('./assets/sound/boot-1.mp3', import.meta.url).href, ...], door: [] }, // [] keeps the synthesised door
```

Until the samples have loaded, or for an event without any, a synthesised sound plays instead.

## Music and wind

A level's `sound` sets its atmosphere:

```js
sound: { track: new URL('../assets/music/undercrypt.mp3', import.meta.url).href, windTone: 145, windVolume: .15,
         music: [38, null, 45], interval: 2.7 }   // music and interval: synthesised notes, used only without a track
```

`track` is an mp3 that loops while the hero is on the level; moving to a level with another track fades one out and the
other in, and the same track carries on across levels that share it. It fades out and pauses (after 1.5 s) while the sound
is off or the tab is hidden. If the file cannot be played, the level's `music` plays instead. Without a track, `music` plays one synthesised note (MIDI number, `null` for a rest) every `interval` seconds. The wind
(filtered noise, `windTone` Hz at `windVolume`) plays under either. Nearby creatures make a low sound from their side.

Ravensmoor's tracks are in `games/ravensmoor/assets/music/` (all CC0; sources in `CREDITS.md` there). Keep files small:
96 kbit/s, loudness-matched (`ffmpeg -af loudnorm=I=-22`). An mp3 loop has a short gap at the loop point (encoder padding),
so a piece that ends in silence or a fade loops best. A track on another origin plays silent unless its server sends CORS
headers: keep tracks with the game.

## Tests

`tests/browser/sound.browser.mjs` checks that the samples load after the first key press, that each level's track plays,
and that muting pauses it. `__game2d.sound.status()` says what loaded and what is playing.
