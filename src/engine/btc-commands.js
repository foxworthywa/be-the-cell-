// @deps
/*
 * Be the Cell: commands (engine spec §11.3).
 *
 * A command is pure data, e.g. {type:'setPromoter', gene:'fliC', level:4}. It
 * is validated when submitted and again when applied (the controls may have
 * changed in between), and every submission is logged, rejected or not, so a
 * run can be replayed from (config, seed, log).
 *
 * This file only decides and describes; the cell owns the queue and the log.
 *   validate(cell, type, args, source)   → {ok:true} | {ok:false, code, message}
 *   control(cell, type, args)            → the control's value in resolved form (for prev and resolved)
 *   apply(cell, type, args)              → changes control inputs, medium or drugs
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    var B = root.BTC || (root.BTC = {});
    B.commands = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TYPES = Object.freeze(['setPromoter', 'setRBS', 'setKnockout', 'setMedium', 'setDrug', 'setMRNAHalfLife', 'setDegradation']);
  const CODES = Object.freeze(['unknown-type', 'unknown-gene', 'bad-value', 'locked', 'not-available', 'tick-in-past']);
  const SOURCES = Object.freeze(['user', 'schedule', 'lesson']);
  const GENE_COMMANDS = Object.freeze({ setPromoter: true, setRBS: true, setKnockout: true, setMRNAHalfLife: true, setDegradation: true });
  const MEDIUM_FIELDS = Object.freeze(['glucose_mM', 'lactose_mM', 'aminoAcids_mM']);
  const LEVELS = Object.freeze([0, 0.25, 0.5, 1, 2, 4]);   // 0 is the dial's "off" (the 1/1,000 leak)

  const isNum = (x) => typeof x === 'number' && x === x && x !== Infinity && x !== -Infinity;
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  /** Dial value of a level ('off' → 0), or −1 if it is not on the dial. */
  function levelValue(level) {
    if (level === 'off') return 0;
    if (typeof level !== 'number') return -1;
    for (let i = 0; i < LEVELS.length; i++) if (LEVELS[i] === level) return level + 0;
    return -1;
  }

  /** The dial as the log and view show it: 'off' or the multiplier; null while a per-second rate override is set. */
  function levelName(g) {
    if (g.rateOverride === g.rateOverride) return null;
    return g.level > 0 ? g.level : 'off';
  }

  /** A gene is switched on when its dial (or rate override) is above off and it is not knocked out. */
  function isOn(g) {
    if (g.knockout) return false;
    return g.rateOverride === g.rateOverride ? g.rateOverride > 0 : g.level > 0;
  }

  /**
   * The arguments of a command: every field except type and source, copied, with
   * numbers canonicalised as x + 0 so −0 never enters the log or the pending queue.
   */
  function canonicalArgs(cmd) {
    const args = {};
    if (!cmd || typeof cmd !== 'object') return args;
    const keys = Object.keys(cmd);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key === 'type' || key === 'source') continue;
      const v = cmd[key];
      if (typeof v === 'number') args[key] = v + 0;
      else if (v !== null && typeof v === 'object') args[key] = JSON.parse(JSON.stringify(v));
      else if (v !== undefined && typeof v !== 'function') args[key] = v;
    }
    return args;
  }

  const bad = (code, message) => ({ ok: false, code, message });
  const OK = Object.freeze({ ok: true });

  /** Checks a command against the cell as it is now. Codes are those of spec §11.3. */
  function validate(cell, type, args, source) {
    if (SOURCES.indexOf(source) < 0) return bad('bad-value', 'source must be user, schedule or lesson');
    if (typeof type !== 'string' || TYPES.indexOf(type) < 0) return bad('unknown-type', 'unknown command ' + type);
    if (GENE_COMMANDS[type] && !(typeof args.gene === 'string' && has(cell.geneById, args.gene))) {
      return bad('unknown-gene', 'no gene ' + args.gene);
    }
    // A level can lock the student's controls and still run its own program.
    const locked = cell.controls === 'locked' && source === 'user';
    switch (type) {
      case 'setPromoter':
        if (locked) return bad('locked', 'the controls are locked');
        if (args.rate_perS !== undefined) {
          if (args.level !== undefined) return bad('bad-value', 'give level or rate_perS, not both');
          if (!isNum(args.rate_perS) || args.rate_perS < 0 || args.rate_perS > cell.p.rateCap) return bad('bad-value', 'rate_perS must be in [0, ' + cell.p.rateCap + ']');
        } else if (levelValue(args.level) < 0) return bad('bad-value', 'level must be off, 0, 0.25, 0.5, 1, 2 or 4');
        return OK;
      case 'setRBS':
        if (locked) return bad('locked', 'the controls are locked');
        if (!isNum(args.rbs) || !(args.rbs > 0) || args.rbs > 16) return bad('bad-value', 'rbs must be in (0, 16]');
        return OK;
      case 'setKnockout':
        if (typeof args.knockout !== 'boolean') return bad('bad-value', 'knockout must be true or false');
        return OK;
      case 'setMedium': {
        if (args.oxygen !== undefined) return bad('not-available', 'oxygen is not available in M1');
        let any = false;
        const keys = Object.keys(args);
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          if (MEDIUM_FIELDS.indexOf(key) < 0) return bad('bad-value', 'unknown medium field ' + key);
          if (!isNum(args[key]) || args[key] < 0) return bad('bad-value', key + ' must be ≥ 0');
          any = true;
        }
        return any ? OK : bad('bad-value', 'setMedium needs at least one field');
      }
      case 'setDrug':
        if (args.drug !== 'rifampicin' && args.drug !== 'chloramphenicol') return bad('bad-value', 'drug must be rifampicin or chloramphenicol');
        if (!isNum(args.dose) || args.dose < 0 || args.dose > 1) return bad('bad-value', 'dose must be in [0, 1]');
        return OK;
      case 'setMRNAHalfLife':
        if (!isNum(args.s) || args.s < 30 || args.s > 1800) return bad('bad-value', 'half-life must be 30–1800 s');
        return OK;
      case 'setDegradation':
        if (!isNum(args.perS) || args.perS < 0 || args.perS > 0.01) return bad('bad-value', 'perS must be in [0, 0.01]');
        return OK;
    }
    return bad('unknown-type', 'unknown command ' + type);
  }

  /**
   * The value of the control a command touches, in the log's resolved form
   * (spec §11.4). Called before a command (prev) and after it (resolved).
   */
  function control(cell, type, args) {
    const g = GENE_COMMANDS[type] ? cell.geneById[args.gene] : null;
    switch (type) {
      case 'setPromoter': return { level: levelName(g), rate_perS: g.rate };
      case 'setRBS': return { rbs: g.rbs };
      case 'setKnockout': return { knockout: g.knockout };
      case 'setMedium': return { glucose_mM: cell.env.glucose_mM, lactose_mM: cell.env.lactose_mM, aminoAcids_mM: cell.env.aminoAcids_mM };
      case 'setDrug': return { drug: args.drug, dose: args.drug === 'rifampicin' ? cell.rifDose : cell.cmDose };
      case 'setMRNAHalfLife': return { s: g.halfLife };
      case 'setDegradation': return { perS: g.kdeg };
    }
    return null;
  }

  /** Applies a validated command. Changes only control inputs, medium and drugs (§7.1). */
  function apply(cell, type, args) {
    const g = GENE_COMMANDS[type] ? cell.geneById[args.gene] : null;
    switch (type) {
      case 'setPromoter':
        if (args.rate_perS !== undefined) g.rateOverride = args.rate_perS;
        else { g.level = levelValue(args.level); g.rateOverride = NaN; }
        break;
      case 'setRBS': g.rbs = args.rbs; break;
      case 'setKnockout': g.knockout = args.knockout; break;
      case 'setMedium':
        if (args.glucose_mM !== undefined) cell.env.glucose_mM = args.glucose_mM;
        if (args.lactose_mM !== undefined) cell.env.lactose_mM = args.lactose_mM;
        if (args.aminoAcids_mM !== undefined) cell.env.aminoAcids_mM = args.aminoAcids_mM;
        break;
      case 'setDrug':
        if (args.drug === 'rifampicin') cell.rifDose = args.dose; else cell.cmDose = args.dose;
        break;
      case 'setMRNAHalfLife': g.halfLife = args.s; break;
      case 'setDegradation': g.kdeg = args.perS; break;
    }
    cell.refreshDerived();
  }

  return {
    TYPES, CODES, SOURCES, GENE_COMMANDS, MEDIUM_FIELDS, LEVELS,
    levelValue, levelName, isOn, canonicalArgs, validate, control, apply,
  };
});
