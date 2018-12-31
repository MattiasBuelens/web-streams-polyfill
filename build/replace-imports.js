const path = require('path');
const { createFilter } = require('rollup-pluginutils');

module.exports = function replaceImports(options = {}) {
  const filter = createFilter(options.include, options.exclude);
  const imports = options.imports;
  return {
    resolveId(importee, importer) {
      if (!importer || !filter(importer)) {
        return undefined;
      }
      let replace;
      const importeePath = path.resolve(path.dirname(importer), importee);
      for (const { from, to } of imports) {
        if (importeePath === from) {
          replace = to;
          break;
        }
      }
      return replace;
    }
  };
};
