// Based on downlevel-dts (MIT licensed) by Nathan Shively-Sanders
// https://github.com/sandersn/downlevel-dts/blob/e7d1cb5aced5686826fe8aac4d4af2f745a9ef60/index.js

const { Project } = require('ts-morph');
const path = require('path');

const project = new Project();
const inputDir = project.addDirectoryAtPath(path.join(__dirname, '../dist/types/'));

// Down-level all *.d.ts files in input directory
const files = inputDir.addSourceFilesAtPaths('*.d.ts');
for (const file of files) {
  downlevelTS34(file);
}
project.saveSync();

/**
 * Down-level TypeScript 3.4 types in the given source file
 */
function downlevelTS34(f) {
  // Replace "es2018.asynciterable" with "esnext.asynciterable" in lib references
  const refs = f.getLibReferenceDirectives();
  for (const r of refs) {
    if (r.getFileName() === 'es2018.asynciterable') {
      f.replaceText([r.getPos(), r.getEnd()], 'esnext.asynciterable');
    }
  }
}
