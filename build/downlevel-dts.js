// Based on downlevel-dts (MIT licensed) by Nathan Shively-Sanders
// https://github.com/sandersn/downlevel-dts/blob/e7d1cb5aced5686826fe8aac4d4af2f745a9ef60/index.js

const { Project, ts } = require('ts-morph');
const path = require('path');

const project = new Project();
const inputDir = project.addDirectoryAtPath(path.join(__dirname, '../dist/types/'));

// Create output directory
const outputDir = inputDir.createDirectory('ts3.4');
project.saveSync();

// Down-level all *.d.ts files in input directory
const files = inputDir.addSourceFilesAtPaths('*.d.ts');
for (let f of files) {
  // Create copy for TypeScript 3.4
  f = f.copyToDirectory(outputDir, { overwrite: true });
  // Replace get/set accessors with (read-only) properties
  const gs = f.getDescendantsOfKind(ts.SyntaxKind.GetAccessor);
  for (const g of gs) {
    const s = g.getSetAccessor();
    g.replaceWithText(`${s ? '' : 'readonly '}${g.getName()}: ${g.getType().getText(g)};`);
    if (s) {
      s.remove();
    }
  }
  const ss = f.getDescendantsOfKind(ts.SyntaxKind.SetAccessor);
  for (const s of ss) {
    const g = s.getGetAccessor();
    if (!g) {
      s.replaceWithText(`${s.getName()}: ${s.getType().getText(g)};`);
    }
  }
}
project.saveSync();
