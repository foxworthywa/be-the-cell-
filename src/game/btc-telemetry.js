// @deps
/*
 * Be the Cell: local telemetry (LEVELS §11).
 *
 * Events stay on the device, in localStorage (btc.telemetry.v1), a ring
 * buffer of at most 5,000 events and about 512 KB. They leave the device only
 * in a file the student chooses to send (a level run file, or "Export my
 * data"). No names, no free text, no absolute timestamps: t is integer ms
 * since the session started (performance.now), and the only date is the
 * session_start date. Every failure is ignored; telemetry never breaks play.
 *
 *   const tel = BTC.telemetry.create({storage, now, session})
 *   tel.setContext({lv, att, run}); tel.setTick(() => tick | null)
 *   tel.log(type, data) → the event (or null)      tel.flush()
 *   tel.forAttempt(lv, att) → events               tel.all()
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    var B = root.BTC || (root.BTC = {});
    B.telemetry = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const KEY = 'btc.telemetry.v1';
  const MAX_EVENTS = 5000;
  const MAX_CHARS = 512 * 1024;
  const FLUSH_MS = 2000;

  // Event schema (§11.2): required and optional keys of d per type.
  const SCHEMA = Object.freeze({
    session_start: { req: ['date', 'build', 'engine', 'layout', 'w', 'h', 'standalone', 'touch', 'reducedMotion'] },
    screen: { req: ['name'], values: { name: ['home', 'lab', 'level', 'codes', 'cards'] } },
    level_start: { req: ['variantSeed', 'content', 'variant'], opt: ['attempt', 'override', 'resumed'] },
    phase: { req: ['name'] },
    story: { req: ['beat', 'line', 'action'], values: { action: ['next', 'skip'] } },
    predict: { req: ['id', 'kind'], opt: ['value', 'correct', 'points', 'features', 'A', 'P', 'skipped'] },
    design: { req: ['part', 'from', 'to'] },
    design_submit: { req: ['design'] },
    demo_end: { req: ['ppm', 'final'] },
    run_start: { req: ['speed'] },
    run_end: { req: ['reason', 'ticks'], values: { reason: ['goal', 'limit', 'deadline', 'done', 'retry', 'leave'] } },
    cmd: { req: ['seq', 'type', 'args', 'ok'], opt: ['code'] },
    speed: { req: ['s'] },
    pause: { req: [] },
    resume: { req: [] },
    tab: { req: ['name'] },
    focus: { req: ['gene'] },
    reveal: { req: ['gene', 'letter'] },
    goal: { req: [] },
    flag: { req: ['id', 'evidence'] },
    debrief: { req: ['id', 'option', 'correct', 'try'] },
    echo: { req: ['screen'] },
    card: { req: ['id'] },
    score: { req: ['G', 'E', 'P', 'D', 'X', 'total'] },
    code: { req: ['code', 'action'], values: { action: ['shown', 'copied', 'shared', 'copy-failed'] } },
    download: { req: ['kind'], values: { kind: ['run', 'export'] } },
    error: { req: ['msg'] },
    // The teaching-first redesign (docs/PROLOGUE.md §9).
    guess: { req: ['id', 'option', 'cause', 'step'] },
    activity: { req: ['id', 'i', 'value', 'expected', 'match'] },
    step: { req: ['id', 'action'], opt: ['gate', 'tick'], values: { action: ['shown', 'gate', 'done'] } },
    zoom: { req: ['from', 'to', 'via'], values: { via: ['segment', 'pinch', 'chip', 'key', 'guide', 'level'] } },
    rung: { req: ['id', 'action', 'via'], values: { action: ['closer', 'back', 'jump', 'ring'], via: ['button', 'pinch', 'tap', 'key'] } },
    watch_mrna: { req: ['id', 'made', 'lifetime_s'] },
    introduce: { req: ['readout'] },
    ui_mode: { req: ['mode'], values: { mode: ['simple', 'all'] } },
    about: { req: ['row'] },
  });
  // Keys that could carry a person's identity are never allowed, at any depth.
  const FORBIDDEN_KEY = /^(e-?mail|user|user-?name|username|student|student-?name|full-?name|first-?name|last-?name|phone)$/i;

  /** Problems with one event ([] when it fits the schema). */
  function check(ev) {
    const out = [];
    if (!ev || ev.v !== 1) out.push('v must be 1');
    const sch = ev && SCHEMA[ev.type];
    if (!sch) { out.push('unknown type ' + (ev && ev.type)); return out; }
    for (const k of ['seq', 't']) if (typeof ev[k] !== 'number' || Math.floor(ev[k]) !== ev[k]) out.push(k + ' must be an integer');
    if (typeof ev.s !== 'string') out.push('s must be the session id');
    const d = ev.d || {};
    for (const k of sch.req) if (!(k in d)) out.push(ev.type + ': missing ' + k);
    for (const k of Object.keys(d)) {
      if (sch.req.indexOf(k) < 0 && (!sch.opt || sch.opt.indexOf(k) < 0)) out.push(ev.type + ': unexpected ' + k);
    }
    if (sch.values) for (const k of Object.keys(sch.values)) if (k in d && sch.values[k].indexOf(d[k]) < 0) out.push(ev.type + ': ' + k + ' = ' + d[k]);
    (function walk(x, path) {
      if (x && typeof x === 'object') {
        for (const k of Object.keys(x)) {
          if (FORBIDDEN_KEY.test(k)) out.push('forbidden key ' + path + k);
          walk(x[k], path + k + '.');
        }
      }
    })(ev, '');
    return out;
  }

  function hex8(u) { const s = (u >>> 0).toString(16); return '00000000'.slice(s.length) + s; }

  class Telemetry {
    /**
     * o: {storage (localStorage-like or null), now() (ms), session (8 hex), maxEvents?, maxChars?}
     */
    constructor(o) {
      const opts = o || {};
      this.storage = opts.storage || null;
      this.now = opts.now || (() => 0);
      this.s = opts.session || '00000000';
      this.t0 = this.now();
      this.maxEvents = opts.maxEvents || MAX_EVENTS;
      this.maxChars = opts.maxChars || MAX_CHARS;
      this.ctx = { lv: null, att: null, run: null };
      this.tickFn = null;
      this.events = [];
      this.sizes = [];
      this.chars = 0;
      this.dirty = false;
      this.lastFlush = -Infinity;
      this.load();
      this.seq = this.events.length ? this.events[this.events.length - 1].seq + 1 : 0;
    }

    load() {
      try {
        const raw = this.storage && this.storage.getItem(KEY);
        const obj = raw ? JSON.parse(raw) : null;
        if (obj && obj.v === 1 && Array.isArray(obj.events)) {
          for (const e of obj.events) this.push(e);
        }
      } catch (e) { this.events = []; this.sizes = []; this.chars = 0; }
    }

    push(ev) {
      const n = JSON.stringify(ev).length + 1;
      this.events.push(ev); this.sizes.push(n); this.chars += n;
      while (this.events.length > this.maxEvents || (this.chars > this.maxChars && this.events.length > 1)) this.dropOldest(1);
    }

    dropOldest(k) {
      for (let i = 0; i < k && this.events.length; i++) { this.events.shift(); this.chars -= this.sizes.shift(); }
    }

    setContext(c) { this.ctx = { lv: c && c.lv !== undefined ? c.lv : null, att: c && c.att !== undefined ? c.att : null, run: c && c.run !== undefined ? c.run : null }; }
    setTick(fn) { this.tickFn = fn || null; }

    /** Records one event; returns it, or null if it could not be made. */
    log(type, data, extra) {
      try {
        let tick = null;
        if (extra && extra.tick !== undefined) tick = extra.tick;
        else if (this.tickFn) { const t = this.tickFn(); tick = typeof t === 'number' ? t : null; }
        const ev = {
          v: 1, seq: this.seq++, s: this.s, t: Math.max(0, Math.round(this.now() - this.t0)),
          lv: this.ctx.lv, att: this.ctx.att, run: this.ctx.run, tick, type,
          d: data ? JSON.parse(JSON.stringify(data)) : {},
        };
        this.push(ev);
        this.dirty = true;
        if (this.now() - this.lastFlush >= FLUSH_MS) this.flush();
        return ev;
      } catch (e) { return null; }
    }

    /**
     * Another tab's events (other session ids) that were stored since this tab loaded are taken in before
     * writing, so two open tabs do not erase each other's log. Events keep their own session and seq.
     */
    mergeStored() {
      let obj = null;
      try { const raw = this.storage.getItem(KEY); obj = raw ? JSON.parse(raw) : null; } catch (e) { return; }
      if (!obj || obj.v !== 1 || !Array.isArray(obj.events)) return;
      const have = {};
      for (const e of this.events) have[e.s + ':' + e.seq] = true;
      const foreign = obj.events.filter((e) => e && e.s !== this.s && !have[e.s + ':' + e.seq]);
      if (!foreign.length) return;
      const mine = this.events;
      this.events = []; this.sizes = []; this.chars = 0;
      for (const e of foreign.concat(mine)) this.push(e);
    }

    /** Writes the buffer; on a quota error drops the oldest half and tries once more. */
    flush() {
      this.lastFlush = this.now();
      if (!this.storage || !this.dirty) return true;
      this.mergeStored();
      const write = () => this.storage.setItem(KEY, JSON.stringify({ v: 1, events: this.events }));
      try { write(); this.dirty = false; return true; } catch (e) {
        this.dropOldest(Math.ceil(this.events.length / 2));
        try { write(); this.dirty = false; return true; } catch (e2) { return false; }
      }
    }

    all() { return this.events.slice(); }
    forAttempt(lv, att) { return this.events.filter((e) => e.lv === lv && e.att === att); }
    clear() {
      this.events = []; this.sizes = []; this.chars = 0; this.dirty = false;
      try { if (this.storage) this.storage.setItem(KEY, JSON.stringify({ v: 1, events: [] })); } catch (e) { /* storage blocked */ }
    }
  }

  function create(o) { return new Telemetry(o); }

  /** A new session id: 8 hex from crypto.getRandomValues (or a fixed id where there is none). */
  function sessionId(cryptoObj) {
    try {
      const a = new Uint32Array(1);
      cryptoObj.getRandomValues(a);
      return hex8(a[0]);
    } catch (e) { return '00000000'; }
  }

  return { KEY, MAX_EVENTS, MAX_CHARS, SCHEMA, FORBIDDEN_KEY, check, create, sessionId, Telemetry };
});
