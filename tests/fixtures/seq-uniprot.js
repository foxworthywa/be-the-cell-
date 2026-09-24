// UniProt P01308 (INS_HUMAN, SV=1), preproinsulin, 110 amino acids, for tests/seq.test.js only.
// Matched against a published copy of the UniProt FASTA (plotly/datasets
// Dash_Bio/Genetic/sequence_viewer_P01308.fasta); tools/verify-seq.js re-checks it at UniProt
// directly where the network allows. It is kept out of src/ so the app never ships a
// sequence that the model did not compute.
'use strict';
module.exports = {
  P01308: 'MALWMRLLPLLALLALWGPDPAAAFVNQHLCGSHLVEALYLVCGERGFFYTPKTRREAED' +
    'LQVGQVELGGGPGAGSLQPLALEGSLQKRGIVEQCCTSICSLYQLENYCN',
};
