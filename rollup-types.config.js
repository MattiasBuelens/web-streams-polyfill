const { default: rollupDts } = require('rollup-plugin-dts');

module.exports = {
  input: 'src/polyfill.ts',
  output: {
    file: 'dist/types/polyfill.d.ts',
    format: 'es'
  },
  plugins: [
    rollupDts({
      tsconfig: 'src/tsconfig.json'
    })
  ]
};
