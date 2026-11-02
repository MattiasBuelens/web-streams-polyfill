import { defineConfig } from 'rolldown';

export default defineConfig({
  input: 'src/index.js',
  platform: 'node',
  output: {
    file: 'dist/app.js',
    format: 'cjs'
  }
});
