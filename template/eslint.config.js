// ESLint 9 flat config converted from .eslintrc.json

const tsPlugin = require("@typescript-eslint/eslint-plugin");
const tsParser = require("@typescript-eslint/parser");
const autofixPlugin = require("eslint-plugin-autofix");
const importPlugin = require("eslint-plugin-import");
const noRelativeImportPathsPlugin = require("eslint-plugin-no-relative-import-paths");
const reactPlugin = require("eslint-plugin-react");
const reactNativePlugin = require("eslint-plugin-react-native");

/** @type {import("eslint").Linter.FlatConfig[]} */
module.exports = [
  // Ignore patterns
  {
    ignores: ["*.config.ts", "**/member.ts"],
  },

  // Main config for JS/TS/React Native source files
  {
    files: ["**/*.{js,mjs,cjs,jsx,ts,tsx}"],

    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
    },

    plugins: {
      "@typescript-eslint": tsPlugin,
      import: importPlugin,
      autofix: autofixPlugin,
      "no-relative-import-paths": noRelativeImportPathsPlugin,
      react: reactPlugin,
      "react-native": reactNativePlugin,
    },

    rules: {
      "linebreak-style": ["error", "unix"],
      "react-native/no-inline-styles": 1,
      quotes: ["error", "double"],
      semi: ["error", "always"],

      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          varsIgnorePattern: "^_",
          argsIgnorePattern: "^_",
          ignoreRestSiblings: true,
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/explicit-member-accessibility": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/array-type": "error",
      "@typescript-eslint/no-empty-function": 0,

      curly: "error",
      "no-useless-catch": "error",
      "max-statements-per-line": "error",
      "arrow-body-style": ["error", "as-needed"],

      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
        },
      ],

      "import/order": [
        "error",
        {
          groups: ["builtin", "external", "sibling", "parent", "index", "object", "type"],
          pathGroups: [
            {
              pattern: "~/**/**",
              group: "parent",
              position: "after",
            },
          ],
          alphabetize: { order: "asc" },
        },
      ],

      "@typescript-eslint/no-var-requires": "off",
      "import/no-relative-packages": "error",

      "autofix/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          ignoreRestSiblings: true,
          destructuredArrayIgnorePattern: "^_",
        },
      ],

      "no-restricted-imports": [
        "error",
        {
          patterns: ["../"],
        },
      ],

      "import/no-default-export": "error",

      "react/self-closing-comp": [
        "error",
        {
          component: true,
          html: true,
        },
      ],

      "no-relative-import-paths/no-relative-import-paths": [
        "error",
        {
          rootDir: "mobile/src",
          allowSameFolder: true,
          prefix: "~",
        },
      ],
    },
  },

  // Overrides for config files
  {
    files: ["**/*.config.js", "**/*.config.mjs", "**/*.config.ts"],
    rules: {
      "import/no-default-export": "off",
    },
  },
];
