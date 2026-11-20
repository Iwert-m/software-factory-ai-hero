// Mechanical rules from CODING_STANDARDS.md. Formatting belongs to Prettier;
// eslint-config-prettier switches off every rule that would fight it.
import js from "@eslint/js";
import vitest from "@vitest/eslint-plugin";
import prettier from "eslint-config-prettier";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import sonarjs from "eslint-plugin-sonarjs";
import globals from "globals";
import tseslint from "typescript-eslint";

const RESTRICTED_SYNTAX = [
  {
    selector: "TSAsExpression > CallExpression[callee.property.name='get']",
    message: "Parse untrusted input with a zod schema instead of casting it.",
  },
  {
    selector:
      "CallExpression[callee.property.name='select'][arguments.length=0]",
    message: "Select the columns you need, never all of them.",
  },
  {
    selector:
      "CallExpression[callee.object.name='sql'][callee.property.name='raw']",
    message: "Never build a query by joining strings. Parameterise.",
  },
  {
    selector:
      "Literal[value=/#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?([0-9a-fA-F]{2})?\\b/]",
    message: "Use the design tokens, never a raw hex value.",
  },
  {
    selector: "TSInterfaceDeclaration[id.name=/Props$/]",
    message: "Component props are a `type`, not an `interface`.",
  },
];

const ABBREVIATIONS = [
  "req",
  "res",
  "e",
  "err",
  "evt",
  "idx",
  "btn",
  "msg",
  "ctx",
  "cb",
  "val",
  "tmp",
];

export default tseslint.config(
  {
    ignores: [
      "build/",
      ".react-router/",
      "node_modules/",
      "drizzle/",
      ".claude/",
      ".agents/",
      ".sandcastle/",
      "_internal/",
      "public/",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "simple-import-sort": simpleImportSort,
      sonarjs,
    },
    rules: {
      eqeqeq: "error",
      "no-var": "error",
      "prefer-const": "error",
      "no-console": ["error", { allow: ["error"] }],
      "no-useless-catch": "error",
      "no-empty": ["error", { allowEmptyCatch: false }],
      "prefer-arrow-callback": "error",
      "no-else-return": "error",
      "no-await-in-loop": "error",
      "max-lines": [
        "error",
        { max: 500, skipBlankLines: false, skipComments: false },
      ],
      "max-lines-per-function": [
        "error",
        { max: 50, skipBlankLines: true, skipComments: true },
      ],
      "max-params": ["error", 3],
      "max-depth": ["error", 3],
      "id-denylist": ["error", ...ABBREVIATIONS],
      "no-restricted-syntax": ["error", ...RESTRICTED_SYNTAX],
      "simple-import-sort/imports": [
        "error",
        { groups: [["^node:", "^@?\\w"], ["^~/"], ["^\\."]] },
      ],
      "simple-import-sort/exports": "error",
      "sonarjs/no-commented-code": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/only-throw-error": [
        "error",
        {
          allow: [
            { from: "lib", name: "Response" },
            {
              from: "package",
              package: "react-router",
              name: "DataWithResponseInit",
            },
          ],
        },
      ],
      "@typescript-eslint/no-inferrable-types": "error",
      "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
      "@typescript-eslint/naming-convention": [
        "error",
        {
          // DOM and component-library props whose names we do not choose.
          selector: ["variable", "parameter", "typeProperty"],
          types: ["boolean"],
          filter: {
            regex:
              "^(autoFocus|checked|defaultChecked|disabled|hidden|multiple|open|readOnly|required|asChild|inset)$",
            match: true,
          },
          format: null,
        },
        {
          selector: ["variable", "parameter", "typeProperty"],
          types: ["boolean"],
          format: ["PascalCase"],
          prefix: ["is", "has", "can", "should", "was", "will", "does"],
        },
      ],
    },
  },
  {
    files: ["**/*.tsx"],
    plugins: {
      react,
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat["jsx-runtime"].rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      "react/prop-types": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      "react/no-array-index-key": "error",
      "react/jsx-no-target-blank": "error",
      "react/no-danger": "error",
      "jsx-a11y/tabindex-no-positive": "error",
      // Props are a `type`, so the interface rule must not fight them.
      "@typescript-eslint/consistent-type-definitions": "off",
    },
  },
  {
    // Default exports only for route modules.
    ignores: [
      "app/routes/**",
      "app/root.tsx",
      "app/routes.ts",
      "*.config.{js,ts}",
      ".dependency-cruiser.cjs",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...RESTRICTED_SYNTAX,
        {
          selector: "ExportDefaultDeclaration",
          message: "Default exports only for route modules.",
        },
      ],
    },
  },
  {
    files: ["**/*.test.{ts,tsx}"],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      "vitest/no-disabled-tests": "error",
      "vitest/no-focused-tests": "error",
      "max-lines-per-function": "off",
    },
  },
  {
    // A command-line script's output is its job.
    files: ["scripts/**", "request-logger/**"],
    rules: { "no-console": "off" },
  },
  {
    files: ["**/*.{js,cjs}"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier
);
