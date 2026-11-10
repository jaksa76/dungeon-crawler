# Mobile HUD artwork

`panel-stone.png` was generated with OpenAI image generation for this project.
It is a reusable dark stone panel with bronze edging. The HUD renders it onto a 64×64 logical canvas and uses a 3-pixel
border-image slice to keep the corners intact as panels and buttons resize.

Icons and the hero portrait are reused from `game-1/assets/ui`. Item and menu
icons are cropped individually into canvases; labels, health bars, map, dialog
content, and touch targets remain separate from the painted artwork.

`rpg-pixel.woff` uses the same public-domain X11 5×8 glyphs as the game’s
canvas text. Rebuild with `python3 tools/build-ui-font.py` (requires fonttools).
Item icons, portrait, minimap, and control arrows also use small logical canvases
and nearest-neighbour enlargement; touch targets retain their physical size.
