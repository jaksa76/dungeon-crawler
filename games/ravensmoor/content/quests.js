import { ravenSealEnding } from './ending.js';

const sealQuest = 'raven-seal';
const carryingSeal = game => game.inventory.count('raven-seal') > 0;
const activeQuest = game => ['accepted', 'search'].includes(game.quests.status(sealQuest));
const returnObjective = 'Take the Raven Seal to the hooded stranger in the Old Quarter.';

export const quests = {
  [sealQuest]: {
    title: 'The Raven Seal',
    start: 'accepted',
    stages: {
      accepted: game => carryingSeal(game) ? returnObjective : 'Enter the Undercrypt through the eastern door in the Old Quarter.',
      search: game => carryingSeal(game) ? returnObjective :
        'Find the warden’s key in the northern passage, then unlock the southern gate and recover the Raven Seal from the stone reliquary.',
    },
    completed: 'You returned the Raven Seal to the hooded stranger and earned 40 gold.',
    reward(game) { game.gainGold(40); },
  },
};

const strangerDialogue = {
  title: 'Hooded stranger',
  start(game) {
    if (game.quests.status(sealQuest) === 'completed') return 'finished';
    if (activeQuest(game)) return carryingSeal(game) ? 'turnIn' : 'search';
    return 'offer';
  },
  nodes: {
    offer: { text: 'The old ward below is failing. Beyond the southern gate there is a stone seal cut with a raven. Bring it back to me, and I can quiet what you hear below.', choices: [
      { label: 'I will bring back the seal.', to: 'search', effect: game => game.quests.start(sealQuest) },
      { label: 'I need time to prepare.' },
    ] },
    search: { text: 'Sound the horn in the dark, and the old crypt gate will hear it. The southern gate takes a key. Look for the warden’s lockbox in the northern passage and the stone reliquary beyond the southern gate.', choices: [
      { label: 'I found the Raven Seal.', to: 'turnIn', when: carryingSeal },
    ] },
    turnIn: { text: 'You found it. The ward has very little time left. Will you give it to me?', choices: [
      { label: 'Hand over the Raven Seal.', when: game => activeQuest(game) && carryingSeal(game), effect: returnSeal },
      { label: 'Keep it for now.' },
    ] },
    finished: { text: 'Go west when you are ready. I will meet you where the bell sounded.' },
  },
};

function returnSeal(game) {
  const slot = game.inventory.slots.findIndex(stack => stack?.id === 'raven-seal');
  if (slot < 0 || !activeQuest(game)) return;
  game.inventory.remove(slot, 1);
  game.quests.complete(sealQuest);
  game.flags.set('ravensmoor:seal-returned', true);
  game.say('You return the Raven Seal and receive 40 gold.');
  game.showEnding(ravenSealEnding);
}

export function talkToStranger(game) {
  if (!this.state.gaveHorn) {
    if (!game.inventory.count('raven-horn') && game.inventory.add('raven-horn', 1) > 0) {
      game.say('“Your pack is full. Come back when it is not.”');
      return;
    }
    this.state.gaveHorn = true;
    game.say('The stranger presses a black horn into your hands. “The crypt gate below answers only to the ravens.”');
  } else if (!game.talk) {
    game.say('“Sound the horn in the dark, and the old gate will hear it.”');
  }
  game.talk?.(this, strangerDialogue);
}
