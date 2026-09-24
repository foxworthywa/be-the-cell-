// m2 (part 2 of 2): 100 random command sequences × 6 h. Every tick: counts ≥ 0,
// E in (0, 1), AA > 0, Lin ≥ 0, free ribosomes ≥ 0, no NaN, queues below
// capacity, and amino acids conserved (m1).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fuzzSequence } = require('./fuzz.js');

test('m2: under any sequence of commands the cell stays physical: no negative counts, energy charge inside (0, 1), mass conserved (sequences 100–199)', () => {
  for (let i = 100; i < 200; i++) {
    const problem = fuzzSequence(i);
    assert.equal(problem, null, problem);
  }
});
