// @deps btc-math btc-score
/*
 * Be the Cell: completion codes (LEVELS §10).
 *
 *   BTC1-12-7K2Q9C-G1E100P75D12X1-F02-A1N2-R110C1-3F9A0B-4NQ8ZR1
 *   BTC1 - level - variant - scores - F flags - A attempt N runs - R engine C content - digest - check
 *
 * The check is the top 35 bits of hash64(utf8(prefix + '|' + SALT)) in
 * Crockford base32, where prefix is the code up to and including the digest.
 * It catches typos and casual edits; it is not a secret (§10.5). Decoding
 * uppercases, maps O to 0 and I, L to 1, removes spaces and accepts – or —.
 *
 * Also here, for the instructor tools (§10.4): a small CSV reader, the code
 * finder for a Canvas "Student analysis" export, the duplicate checks and the
 * decoded table (named Expert objectives and flags, the variant's values).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../engine/btc-math.js'), require('./btc-score.js'));
  } else {
    var B = root.BTC || (root.BTC = {});
    B.code = factory(B.math, B.score);
  }
})(typeof self !== 'undefined' ? self : this, function (M, S) {
  'use strict';

  const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const SALT = 'btc-phase-a-2026';
  const HEX = '0123456789ABCDEF';

  /** A non-negative integer (< 32^len) as len base32 characters, big-endian. */
  function b32(value, len) {
    let v = Math.floor(value), s = '';
    for (let i = 0; i < len; i++) { s = B32[v % 32] + s; v = Math.floor(v / 32); }
    return s;
  }
  /** The value of base32 characters, or -1 for a character outside the alphabet. */
  function unb32(str) {
    let v = 0;
    for (let i = 0; i < str.length; i++) {
      const d = B32.indexOf(str[i]);
      if (d < 0) return -1;
      v = v * 32 + d;
    }
    return v;
  }

  /** Typing slips a person makes when copying a code by eye. */
  function normalise(s) {
    return String(s).toUpperCase().replace(/[–—‒−]/g, '-').replace(/\s+/g, '')
      .replace(/O/g, '0').replace(/[IL]/g, '1');
  }

  /** The 30-bit variant seed as 6 base32 characters, and back (null when malformed). */
  function encodeSeed(seed) { return b32(seed >>> 0, 6); }
  function decodeSeed(str) {
    const s = normalise(str);
    if (!/^[0-9A-Z]{6}$/.test(s)) return null;
    const v = unb32(s);
    return v >= 0 && v < 0x40000000 ? v : null;
  }

  function checksum(prefix) {
    const hex = M.hash64(M.utf8(prefix + '|' + SALT));
    const hi = parseInt(hex.slice(0, 8), 16);           // 32 bits
    const nib = parseInt(hex[8], 16);                  // the next 4; its top 3 complete the 35
    return b32(hi * 8 + (nib >> 1), 7);
  }

  const pctField = (x) => (x === null || x === undefined ? 'NA' : String(Math.round(x)));

  /**
   * payload: {level: 'P0'|'11'|…, variantSeed, G: 0|1, E: 0–100|null, P: 0–100|null, D: [first, total],
   * X: 0–15, flags: 0–255, attempt: 0–999, runs: 1–99, engine: '1.1.0', content: 1–99, digest: 6 hex}
   */
  function encode(p) {
    const eng = String(p.engine).split('.').map(Number);
    if (eng.length !== 3 || eng.some((x) => !(x >= 0 && x < 32))) throw new Error('engine version must be major.minor.patch, each < 32');
    if (!/^[0-9A-Z]{2}$/.test(p.level)) throw new Error('level code must be two characters');
    const D = p.D || [0, 0];
    const prefix = [
      'BTC1', p.level, encodeSeed(p.variantSeed),
      'G' + (p.G ? 1 : 0) + 'E' + pctField(p.E) + 'P' + pctField(p.P) + 'D' + D[0] + D[1] + 'X' + HEX[p.X & 15],
      'F' + HEX[(p.flags >> 4) & 15] + HEX[p.flags & 15],
      'A' + p.attempt + 'N' + p.runs,
      'R' + eng.map((x) => B32[x]).join('') + 'C' + p.content,
      String(p.digest || '000000').toUpperCase(),
    ].join('-');
    return prefix + '-' + checksum(prefix);
  }

  const B32C = '[0-9A-HJKMNP-TV-Z]';
  const RE = new RegExp('^BTC1-([0-9A-Z]{2})-(' + B32C + '{6})-G([01])E(\\d{1,3}|NA)P(\\d{1,3}|NA)D(\\d)(\\d)X([0-9A-F])' +
    '-F([0-9A-F]{2})-A(\\d{1,3})N(\\d{1,2})-R(' + B32C + '{3})C(\\d{1,2})-([0-9A-F]{6})-(' + B32C + '{7})$');

  /** Decodes a code: {ok: true, …fields, total} or {ok: false, error, message}. */
  function decode(input) {
    const code = normalise(input);
    const m = RE.exec(code);
    if (!m) return { ok: false, error: 'format', message: 'not a Be the Cell code', code };
    const prefix = code.slice(0, code.lastIndexOf('-'));
    if (checksum(prefix) !== m[15]) return { ok: false, error: 'checksum', message: 'bad checksum (a typo, or an edited code)', code };
    const num = (s) => (s === 'NA' ? null : Number(s));
    const out = {
      ok: true, code, level: m[1], variantSeed: unb32(m[2]), variant: m[2],
      G: Number(m[3]), E: num(m[4]), P: num(m[5]), D: [Number(m[6]), Number(m[7])], X: parseInt(m[8], 16),
      flags: parseInt(m[9], 16), attempt: Number(m[10]), runs: Number(m[11]),
      engine: m[12].split('').map((c) => B32.indexOf(c)).join('.'), content: Number(m[13]), digest: m[14], check: m[15],
    };
    out.override = out.attempt === 0;
    if ((out.E !== null && out.E > 100) || (out.P !== null && out.P > 100) || out.D[0] > out.D[1] || out.runs < 1 || out.content < 1) {
      return { ok: false, error: 'range', message: 'a value is out of range', code };
    }
    out.total = out.E === null && out.P === null ? null
      : S.total({ G: out.G, E: out.E === null ? null : out.E / 100, P: out.P === null ? null : out.P / 100, D: out.D });
    return out;
  }

  // ---------------------------------------------------------------------------
  // Instructor side: CSV and duplicate checks
  // ---------------------------------------------------------------------------
  /** A small RFC 4180 CSV reader: rows of strings (quoted fields, "" escapes, CRLF). */
  function parseCSV(text) {
    const rows = [];
    let row = [], field = '', q = false;
    const s = String(text).replace(/^﻿/, '');
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) {
        if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && s[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  const FIND = /BTC1-[0-9A-Z]{2}-[0-9A-Z]{6}-G[0-9A-Z]+-F[0-9A-Z]{2}-A[0-9]+N[0-9]+-R[0-9A-Z]{3}C[0-9]+-[0-9A-Z]{6}-[0-9A-Z]{7}/;

  /** The first thing in free text that looks like a code (normalised), or null. */
  function findCode(text) {
    const m = FIND.exec(normalise(text));
    return m ? m[0] : null;
  }

  /**
   * Reads codes from a Canvas "Student analysis" CSV or a plain list (one per line):
   * [{student, code, row}]. The answer column is found by content; the name column by its header.
   */
  function readCodes(text) {
    const rows = parseCSV(text).filter((r) => r.some((c) => c.trim() !== ''));
    if (!rows.length) return [];
    const width = Math.max.apply(null, rows.map((r) => r.length));
    if (width === 1) return rows.map((r, i) => ({ student: '', code: findCode(r[0]), row: i + 1 })).filter((e) => e.code);
    const counts = new Array(width).fill(0);
    rows.forEach((r) => r.forEach((c, j) => { if (findCode(c)) counts[j]++; }));
    let col = 0;
    for (let j = 1; j < width; j++) if (counts[j] > counts[col]) col = j;
    const head = rows[0].map((h) => h.trim().toLowerCase());
    let nameCol = head.indexOf('name');
    if (nameCol < 0) nameCol = head.findIndex((h) => /student|name/.test(h));
    const out = [];
    rows.forEach((r, i) => {
      const code = findCode(r[col] || '');
      if (code) out.push({ student: nameCol >= 0 ? (r[nameCol] || '').trim() : '', code, row: i + 1 });
    });
    return out;
  }

  /**
   * Decodes entries and adds warnings: the same code from two students, the same
   * variant seed from two students (per level), an override attempt, a code from
   * another engine. opts: {engine: '1.1.0', levels: {code: {id, version}}}.
   */
  function analyse(entries, opts) {
    const o = opts || {};
    const rows = entries.map((e) => Object.assign({ student: e.student || '', input: e.code }, decode(e.code), { warnings: [] }));
    const byCode = {}, bySeed = {};
    for (const r of rows) {
      if (!r.ok) continue;
      if (o.levels) {
        const lv = o.levels[r.level];
        if (!lv) { r.ok = false; r.error = 'level'; r.message = 'unknown level ' + r.level; continue; }
        if (r.content > lv.version) { r.ok = false; r.error = 'content'; r.message = 'unknown content version ' + r.content; continue; }
      }
      (byCode[r.code] || (byCode[r.code] = [])).push(r);
      if (r.variantSeed !== 0) {
        const k = r.level + ':' + r.variantSeed;
        (bySeed[k] || (bySeed[k] = [])).push(r);
      }
      if (r.override) r.warnings.push('override attempt (think-aloud)');
      if (o.engine && r.engine !== o.engine) r.warnings.push('engine ' + r.engine + ' differs from this build (' + o.engine + ')');
    }
    const students = (list) => list.map((r) => r.student).filter((s, i, a) => a.indexOf(s) === i);
    for (const k of Object.keys(byCode)) {
      const list = byCode[k];
      if (students(list).length > 1) for (const r of list) r.warnings.push('same code as ' + students(list).filter((s) => s !== r.student).join(', '));
    }
    for (const k of Object.keys(bySeed)) {
      const list = bySeed[k];
      if (students(list).length > 1) for (const r of list) r.warnings.push('same variant as ' + students(list).filter((s) => s !== r.student).join(', '));
    }
    return rows;
  }

  /**
   * The instructor's table (§10.4): one plain row per entry, with the variant's values, the Expert
   * objectives and flags by name, and every warning. defs: the level definitions (BTC.levels.list);
   * opts.engine: this build's engine version. Pure: codes.html and tools/decode-codes.js share it.
   */
  function table(entries, defs, opts) {
    const byCode = {};
    for (const d of defs || []) byCode[d.code] = d;
    const levels = {};
    for (const c of Object.keys(byCode)) levels[c] = { id: byCode[c].id, version: byCode[c].version };
    const rows = analyse(entries, { engine: opts && opts.engine, levels });
    const flagIds = (d) => (d.flags || []).map((f) => (typeof f === 'string' ? f : f.id));
    return rows.map((r) => {
      const d = r.ok ? byCode[r.level] : null;
      const out = {
        student: r.student || '', code: r.code || r.input || '', valid: !!r.ok, reason: r.ok ? '' : (r.message || r.error || ''),
        level: d ? d.id : r.level || '', variant: r.variant || '', variantValues: '', G: '', E: '', P: '', D: '', X: '', expert: '', expertText: '',
        flags: '', attempt: '', runs: '', engine: r.engine || '', content: '', total: '', warnings: (r.warnings || []).join('; '),
      };
      if (!r.ok) return out;
      // The variant's values come from this build's level file: only a code of the same content version has them.
      if (d && r.content !== d.version) {
        out.warnings = [out.warnings, 'content v' + r.content + ': older than this build (v' + d.version + '); variant values not shown']
          .filter(Boolean).join('; ');
      } else if (d && d.scored && d.variantLabel) {
        try { out.variantValues = d.variantLabel(d.variant(r.variantSeed)); } catch (e) { out.variantValues = ''; }
      }
      const pct = (x) => (x === null ? 'NA' : String(x));
      Object.assign(out, {
        G: String(r.G), E: pct(r.E), P: pct(r.P), D: r.D[0] + ' of ' + r.D[1], X: String(r.X),
        attempt: r.override ? '0 (override)' : String(r.attempt), runs: String(r.runs), content: String(r.content),
        total: r.total === null ? 'not scored' : String(r.total),
      });
      if (d) {
        const ex = (d.text.task && d.text.task.expert) || [];
        const met = ex.map((t, k) => ((r.X >> k) & 1 ? k : -1)).filter((k) => k >= 0);
        out.expert = ex.length ? (met.length ? met.map((k) => k + 1).join(', ') : 'none') + ' of ' + ex.length : '';
        out.expertText = met.map((k) => (k + 1) + ': ' + ex[k]).join(' | ');
        out.flags = flagIds(d).filter((id, k) => (r.flags >> k) & 1).join(', ');
      }
      return out;
    });
  }

  const TABLE_COLUMNS = ['student', 'level', 'variant', 'variantValues', 'G', 'E', 'P', 'D', 'X', 'expert', 'expertText', 'flags', 'attempt', 'runs',
    'engine', 'content', 'total', 'valid', 'reason', 'warnings', 'code'];

  /** The table as CSV (RFC 4180 quoting), with a header row. */
  function toCSV(rows, columns) {
    const cols = columns || TABLE_COLUMNS;
    const q = (v) => { const t = v === undefined || v === null ? '' : String(v); return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    return [cols.join(',')].concat(rows.map((r) => cols.map((c) => q(c === 'valid' ? (r.valid ? 'yes' : 'no') : r[c])).join(','))).join('\r\n') + '\r\n';
  }

  return { B32, SALT, b32, unb32, normalise, encodeSeed, decodeSeed, checksum, encode, decode, parseCSV, findCode, readCodes, analyse, table, toCSV, TABLE_COLUMNS };
});
