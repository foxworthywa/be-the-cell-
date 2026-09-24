// @deps btc-level-kit
/*
 * Be the Cell: progress, attempts, cards and the level autosave (LEVELS §4.2, §4.4).
 *
 *   btc.progress.v1        {v:1, deviceSeed, created, playerTag: null, cards: {id: true}, prologueSeen,
 *                           lastLevel, levels: {id: {completed, results: [Result], current: CurrentRef|null}}}
 *   btc.level.autosave.v1  {engineVersion, build, levelId, attempt, variantSeed, phase, runs, answers, design,
 *                           monitor, snapshot, textIndex, …} (one level at a time)
 *
 * Attempt k of a level uses variant seed K.variantSeed(deviceSeed, id, k − 1);
 * the attempt number is 1 + the number of completed attempts, and abandoning
 * and resuming continues the same attempt. A think-aloud override (?v=) is
 * attempt 0 and does not count as completed. Every storage access is wrapped
 * in try/catch: the app works when storage throws, it just forgets.
 *
 * Two tabs share storage: every change re-reads the stored progress first (sync()), and the app
 * re-reads it when another tab writes it (the storage event), so neither tab writes an old copy
 * back over the other's codes and attempts.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./btc-level-kit.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.progress = factory(B.levelKit);
  }
})(typeof self !== 'undefined' ? self : this, function (K) {
  'use strict';

  const KEY = 'btc.progress.v1';
  const LEVEL_KEY = 'btc.level.autosave.v1';
  const MAX_LEVEL_CHARS = 2 * 1024 * 1024;

  function read(storage, key) {
    try {
      const s = storage && storage.getItem(key);
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  }
  function write(storage, key, value) {
    try {
      if (!storage) return false;
      const s = typeof value === 'string' ? value : JSON.stringify(value);
      storage.setItem(key, s);
      return true;
    } catch (e) { return false; }
  }
  function remove(storage, key) {
    try { if (storage) storage.removeItem(key); } catch (e) { /* ignored */ }
  }

  const valid = (x) => !!x && typeof x === 'object' && x.v === 1 && typeof x.deviceSeed === 'number' && !!x.levels && typeof x.levels === 'object';

  class Progress {
    /** o: {storage, today() → 'YYYY-MM-DD', randomU32() → uint32, deviceSeed? (fixed, e.g. ?test=1&seed=)} */
    constructor(o) {
      const opts = o || {};
      this.storage = opts.storage || null;
      this.today = opts.today || (() => '1970-01-01');
      this.randomU32 = opts.randomU32 || (() => 0);
      this.fixedSeed = opts.deviceSeed !== undefined && opts.deviceSeed !== null ? opts.deviceSeed >>> 0 : null;
      const saved = read(this.storage, KEY);
      this.data = valid(saved) ? saved : this.fresh();
      if (this.fixedSeed !== null) this.data.deviceSeed = this.fixedSeed;
      if (!saved) this.save();
    }

    /**
     * Re-reads the stored progress, so a second tab (or the installed app beside a browser tab)
     * never writes an old copy back over a newer one: every change starts from what is stored now.
     * A fixed device seed (?test=1&seed=) is kept. Returns true when the stored copy was adopted.
     */
    sync() {
      const saved = read(this.storage, KEY);
      if (!valid(saved)) return false;
      this.data = saved;
      if (this.fixedSeed !== null) this.data.deviceSeed = this.fixedSeed;
      return true;
    }

    fresh() {
      return { v: 1, deviceSeed: this.randomU32() >>> 0, created: this.today(), playerTag: null, cards: {}, prologueSeen: false, lastLevel: null, levels: {} };
    }

    save() { return write(this.storage, KEY, this.data); }

    get deviceSeed() { return this.data.deviceSeed; }

    entry(id) {
      const L = this.data.levels;
      if (!L[id]) L[id] = { completed: 0, results: [], current: null };
      return L[id];
    }

    /**
     * The attempt to play now: the open one, or the next new one. overrideSeed (a variant
     * seed from ?v=) gives attempt 0, marked override.
     */
    attemptFor(id, overrideSeed) {
      if (overrideSeed !== undefined && overrideSeed !== null) return { attempt: 0, variantSeed: overrideSeed >>> 0, override: true };
      this.sync();
      const e = this.entry(id);
      if (e.current) return Object.assign({}, e.current);
      return { attempt: e.completed + 1, variantSeed: K.variantSeed(this.data.deviceSeed, id, e.completed), override: false };
    }

    /** A new attempt (Play again): the next attempt number and its variant. */
    nextAttempt(id) {
      this.sync();
      const e = this.entry(id);
      return { attempt: e.completed + 1, variantSeed: K.variantSeed(this.data.deviceSeed, id, e.completed), override: false };
    }

    /** Marks an attempt as open (Continue on the home screen). */
    open(id, ref) {
      this.sync();
      this.entry(id).current = { attempt: ref.attempt, variantSeed: ref.variantSeed, override: !!ref.override };
      this.data.lastLevel = id;
      this.save();
    }

    /** Records a finished attempt; it is no longer open. */
    complete(id, result) {
      this.sync();
      const e = this.entry(id);
      e.results.push(result);
      if (!result.override) e.completed++;
      e.current = null;
      if (id === 'P') this.data.prologueSeen = true;
      this.save();
    }

    results(id) { return (this.data.levels[id] && this.data.levels[id].results) || []; }
    firstResult(id) { return this.results(id).find((r) => r.attempt === 1) || null; }
    latestResult(id) { const r = this.results(id); return r.length ? r[r.length - 1] : null; }
    isOpen(id) { return !!(this.data.levels[id] && this.data.levels[id].current); }

    /** The level to offer under "Continue", or null. */
    openLevel() {
      const id = this.data.lastLevel;
      return id && this.isOpen(id) ? id : null;
    }

    addCards(ids) {
      this.sync();
      let added = 0;
      for (const id of ids) if (!this.data.cards[id]) { this.data.cards[id] = true; added++; }
      if (added) this.save();
      return added;
    }
    cardIds() { return Object.keys(this.data.cards); }

    // --- the level autosave ---------------------------------------------------------
    saveLevel(obj) {
      let s;
      try { s = JSON.stringify(obj); } catch (e) { return false; }
      if (s.length > MAX_LEVEL_CHARS) return false;
      return write(this.storage, LEVEL_KEY, s);
    }
    /** {status: 'none'} | {status: 'mismatch'} (the save is discarded) | {status: 'ok', save}. */
    loadLevel(engineVersion) {
      const s = read(this.storage, LEVEL_KEY);
      if (!s || typeof s !== 'object' || !s.levelId) return { status: 'none' };
      if (s.engineVersion !== engineVersion) { this.clearLevel(); return { status: 'mismatch', levelId: s.levelId }; }
      return { status: 'ok', save: s };
    }
    clearLevel() { remove(this.storage, LEVEL_KEY); }

    /** Everything, for "Export my data". */
    export() { return JSON.parse(JSON.stringify(this.data)); }
  }

  function create(o) { return new Progress(o); }

  return { KEY, LEVEL_KEY, create, Progress };
});
