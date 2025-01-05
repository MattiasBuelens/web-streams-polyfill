import parentConfig from '../eslint.config.mjs';

export default [
  ...parentConfig,
  {
    rules: {
      '@typescript-eslint/no-var-requires': 'off'
    }
  }
];
