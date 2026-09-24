// @deps
/*
 * Be the Cell: the misconception registry (LEVELS §6.3).
 *
 * Every wrong option of a level question names one of these ids (`mc`), and
 * every behaviour flag a level raises points back to one. The text is for the
 * instructor's decoder and the run file, not for students.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    var B = root.BTC || (root.BTC = {});
    B.misconceptions = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LIST = [
    ['DNA_DIRECT', 'DNA acts directly or "makes" the trait', ['P', '1.1']],
    ['ENERGY_FIRST', 'Food is energy by itself; ATP comes before the machines', ['1.1']],
    ['PROTEIN_AS_FOOD', 'Proteins are food', ['1.1']],
    ['PROTEIN_AS_MATERIAL', 'Proteins are material, not machines', ['1.1']],
    ['PROTEIN_LOCATION', 'A protein works wherever it is', ['1.1']],
    ['MIDDLEMAN', 'mRNA is a pointless middleman', ['1.2']],
    ['PROTEIN_SELF_COPY', 'Proteins copy themselves', ['1.2']],
    ['DELAY_MISATTRIBUTED', 'The switch itself is slow', ['1.2']],
    ['MOLECULES_LAST', 'Once made, molecules last', ['1.4']],
    ['INSTANT', 'Changes happen at once', ['1.2', '1.4']],
    ['CELL_DECIDES', 'The cell "decides"; someone is in charge', ['1.1', '1.2', '1.4', '1.7']],
    ['COMMANDER', 'The player runs the cell during the run', ['1.7']],
    ['RIBOSOME_DECIDES', 'Ribosomes choose what to read', ['1.7']],
    ['REPRESSOR_AS_ACTIVATOR', 'A repressor is needed to switch genes on', ['1.7']],
    ['OPERATOR_IRRELEVANT', 'The operator does nothing by itself', ['1.7']],
    ['OTHER', 'Wrong, with no mapped misconception', ['all']],
  ];

  const byId = {};
  for (const [id, text, levels] of LIST) byId[id] = Object.freeze({ id, text, levels: Object.freeze(levels.slice()) });
  const ids = Object.freeze(LIST.map((x) => x[0]));

  return Object.freeze({
    ids,
    byId: Object.freeze(byId),
    has: (id) => Object.prototype.hasOwnProperty.call(byId, id),
    text: (id) => (byId[id] ? byId[id].text : ''),
  });
});
