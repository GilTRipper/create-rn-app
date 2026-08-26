const tsPlugin = require("@typescript-eslint/eslint-plugin");
const tsParser = require("@typescript-eslint/parser");
const prettierConfig = require("eslint-config-prettier");
const importPlugin = require("eslint-plugin-import");
const noRelativeImportPathsPlugin = require("eslint-plugin-no-relative-import-paths");
const reactPlugin = require("eslint-plugin-react");
const reactHooksPlugin = require("eslint-plugin-react-hooks");
const reactNativePlugin = require("eslint-plugin-react-native");
const reactNativeCommunityPlugin = require("@react-native/eslint-plugin");

/** @type {import("eslint").Linter.Config[]} */
module.exports = [
  {
    ignores: ["*.config.ts", "**/member.ts", "android/**", "ios/**", "__tests__/**/*.js"],
  },

  prettierConfig,

  {
    files: ["**/*.{js,mjs,cjs,jsx,ts,tsx}"],

    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },

    settings: {
      react: {
        version: "detect",
      },
    },

    plugins: {
      "@typescript-eslint": tsPlugin,
      "@react-native": reactNativeCommunityPlugin,
      import: importPlugin,
      "no-relative-import-paths": noRelativeImportPathsPlugin,
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
      "react-native": reactNativePlugin,
    },

    rules: {
      "react-native/no-inline-styles": "warn",
      "@react-native/no-deep-imports": "warn",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

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
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
        },
      ],

      curly: "error",
      "no-useless-catch": "error",
      "max-statements-per-line": "error",
      "arrow-body-style": ["error", "as-needed"],

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
        },
      ],
      "import/no-relative-packages": "error",
      "import/no-default-export": "error",

      "no-restricted-imports": [
        "error",
        {
          patterns: ["../"],
        },
      ],

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
          rootDir: "src",
          allowSameFolder: true,
          prefix: "~",
        },
      ],
    },
  },

  {
    files: ["**/*.{spec,test}.{ts,tsx}", "**/__tests__/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": "off",
      "no-relative-import-paths/no-relative-import-paths": "off",
    },
  },

  {
    files: ["**/*.config.js", "**/*.config.mjs", "**/*.config.ts"],
    rules: {
      "import/no-default-export": "off",
    },
  },
];
