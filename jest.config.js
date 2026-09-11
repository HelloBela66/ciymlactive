/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // Глушить console.info/console.debug (див. коментар у файлі) — прибирає шквал
  // `[db/migrations] ...` логів, що робив повний вивід `npm test` непридатним для копіювання.
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // `Claude outputs/` — тека в корені проєкту, яку сам десктоп-застосунок Claude (Cowork)
  // автоматично створює як плоску копію щойно створених (не редагованих) файлів під час
  // збереження на пристрій — не щось, що я сам явно пишу туди. Без цього запису Jest підбирав
  // її дублікати (`Claude outputs/PreReadingReflectionRepository.test.ts` тощо) як ОКРЕМІ
  // test suite поруч із реальними `src/...` — подвійні прогони й фантомні падіння. Явно
  // прописую і стандартний `/node_modules/`, а не лише свій патерн: `testPathIgnorePatterns`
  // ПЕРЕЗАПИСУЄ (а не доповнює) те, що дає `preset: 'jest-expo'`, — той самий підступ, що вже
  // траплявся з `transformIgnorePatterns` нижче.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/Claude outputs/'],
  // Раніше тут був власний `transformIgnorePatterns`, що ПЕРЕКРИВАВ (а не доповнював) той,
  // що дає `preset: 'jest-expo'` — власний regex не враховував нескоуп-пакети вигляду
  // `expo-modules-core`/`expo-router`/`expo-sqlite` тощо (лише буквально "expo" чи
  // "@expo-google-fonts/*"), тож Jest намагався парсити їхній ESM-код як CommonJS і падав на
  // `import` ("Cannot use import statement outside a module") — виявлено першим реальним
  // запуском у CI, преінсталу цього preset (jest-expo) достатньо самого по собі.
  collectCoverageFrom: ['src/domain/**/*.ts', 'src/lib/**/*.ts'],
};
