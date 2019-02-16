const pkg = require('./package.json');
const rollupDts = require('rollup-plugin-dts');

const banner = `
/**
 * Type definitions for ${pkg.name} v${pkg.version}
 */`.trim();

module.exports = {
  input: 'src/polyfill.ts',
  output: {
    file: 'dist/types/polyfill.d.ts',
    format: 'es',
    banner
  },
  plugins: [
    rollupDts.dts({
      tsconfig: 'src/tsconfig.json'
    })
  ]
};
