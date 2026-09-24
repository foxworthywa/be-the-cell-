// @deps btc-cell
/*
 * Be the Cell: replay (engine spec §11.2).
 *
 * A run is (config, seed, command log). Replaying rebuilds the cell from its
 * config and resubmits every logged command at the tick it was first
 * submitted, in seq order, so the pending queue, the seq numbers and every
 * random draw come out the same. Commands from config.schedule are skipped:
 * the config submits them itself.
 *
 *   run(record | {config, log}, toTick, {attach(cell)}?)  → Cell at toTick (throws ReplayError on a version or
 *                                        configHash mismatch); attach is called before the first step
 *   verify(record)                       → {ok, mismatchTick?, expected?, got?, finalHash}
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./btc-cell.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.replay = factory(B);
  }
})(typeof self !== 'undefined' ? self : this, function (CELL) {
  'use strict';

  class ReplayError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'ReplayError';
      this.code = code;
    }
  }

  const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);

  /**
   * The log entries replay must resubmit, in seq order: all but the config's own
   * schedule, which the constructor submits first (seq 0 … k−1, source 'schedule').
   */
  function entriesOf(log, nSchedule) {
    const out = [];
    for (let i = 0; i < log.length; i++) if (!(log[i].source === 'schedule' && log[i].seq < nSchedule)) out.push(log[i]);
    // Logs are written in seq order; a hand-edited one is put back in order without a comparator sort.
    for (let i = 1; i < out.length; i++) {
      const e = out[i];
      let j = i - 1;
      while (j >= 0 && out[j].seq > e.seq) { out[j + 1] = out[j]; j--; }
      out[j + 1] = e;
    }
    return out;
  }

  /**
   * Replays to toTick (default: the record's finalTick). opts.attach(cell) is called once,
   * before the first step. opts.onMismatch(tick, what) is called when a resubmitted command
   * gets a different seq or rejection than it did live; verify() uses it.
   */
  function run(record, toTick, opts) {
    if (!record || typeof record !== 'object' || !record.config) throw new ReplayError('bad-record', 'a run record needs a config and a log');
    const Cell = CELL.Cell;
    if (record.engineVersion !== undefined && record.engineVersion !== CELL.ENGINE_VERSION) {
      throw new ReplayError('engine-version', 'record is from engine ' + record.engineVersion + ', this is ' + CELL.ENGINE_VERSION);
    }
    const cell = new Cell(record.config);
    if (record.configHash !== undefined && record.configHash !== cell.configHash) {
      throw new ReplayError('config-hash', 'configHash mismatch: record ' + record.configHash + ', replay ' + cell.configHash);
    }
    // The preset is part of the config: a record made from another preset is a configHash mismatch.
    if (record.presetHash !== undefined && record.presetHash !== cell.presetHash) {
      throw new ReplayError('config-hash', 'configHash mismatch: record presetHash ' + record.presetHash + ', this engine\'s preset ' + cell.presetHash);
    }
    const end = toTick !== undefined ? toTick : record.finalTick !== undefined ? record.finalTick : 0;
    const onMismatch = opts && opts.onMismatch;
    // Observers (a level monitor, a Recorder) attach before the first step (LEVELS.md R-E18).
    if (opts && typeof opts.attach === 'function') opts.attach(cell);
    const entries = entriesOf(record.log || [], cell.config.schedule.length);
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const at = e.submitTick !== undefined ? e.submitTick : e.tick;
      if (at > end) break;
      cell.advanceTo(at);
      const cmd = Object.assign({ type: e.type }, e.args);
      const res = cell.submit(e.tick, cmd, e.source, false);
      if (onMismatch && res.seq !== e.seq) onMismatch(at, 'seq ' + e.seq + ' replayed as ' + res.seq);
      if (onMismatch && !res.ok && e.rejected !== res.error) onMismatch(at, 'seq ' + e.seq + ' rejected ' + res.error + ' on replay, live ' + (e.rejected || 'accepted'));
    }
    cell.advanceTo(end);
    return cell;
  }

  /**
   * Replays a run record and checks every checkpoint hash, every log entry's
   * outcome (a rejected command must reject again, with the same code) and the
   * final hash. Reports the earliest mismatch.
   */
  function verify(record) {
    let mismatch = null;
    const note = (tick, expected, got) => {
      if (mismatch === null || tick < mismatch.tick) mismatch = { tick, expected, got };
    };
    let cell;
    try {
      cell = run(record, record.finalTick, { onMismatch: (tick, what) => note(tick, 'the logged command', what) });
    } catch (err) {
      return { ok: false, mismatchTick: 0, expected: record && record.configHash, got: err.message, finalHash: null };
    }
    // Checkpoints: the replay takes them at the same ticks.
    const got = {};
    for (let i = 0; i < cell.checkpoints.length; i++) got[cell.checkpoints[i].tick] = cell.checkpoints[i].hash;
    const cps = record.checkpoints || [];
    for (let i = 0; i < cps.length; i++) {
      const c = cps[i];
      if (c.tick > record.finalTick) continue;
      if (got[c.tick] !== c.hash) note(c.tick, c.hash, got[c.tick] === undefined ? null : got[c.tick]);
    }
    // Log outcomes: same entries, same resolution or rejection.
    const live = record.log || [], replay = cell.log;
    const bySeq = {};
    for (let i = 0; i < replay.length; i++) bySeq[replay[i].seq] = replay[i];
    for (let i = 0; i < live.length; i++) {
      const a = live[i], b = bySeq[a.seq];
      if (!b) { note(a.tick, 'log entry ' + a.seq, null); continue; }
      if (a.type !== b.type || a.tick !== b.tick || a.source !== b.source || !same(a.args, b.args) ||
          (a.rejected || null) !== (b.rejected || null) || !same(a.resolved, b.resolved)) {
        note(a.tick, JSON.stringify(a), JSON.stringify(b));
      }
    }
    const finalHash = cell.hash();
    if (record.finalHash !== undefined && finalHash !== record.finalHash) note(record.finalTick, record.finalHash, finalHash);
    if (mismatch) return { ok: false, mismatchTick: mismatch.tick, expected: mismatch.expected, got: mismatch.got, finalHash };
    return { ok: true, finalHash };
  }

  return { run, verify, ReplayError };
});
