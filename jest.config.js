import { createRequire } from "module";

const require = createRequire(import.meta.url);

export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "jsdom",
  extensionsToTreatAsEsm: [".ts", ".tsx"],
  globals: {
    "ts-jest": {
      useESM: true,
      tsconfig: require.resolve("./tsconfig.json"),
    },
  },
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  passWithNoTests: true,
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  roots: ["<rootDir>"],
  testPathIgnorePatterns: ["/node_modules/", "/e2e/", "/api/", "/pages/", "/scripts/", "/server/"],
};
