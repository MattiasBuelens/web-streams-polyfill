import globals from 'globals';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  stylistic.configs.customize({
    indent: 2,
    semi: true,
    arrowParens: false,
    commaDangle: 'never',
    quotes: 'single',
    quoteProps: 'consistent',
    blockSpacing: true,
    braceStyle: '1tbs'
  }),
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
        ReadableStream: false,
        WritableStream: false,
        TransformStream: false,
        ByteLengthQueuingStrategy: false,
        CountQueuingStrategy: false,
        AbortSignal: false,
        DEBUG: false,
        GCController: false,
        gc: false,
        globalThis: false
      },

      ecmaVersion: 2018,
      sourceType: 'module'
    },

    rules: {
      'no-self-compare': 'error',

      'prefer-const': ['error', {
        ignoreReadBeforeAssign: true
      }],

      '@stylistic/function-paren-newline': ['error', 'multiline'],

      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-redeclare': 'error',
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/no-useless-constructor': 'error'
    }
  }
);
