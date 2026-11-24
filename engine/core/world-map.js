// A campaign names its destinations and places them on its own painted map.
// Visiting a level, learning its discovery flag, or calling discover() reveals a destination permanently.
export function createWorldMap(map, levels) {
  if (!map) return null;
  if (!Array.isArray(map.locations) || typeof map.image !== 'string' || !map.image) throw new Error('A world map needs an image and locations');
  const destinations = new Map();
  for (const location of map.locations) {
    const { id, name, x, y, level, requires, spawn, travelTime } = location;
    const destination = Object.hasOwn(levels, level) ? levels[level] : null;
    if (typeof id !== 'string' || !id || typeof name !== 'string' || !name || destinations.has(id) || !destination ||
        ![x, y].every(coordinate => Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 100) ||
        (requires !== undefined && (typeof requires !== 'string' || !requires))) {
      throw new Error(`Invalid world map location: ${id ?? name ?? '(unnamed)'}`);
    }
    if (spawn && (!destination.tileTypes[destination.level.tiles[spawn.z]?.[spawn.x]]?.floor ||
        !Number.isInteger(spawn.dir) || spawn.dir < 0 || spawn.dir > 3)) {
      throw new Error(`Invalid world map arrival for ${id}`);
    }
    if (travelTime !== undefined && (!Number.isInteger(travelTime) || travelTime < 0 || travelTime > 2 ** 31 - 1)) {
      throw new Error(`Invalid world map travel time for ${id}`);
    }
    destinations.set(id, { ...location });
  }
  const known = new Set();
  function discover(id) {
    if (!destinations.has(id) || known.has(id)) return false;
    known.add(id);
    return true;
  }
  function reset() {
    known.clear();
    for (const location of destinations.values()) if (location.known) discover(location.id);
  }
  reset();

  function exit(id, from) {
    const location = destinations.get(id);
    if (!known.has(id) || location.level === from) return null;
    return { to: location.level, spawn: location.spawn, travelTime: location.travelTime };
  }
  return {
    discover,
    visit(level) {
      for (const location of destinations.values()) if (location.level === level) discover(location.id);
    },
    flag(key, value) {
      if (!value) return;
      for (const location of destinations.values()) if (location.requires === key) discover(location.id);
    },
    view(level) {
      const locations = [...destinations.values()].filter(location => known.has(location.id))
        .map(({ id, name, x, y, level: to }) => ({ id, name, x, y, here: to === level }));
      return { image: map.image, locations };
    },
    exit,
    persistence: {
      id: 'world-map',
      save: () => [...known],
      load(ids) {
        reset();
        if (Array.isArray(ids)) for (const id of ids) discover(id);
      },
      reset,
    },
  };
}
