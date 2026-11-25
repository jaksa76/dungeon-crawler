// A conversation is a graph of named lines. Campaign choices can test or change the game before opening the next line.
// A line carries the speaker's portrait (a URL, or null): the tree's `portrait`, else the speaker's (an NPC's content entry,
// resolved by mergeContent, or its placement). A relative one is taken from the speaker's art folder.
const portraitOf = (speaker, tree) => {
  const file = tree.portrait ?? speaker?.portrait;
  if (!file) return null;
  try { return new URL(file, speaker?.assets).href; } catch { return null; }
};
export function createDialogue(game, show) {
  let current = null;

  function close(line = current) {
    if (line && line === current) {
      current = null;
      show(null);
    }
  }

  function open(speaker, tree, id) {
    const node = Object.hasOwn(tree.nodes, id) && tree.nodes[id];
    if (!node) throw new Error(`Dialogue has no line "${id}"`);
    const line = { title: tree.title ?? speaker.name ?? 'Conversation', text: node.text, portrait: portraitOf(speaker, tree) };
    line.choices = (node.choices ?? []).filter(choice => !choice.when || choice.when(game)).map(choice => ({
      label: choice.label,
      choose() {
        if (current !== line || choice.when && !choice.when(game)) return false;
        if (!choice.to) close(line);
        else current = null; // a choice can only run once, even when its effect reopens the previous line
        choice.effect?.(game);
        if (choice.to && !current) open(speaker, tree, choice.to);
        return true;
      },
    }));
    current = line;
    show(line);
    return line;
  }

  return {
    get current() { return current; },
    talk(speaker, tree) {
      const start = typeof tree.start === 'function' ? tree.start(game) : tree.start;
      return open(speaker, tree, start);
    },
    close,
  };
}
