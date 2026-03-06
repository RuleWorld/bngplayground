import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/public/**",
      "**/artifacts/**",
      "**/.gemini/**",
      "**/build/**",
      "**/test-results/**",
      "vite.config.ts.timestamp-*",
      "**/docs/**",
      "**/generated/**",
      "**/wasm-*/**",
      "**/*.min.js",
      "**/*.min.css",
      "**/coverage/**",
      "**/.cache/**",
      "**/test_*.mjs",
      "**/analyze_lint.cjs",
      "**/bionetgen/**",
      "**/libs/**",
      "**/vendor/**",
      "**/thirdparty/**",
      "**/cvode_loader.js",
      "**/cvode_loader.cjs",
      "**/igraph_loader.js",
      "**/nauty_loader.js"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        // Browser globals
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        console: "readonly",
        WebAssembly: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        fetch: "readonly",
        self: "readonly",
        performance: "readonly",
        Request: "readonly",
        Response: "readonly",
        Headers: "readonly",
        FileReader: "readonly",
        Blob: "readonly",
        File: "readonly",
        URL: "readonly",
        ImageData: "readonly",
        OffscreenCanvas: "readonly",
        Worker: "readonly",
        MessageChannel: "readonly",
        AbortController: "readonly",
        AbortSignal: "readonly",
        ReadableStream: "readonly",
        WritableStream: "readonly",
        TransformStream: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        WebSocket: "readonly",
        EventSource: "readonly",
        // Node globals (some files use them)
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        // Vitest globals
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      "react/react-in-jsx-scope": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
      "@typescript-eslint/no-unused-expressions": "warn",
      ...reactHooksPlugin.configs.recommended.rules,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        module: "readonly",
        require: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
      }
    }
  },
  {
    files: ["**/validation_models.ts"],
    rules: {
      "no-useless-escape": "off",
    },
  }
);
