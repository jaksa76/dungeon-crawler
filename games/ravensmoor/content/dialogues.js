const heardGuard = 'ravensmoor:heard-guard';
const heardOfMarket = 'ravensmoor:heard-of-market';
const sealReturned = 'ravensmoor:seal-returned';

export const guardDialogue = {
  title: 'Town guard',
  start: game => game.flags.get(sealReturned) ? 'safe' : game.flags.get(heardGuard) ? 'return' : 'greeting',
  nodes: {
    greeting: { text: 'Hold a moment. The gate below the Old Quarter is shut for good reason.', choices: [
      { label: 'What happened here?', to: 'undercrypt', effect: game => game.flags.set(heardGuard, true) },
      { label: 'Where does the west road lead?', to: 'market', effect: game => game.flags.set(heardOfMarket, true) },
    ] },
    return: { text: 'Back again? Keep clear of the eastern door unless you mean to go below.', choices: [
      { label: 'Tell me about the Undercrypt.', to: 'undercrypt' },
      { label: 'Where does the west road lead?', to: 'market', effect: game => game.flags.set(heardOfMarket, true) },
    ] },
    undercrypt: { text: 'Something has been stirring in the Undercrypt. We hear it scrape at the iron gate after dark. Ask the stranger by the chest if you mean to investigate.' },
    market: { text: 'West across the river is Greybridge. You can get to its market through our west gate.' },
    safe: { text: 'The scraping stopped last night. Folks are sleeping with their shutters open again.', choices: [
      { label: 'Where does the west road lead?', to: 'market', effect: game => game.flags.set(heardOfMarket, true) },
    ] },
  },
};

export const villagerDialogue = {
  title: 'Villager',
  start: game => game.flags.get(sealReturned) ? 'safe' : game.flags.get(heardGuard) ? 'warned' : 'greeting',
  nodes: {
    greeting: { text: 'Draw your water before dusk. I never come to the well after dark anymore.' },
    warned: { text: 'So the guard told you. It started the night a raven dropped dead on the eastern doorstep.' },
    safe: { text: 'For the first time in weeks the well is quiet at dusk. My children are playing outside again.' },
  },
};
