// A lightweight Web Audio soundscape. It only starts after an input gesture and stays out of the headless session.
const EFFECTS = {
  step: { filter: 170, time: .09, volume: .12 },
  door: { filter: 420, time: .34, volume: .16, pitch: 57 },
  hit: { filter: 730, time: .12, volume: .20, pitch: 83 },
  pickup: { time: .15, volume: .09, pitch: 724 },
};

export function createSound({ initiallyMuted = false, saveMuted = () => {} } = {}) {
  const Audio = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Audio) return null;
  let context, master, wind, windFilter, windVolume, noise, scene;
  let muted = initiallyMuted, present = true, nextNote = 0, note = 0, nextCreature = 0;

  function makeVolume(target, seconds = .12) {
    master.gain.setTargetAtTime(target, context.currentTime, seconds);
  }

  function tuneLevel() {
    if (!context) return;
    windFilter.frequency.setTargetAtTime(scene?.windTone ?? 180, context.currentTime, .25);
    windVolume.gain.setTargetAtTime(scene?.windVolume ?? 0, context.currentTime, .25);
  }

  function unlock() {
    if (muted) return;
    try {
      if (!context) {
        context = new Audio();
        master = context.createGain(); master.gain.value = present ? .52 : 0; master.connect(context.destination);
        const length = context.sampleRate * 2;
        noise = context.createBuffer(1, length, context.sampleRate);
        const samples = noise.getChannelData(0);
        for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;
        wind = context.createBufferSource(); wind.buffer = noise; wind.loop = true;
        windFilter = context.createBiquadFilter(); windFilter.type = 'lowpass';
        windVolume = context.createGain(); windVolume.gain.value = 0;
        wind.connect(windFilter).connect(windVolume).connect(master); wind.start();
        tuneLevel();
      }
      if (context.state === 'suspended') void context.resume().catch(() => {});
    } catch { muted = true; } // A device can decline audio while the game continues.
  }

  function envelope(now, time, volume, pan = 0, attack = .025) {
    const gain = context.createGain();
    const peak = Math.max(.0002, volume);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + attack);
    gain.gain.exponentialRampToValueAtTime(.0001, now + time);
    if (pan && context.createStereoPanner) {
      const stereo = context.createStereoPanner(); stereo.pan.value = pan;
      gain.connect(stereo).connect(master);
    } else gain.connect(master);
    return gain;
  }

  function tone(now, { pitch, time, volume, pan, shape = 'sine', drift = 1, attack }) {
    const oscillator = context.createOscillator(); oscillator.type = shape;
    oscillator.frequency.setValueAtTime(pitch, now);
    oscillator.frequency.exponentialRampToValueAtTime(pitch * drift, now + time);
    oscillator.connect(envelope(now, time, volume, pan, attack));
    oscillator.start(now); oscillator.stop(now + time);
  }

  function effect(kind) {
    if (!scene || muted || !present || context?.state !== 'running') return;
    const { filter, time, volume, pitch } = EFFECTS[kind];
    const now = context.currentTime;
    if (filter) {
      const source = context.createBufferSource(); source.buffer = noise;
      const colours = context.createBiquadFilter(); colours.type = 'lowpass'; colours.frequency.value = filter;
      source.connect(colours).connect(envelope(now, time, volume));
      source.start(now, Math.random()); source.stop(now + time);
    }
    if (pitch) tone(now, { pitch, time, volume: volume * .45, shape: 'triangle', drift: kind === 'pickup' ? 1.5 : .72 });
  }

  return {
    unlock, effect,
    get muted() { return muted; },
    setMuted(value) {
      muted = value;
      saveMuted(muted);
      if (!muted) unlock();
      if (master) makeVolume(!muted && present ? .52 : 0);
    },
    setPresent(value) {
      present = value;
      if (master) makeVolume(!muted && present ? .52 : 0);
    },
    setLevel(sound) { scene = sound; note = 0; nextNote = 0; tuneLevel(); },
    update(player, actors, paused) {
      if (!scene || muted || !present || context?.state !== 'running') return;
      const now = context.currentTime;
      if (scene.music?.length && now >= nextNote) {
        const midi = scene.music[note++ % scene.music.length];
        nextNote = now + (scene.interval ?? 2.4);
        if (midi != null) tone(now, { pitch: 440 * 2 ** ((midi - 69) / 12), time: 3, volume: .03, shape: 'triangle', attack: .22 });
      }
      if (paused || now < nextCreature) return;
      nextCreature = now + .52;
      let nearest = null, distance = (scene.creatureRange ?? 6) + 1;
      for (const actor of actors) {
        const range = Math.abs(actor.x - player.x) + Math.abs(actor.z - player.z);
        if (actor.hp > 0 && range < distance) { nearest = actor; distance = range; }
      }
      if (!nearest) return;
      const lateral = [nearest.x - player.x, nearest.z - player.z, player.x - nearest.x, player.z - nearest.z][player.dir];
      tone(now, { pitch: 82 + Math.random() * 20, time: .34, volume: .10 / Math.max(1, distance), pan: Math.sign(lateral) * .6, shape: 'triangle', drift: .62 });
      nextCreature = now + 1.14 + distance * .17;
    },
  };
}
