const pkg = require('./package.json');
const rollupDts = require('rollup-plugin-dts');

const banner = `
/**
 * Type definitions for ${pkg.name} v${pkg.version}
 */
/// <reference lib="dom" />
/// <reference lib="esnext.asynciterable" />
`.trim() + '\n';

module.exports = {
  input: 'src/polyfill.ts',
  output: {
    file: 'dist/types/polyfill.d.ts',
    format: 'es',
    banner
  },
  plugins: [
    rollupDts.dts({
      tsconfig: 'src/tsconfig.json',
      banner: false
    })
  ]
};
