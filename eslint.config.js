// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // supabase/functions/** — Deno runtime (Supabase Edge Functions), не Node/React Native;
    // metro.config.js і scripts/**/*.js — прості CommonJS Node-скрипти поза застосунком.
    // Жодне з цього не мало б перевірятись eslint-конфігом застосунку взагалі.
    ignores: ['dist/*', '.expo/*', 'supabase/functions/**', 'metro.config.js', 'scripts/**/*.js'],
  },
]);
