// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'supabase/functions/**'],
  },
  {
    // metro.config.js і scripts/**/*.js виконуються напряму в Node (CommonJS, не бандляться
    // Metro), тож потребують Node-глобалів, яких немає в базовому React Native/браузерному
    // оточенні eslint-config-expo.
    files: ['metro.config.js', 'scripts/**/*.js'],
    languageOptions: {
      globals: {
        __dirname: 'readonly',
        __filename: 'readonly',
        require: 'readonly',
        module: 'readonly',
        process: 'readonly',
      },
    },
  },
  {
    // Правило перейменоване у встановленій версії typescript-eslint
    // (no-var-requires -> no-require-imports) — стара назва з eslint-config-expo
    // призводить до "Definition for rule ... was not found", а не до реальної помилки коду.
    rules: {
      '@typescript-eslint/no-var-requires': 'off',
    },
  },
]);
