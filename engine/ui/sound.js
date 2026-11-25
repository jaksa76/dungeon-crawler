// A lightweight Web Audio soundscape. It only starts after an input gesture and stays out of the headless session.
//
// Sound effects are recorded samples (mp3): the engine's own (engine/assets/sound/, CC0, see CREDITS.md there), which a
// campaign replaces per event with `sounds: { step: [url, ...], ... }` (an empty list keeps the synthesised one). One of an
// event's samples is picked at random and played at a slightly varied pitch. Until they have loaded, or if one fails, the
// synthesised effect plays instead. A level's `sound.track` is a recorded piece of music (an mp3 URL) that loops while
// the hero is there and replaces the synthesised notes (`sound.music`); the wind plays under both.

// The synthesised effects. `hurt` and `gold` borrow `hit` and `pickup`.
const EFFECTS = {
  step: { filter: 170, time: .09, volume: .12 },
  door: { filter: 420, time: .34, volume: .16, pitch: 57 },
  hit: { filter: 730, time: .12, volume: .20, pitch: 83 },
  pickup: { time: .15, volume: .09, pitch: 724 },
};
const SYNTH = { hurt: 'hit', gold: 'pickup' };
const here = new URL('../assets/sound/', import.meta.url);
const files = (name, count, pad = 0) => Array.from({ length: count }, (_, i) => new URL(`${name}-${String(pad ? i * 2 : i + 1).padStart(pad, '0')}.mp3`, here).href);
// The engine's samples, by event: footsteps, a door, the hero's blow landing, a blow landing on the hero, picking up, gold.
export const SAMPLES = {
  step: files('step', 5, 2), door: files('door', 2), hit: files('hit', 3), hurt: files('hurt', 2), pickup: files('pickup', 2), gold: files('gold', 2),
};
// How loud each event's samples play (they are loudness-matched; the music is quieter still).
const SAMPLE_VOLUME = { step: .3, door: .55, hit: .6, hurt: .7, pickup: .45, gold: .5 };
const TRACK_VOLUME = .55;

export function createSound({ initiallyMuted = false, saveMuted = () => {}, samples = {} } = {}) {
  const Audio = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Audio) return null;
  let context, master, wind, windFilter, windVolume, noise, scene;
  let muted = initiallyMuted, present = true, nextNote = 0, note = 0, nextCreature = 0;
  const sampleUrls = { ...SAMPLES, ...samples }, buffers = new Map(); // event -> the decoded samples that loaded
  const tracks = new Map(); let playing = null; // url -> { element, gain, stop, failed }; the track that is on
  const lastPlayed = new Map(); // event -> when its sample last started: a take-all is one sound, not a pile of them

  // Fetch and decode every sample once the context exists. Each event keeps the ones that loaded.
  function loadSamples() {
    for (const [kind, urls] of Object.entries(sampleUrls)) {
      for (const url of urls ?? []) {
        fetch(url).then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
          .then(data => context.decodeAudioData(data))
          .then(buffer => { if (!buffers.has(kind)) buffers.set(kind, []); buffers.get(kind).push(buffer); })
          .catch(() => {}); // a missing sample leaves the synthesised effect
      }
    }
  }

  // The level's music: its track fades in, any other fades out and pauses. Paused too while muted or hidden.
  function tuneTrack() {
    if (!context) return;
    const want = !muted && present ? scene?.track ?? null : null;
    for (const [url, t] of tracks) {
      if (url === want) continue;
      if (t.element.paused) { t.gain.gain.cancelScheduledValues(context.currentTime); t.gain.gain.value = 0; continue; } // it fades in when it starts
      if (t.stop) continue; // already fading out
      t.gain.gain.setTargetAtTime(0, context.currentTime, .3);
      t.stop = setTimeout(() => { t.stop = null; if (playing !== url) t.element.pause(); }, 1500);
    }
    playing = want;
    if (!want) return;
    let t = tracks.get(want);
    if (!t) {
      const element = new globalThis.Audio(want); element.loop = true; element.preload = 'auto';
      const gain = context.createGain(); gain.gain.value = 0;
      context.createMediaElementSource(element).connect(gain).connect(master);
      t = { element, gain, stop: null, failed: false }; tracks.set(want, t);
      element.addEventListener('error', () => { t.failed = true; }); // the level falls back to its synthesised notes
    }
    if (t.stop) { clearTimeout(t.stop); t.stop = null; }
    if (t.element.paused) void t.element.play().catch(() => {}); // the browser may refuse until a gesture: the next unlock retries
    t.gain.gain.setTargetAtTime(TRACK_VOLUME, context.currentTime, .4);
  }

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
        loadSamples();
      }
      if (context.state === 'suspended') void context.resume().catch(() => {});
      tuneTrack();
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
    const now = context.currentTime, recorded = buffers.get(kind);
    if (recorded?.length) {
      if (now - (lastPlayed.get(kind) ?? -1) < .06) return;
      lastPlayed.set(kind, now);
      const source = context.createBufferSource(), gain = context.createGain();
      source.buffer = recorded[Math.floor(Math.random() * recorded.length)];
      source.playbackRate.value = .94 + Math.random() * .12;
      gain.gain.value = SAMPLE_VOLUME[kind] ?? .5;
      source.connect(gain).connect(master); source.start(now);
      return;
    }
    const synth = SYNTH[kind] ?? kind;
    if (!EFFECTS[synth]) return;
    const { filter, time, volume, pitch } = EFFECTS[synth];
    if (filter) {
      const source = context.createBufferSource(); source.buffer = noise;
      const colours = context.createBiquadFilter(); colours.type = 'lowpass'; colours.frequency.value = filter;
      source.connect(colours).connect(envelope(now, time, volume));
      source.start(now, Math.random()); source.stop(now + time);
    }
    if (pitch) tone(now, { pitch, time, volume: volume * .45, shape: 'triangle', drift: synth === 'pickup' ? 1.5 : .72 });
  }

  return {
    unlock, effect,
    // For tests: how many samples of each event loaded, and the track that is on (and whether it is playing).
    status: () => ({ samples: Object.fromEntries([...buffers].map(([k, v]) => [k, v.length])), track: playing,
      playing: !!playing && !tracks.get(playing)?.element.paused, state: context?.state ?? null }),
    get muted() { return muted; },
    setMuted(value) {
      muted = value;
      saveMuted(muted);
      if (!muted) unlock();
      if (master) makeVolume(!muted && present ? .52 : 0);
      tuneTrack();
    },
    setPresent(value) {
      present = value;
      if (master) makeVolume(!muted && present ? .52 : 0);
      tuneTrack();
    },
    setLevel(sound) { scene = sound; note = 0; nextNote = 0; tuneLevel(); tuneTrack(); },
    update(player, actors, paused) {
      if (!scene || muted || !present || context?.state !== 'running') return;
      const now = context.currentTime;
      if ((!scene.track || tracks.get(scene.track)?.failed) && scene.music?.length && now >= nextNote) { // the synthesised notes, when the level has no track (or it failed)
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
