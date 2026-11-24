// Doors: placed on a floor tile of a level. Shut, the tile is a wall that shows the `building`'s art; open, it is
// floor and the way through. Their behaviour comes from the door() factory (engine/rules/behaviours.js); a campaign
// may define its own doors, or override any method.
import { door } from '../rules/behaviours.js';

export const doors = {
  'iron-door': { name: 'an ironbound door', building: 'dungeon-door', ...door({ key: 'key' }) },
};
