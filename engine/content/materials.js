// What weapons and armour can be made of. The engine gives each material its colours only: four colours, dark to light,
// that repaint the grey metal of an icon (ui/icons.js), so one sword icon serves every sword. What a material does in
// a fight (`damage`, `speed`, `defence`) is the campaign's to decide; see content/catalog.js.
export const materials = {
  rusty:    { name: 'Rusty',    colours: ['#22110c', '#4a2519', '#753d2a', '#9c6450'] },
  bronze:   { name: 'Bronze',   colours: ['#3b220c', '#7a4a1c', '#b97d34', '#f0c878'] },
  iron:     { name: 'Iron',     colours: ['#222327', '#505157', '#86878b', '#c4c4c1'] },
  steel:    { name: 'Steel',    colours: ['#222d3b', '#4f6680', '#8ea9c4', '#dce9f6'] },
  silver:   { name: 'Silver',   colours: ['#4a4a50', '#94959c', '#d8d9de', '#ffffff'] },
  gold:     { name: 'Gold',     colours: ['#4a2c05', '#9a6510', '#e0aa2a', '#fff1a0'] },
  mithril:  { name: 'Mithril',  colours: ['#1b3347', '#3e7895', '#8bc8dc', '#e8fbff'] },
  obsidian: { name: 'Obsidian', colours: ['#0c0a12', '#2a2236', '#54476a', '#9a8cb4'] },
};
