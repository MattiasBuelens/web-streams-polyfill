import parentConfig from '../eslint.config.mjs';
import globals from 'globals';

export default [
  ...parentConfig,
  {
    languageOptions: {
      globals: {
        ...globals.jasmine
      }
    }
  }
];
