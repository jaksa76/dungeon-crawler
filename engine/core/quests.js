// The journal reads definitions from the campaign and keeps only their current stages in a save.
export function createQuests(definitions, game) {
  const completed = 'completed', stages = new Map();
  for (const [id, quest] of Object.entries(definitions)) {
    if (!quest.start || !quest.stages || !Object.hasOwn(quest.stages, quest.start) || Object.hasOwn(quest.stages, completed)) {
      throw new Error(`Quest "${id}" needs a starting stage and reserves the "${completed}" stage for completion`);
    }
  }
  const definition = id => Object.hasOwn(definitions, id) ? definitions[id] : null;
  const status = id => stages.get(id) ?? null;
  const text = value => typeof value === 'function' ? value(game()) : value;

  return {
    status,
    start(id) {
      const quest = definition(id);
      if (!quest || stages.has(id)) return false;
      stages.set(id, quest.start);
      return true;
    },
    advance(id, stage) {
      const current = status(id), quest = definition(id);
      if (!current || current === completed || !Object.hasOwn(quest.stages, stage)) return false;
      stages.set(id, stage);
      return true;
    },
    complete(id) {
      const current = status(id);
      if (!current || current === completed) return false;
      stages.set(id, completed);
      definition(id).reward?.(game());
      return true;
    },
    journal() {
      return [...stages].map(([id, stage]) => {
        const quest = definition(id);
        return { id, title: quest.title, status: stage === completed ? completed : 'active',
          objective: text(stage === completed ? quest.completed : quest.stages[stage]) };
      });
    },
    persistence: {
      id: 'quests',
      save: () => Object.fromEntries(stages),
      load(saved) {
        stages.clear();
        for (const [id, stage] of Object.entries(saved ?? {})) {
          const quest = definition(id);
          if (quest && (stage === completed || Object.hasOwn(quest.stages, stage))) stages.set(id, stage);
        }
      },
      reset: () => stages.clear(),
    },
  };
}
