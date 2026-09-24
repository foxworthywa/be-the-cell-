// Fuzz run for test m2 (shared by fuzz-1.test.js and fuzz-2.test.js, which split
// the 200 sequences so the test runner can use two cores).
'use strict';
const H = require('./helpers.js');
const { BTC, HOUR, randomCommand } = H;
const R = BTC.prng;

/**
 * One random command sequence: a steady cell (seed = index + 1) run for 6 h with
 * 2–12 random commands at random ticks. Checks the invariants on every tick and
 * returns the first violation as a string, or null.
 */
function fuzzSequence(index, opts) {
  const s = R.seedStream(index, 'm2-fuzz');
  const o = opts || {};
  const c = new H.Cell({ seed: index + 1, start: 'steady', strain: o.strain, design: o.design });
  const ticks = o.ticks || 6 * HOUR;
  const nCommands = 2 + Math.floor(R.uniform(s) * 11);
  const at = [];
  for (let i = 0; i < nCommands; i++) at.push(Math.floor(R.uniform(s) * ticks));
  at.sort((a, b) => a - b);
  let next = 0;
  const bad = (msg) => `sequence ${index}, tick ${c.tick}: ${msg}`;
  for (let tick = 0; tick < ticks; tick++) {
    while (next < at.length && at[next] === tick) {
      const cmd = randomCommand(s);
      if (o.iptg && cmd.type === 'setMedium') cmd.iptg_mM = R.uniform(s) < 0.5 ? 0 : 1;
      c.command(cmd);
      next++;
    }
    const AA0 = c.AA, M0 = c.mass, gen0 = c.gen;
    c.step();
    if (!(c.E > 0 && c.E < 1)) return bad(`E = ${c.E}`);
    if (!(c.AA > 0)) return bad(`AA = ${c.AA}`);
    if (!(c.Lin >= 0)) return bad(`Lin = ${c.Lin}`);
    if (!(c.k.Rfree >= 0)) return bad(`R_free = ${c.k.Rfree}`);
    if (!(c.D === c.D && c.N === c.N && M0 === M0 && c.k.lambda === c.k.lambda)) return bad('NaN in odometers, mass or growth rate');
    for (const g of c.genes) {
      if (!(g.P >= 0)) return bad(`${g.id} protein ${g.P}`);
      if (g.mature.count < 0 || g.mature.count >= g.mature.cap) return bad(`${g.id} mRNA list ${g.mature.count}/${g.mature.cap}`);
      if (g.nascent.len < 0 || g.nascent.len >= g.nascent.cap) return bad(`${g.id} nascent ${g.nascent.len}/${g.nascent.cap}`);
      if (g.cohorts.len >= g.cohorts.cap) return bad(`${g.id} cohorts ${g.cohorts.len}/${g.cohorts.cap}`);
      if (!(g.cohorts.nSum >= -1e-6)) return bad(`${g.id} ribosomes ${g.cohorts.nSum}`);
    }
    for (const u of c.sectors) {
      if (!(u.m >= 0 && u.mass >= 0)) return bad(`sector ${u.id} m ${u.m}, mass ${u.mass}`);
      if (u.cohorts.len >= u.cohorts.cap) return bad(`sector ${u.id} cohorts ${u.cohorts.len}/${u.cohorts.cap}`);
      if (!(u.cohorts.nSum >= -1e-6)) return bad(`sector ${u.id} ribosomes ${u.cohorts.nSum}`);
    }
    if (c.gen === gen0) {
      const imbalance = (c.flux.aaMade + c.flux.aaImported) * c.dt - (c.AA - AA0) - (c.mass - M0);
      if (!(Math.abs(imbalance) <= 1e-9 * M0)) return bad(`amino-acid balance off by ${imbalance} aa`);
    }
  }
  return null;
}

module.exports = { fuzzSequence };
