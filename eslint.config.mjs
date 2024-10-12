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
      'no-cond-assign': ['error', 'except-parens'],
      'no-console': 'error',
      'no-constant-condition': 'error',
      'no-control-regex': 'error',
      'no-debugger': 'error',
      'no-dupe-args': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-empty': 'error',
      'no-empty-character-class': 'error',
      'no-ex-assign': 'error',
      'no-extra-boolean-cast': 'error',
      'no-extra-parens': 'off',
      'no-extra-semi': 'error',
      'no-func-assign': 'error',
      'no-inner-declarations': 'off',
      'no-invalid-regexp': 'error',
      'no-irregular-whitespace': 'error',
      'no-negated-in-lhs': 'error',
      'no-obj-calls': 'error',
      'no-regex-spaces': 'error',
      'no-sparse-arrays': 'error',
      'no-unexpected-multiline': 'error',
      'no-unreachable': 'error',
      'no-unsafe-finally': 'off',
      'use-isnan': 'error',
      'valid-jsdoc': 'off',
      'valid-typeof': 'error',
      'accessor-pairs': 'error',
      'array-callback-return': 'error',
      'block-scoped-var': 'off',
      'complexity': 'off',
      'consistent-return': 'error',
      'curly': ['error', 'all'],
      'default-case': 'off',
      'dot-location': ['error', 'property'],
      'dot-notation': 'error',
      'eqeqeq': 'error',
      'guard-for-in': 'off',
      'no-alert': 'error',
      'no-caller': 'error',
      'no-case-declarations': 'error',
      'no-div-regex': 'off',
      'no-else-return': 'error',
      'no-empty-function': 'off',
      'no-empty-pattern': 'error',
      'no-eq-null': 'error',
      'no-eval': 'error',
      'no-extend-native': 'error',
      'no-extra-bind': 'error',
      'no-extra-label': 'error',
      'no-fallthrough': 'error',
      'no-floating-decimal': 'error',
      'no-implicit-coercion': 'error',
      'no-implicit-globals': 'error',
      'no-implied-eval': 'off',
      'no-invalid-this': 'off',
      'no-iterator': 'error',

      'no-labels': ['error', {
        allowLoop: true
      }],

      'no-lone-blocks': 'error',
      'no-loop-func': 'off',
      'no-magic-numbers': 'off',
      'no-multi-spaces': 'error',
      'no-multi-str': 'error',
      'no-native-reassign': 'error',
      'no-new': 'off',
      'no-new-func': 'error',
      'no-new-wrappers': 'error',
      'no-octal': 'error',
      'no-octal-escape': 'error',
      'no-param-reassign': 'off',
      'no-process-env': 'error',
      'no-proto': 'error',
      'no-redeclare': 'off',
      'no-return-assign': ['error', 'except-parens'],
      'no-script-url': 'off',
      'no-self-assign': 'error',
      'no-self-compare': 'error',
      'no-sequences': 'error',
      'no-throw-literal': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-unused-expressions': 'error',
      'no-unused-labels': 'error',
      'no-useless-call': 'error',
      'no-useless-concat': 'error',
      'no-useless-escape': 'error',
      'no-void': 'error',
      'no-warning-comments': 'off',
      'no-with': 'error',
      'radix': ['error', 'as-needed'],
      'vars-on-top': 'off',
      'wrap-iife': ['error', 'outside'],
      'yoda': ['error', 'never'],
      'strict': ['error', 'global'],
      'init-declarations': 'off',
      'no-catch-shadow': 'error',
      'no-delete-var': 'error',
      'no-label-var': 'error',
      'no-restricted-globals': 'off',
      'no-shadow': 'off',
      'no-shadow-restricted-names': 'error',
      'no-undef': 'error',
      'no-undef-init': 'error',
      'no-undefined': 'off',
      'no-unused-vars': 'off',
      'no-use-before-define': 'off',
      'callback-return': 'off',
      'global-require': 'error',
      'handle-callback-err': 'error',
      'no-mixed-requires': ['error', true],
      'no-new-require': 'error',
      'no-path-concat': 'error',
      'no-process-exit': 'error',
      'no-restricted-imports': 'off',
      'no-restricted-modules': 'off',
      'no-sync': 'off',
      'array-bracket-spacing': ['error', 'never'],

      '@stylistic/brace-style': ['error', '1tbs', {
        allowSingleLine: true
      }],

      'camelcase': 'off',

      'comma-spacing': ['error', {
        before: false,
        after: true
      }],

      'comma-style': ['error', 'last'],
      'computed-property-spacing': ['error', 'never'],
      'consistent-this': 'off',
      'eol-last': 'error',
      'func-names': 'off',
      'func-style': 'off',
      'id-blacklist': 'off',
      'id-length': 'off',
      'id-match': 'off',
      'jsx-quotes': 'off',

      'key-spacing': ['error', {
        beforeColon: false,
        afterColon: true,
        mode: 'strict'
      }],

      'keyword-spacing': ['error', {
        before: true,
        after: true
      }],

      'linebreak-style': ['error', 'unix'],
      'lines-around-comment': 'off',
      'max-depth': 'off',

      'max-len': ['error', 120, {
        ignoreUrls: true
      }],

      'max-nested-callbacks': 'off',
      'max-params': 'off',
      'max-statements': 'off',

      'max-statements-per-line': ['error', {
        max: 1
      }],

      'new-cap': 'off',
      'new-parens': 'error',
      'newline-after-var': 'off',
      'newline-before-return': 'off',
      'newline-per-chained-call': 'off',
      'no-array-constructor': 'error',
      'no-bitwise': 'off',
      'no-continue': 'off',
      'no-inline-comments': 'off',
      'no-lonely-if': 'error',
      'no-mixed-spaces-and-tabs': 'error',
      'no-multiple-empty-lines': 'error',
      'no-negated-condition': 'off',
      'no-nested-ternary': 'error',
      'no-new-object': 'error',
      'no-plusplus': 'off',
      'no-restricted-syntax': 'off',
      'no-spaced-func': 'error',
      'no-ternary': 'off',
      'no-trailing-spaces': 'error',
      'no-underscore-dangle': 'off',
      'no-unneeded-ternary': 'error',
      'no-whitespace-before-property': 'error',
      'object-curly-spacing': ['error', 'always'],
      'object-property-newline': 'off',
      'one-var': ['error', 'never'],
      'one-var-declaration-per-line': ['error', 'initializations'],
      'operator-assignment': ['error', 'always'],
      '@stylistic/operator-linebreak': ['error', 'after'],
      'padded-blocks': ['error', 'never'],

      'require-jsdoc': 'off',
      'sort-imports': 'off',
      'sort-vars': 'off',
      'space-before-blocks': ['error', 'always'],

      'space-before-function-paren': ['error', {
        anonymous: 'always',
        named: 'never'
      }],

      'space-in-parens': ['error', 'never'],
      'space-infix-ops': 'error',

      'space-unary-ops': ['error', {
        words: true,
        nonwords: false
      }],

      'spaced-comment': ['error', 'always', {
        markers: ['/']
      }],

      'wrap-regex': 'off',
      'arrow-body-style': 'off',
      'arrow-spacing': 'error',
      'constructor-super': 'error',
      'generator-star-spacing': ['error', 'after'],
      'no-class-assign': 'error',
      'no-confusing-arrow': 'off',
      'no-const-assign': 'error',
      'no-dupe-class-members': 'off',
      'no-duplicate-imports': 'error',
      'no-new-symbol': 'error',
      'no-this-before-super': 'error',
      'no-useless-computed-key': 'error',
      'no-useless-constructor': 'off',
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-arrow-callback': 'error',

      'prefer-const': ['error', {
        ignoreReadBeforeAssign: true
      }],

      'prefer-reflect': 'off',
      'prefer-rest-params': 'error',
      'prefer-spread': 'error',
      'prefer-template': 'off',
      'require-yield': 'error',
      'template-curly-spacing': ['error', 'never'],
      'yield-star-spacing': ['error', 'after'],

      '@typescript-eslint/array-type': ['error', {
        default: 'array-simple'
      }],

      '@typescript-eslint/ban-types': 'off',
      '@typescript-eslint/camelcase': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-member-accessibility': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',

      '@stylistic/indent': ['error', 2, {
        SwitchCase: 1,

        FunctionDeclaration: {
          parameters: 'first'
        },

        FunctionExpression: {
          parameters: 'first'
        },

        CallExpression: {
          arguments: 'first'
        },

        ArrayExpression: 'first',
        ObjectExpression: 'first',
        ImportDeclaration: 'first'
      }],

      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-redeclare': 'error',
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/no-use-before-define': 'off',
      '@typescript-eslint/no-useless-constructor': 'error'
    }
  });
