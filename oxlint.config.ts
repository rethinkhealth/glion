import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";

export default defineConfig({
  extends: [core],
  ignorePatterns: ["**/*.hbs", ".agents/**", ".claude/**"],
  jsPlugins: ["oxlint-plugin-complexity"],
  overrides: [
    {
      // Test and bench bodies are sequential scenarios; their nesting is
      // describe/it callbacks, not control flow worth capping.
      files: ["**/tests/**", "benchmarks/**"],
      rules: { "complexity/complexity": "off" },
    },
  ],
  rules: {
    // The plugin below owns both complexity metrics; the built-in rule
    // counts cyclomatic differently and would report the same functions twice.
    complexity: "off",
    "complexity/complexity": ["error", { cognitive: 15, cyclomatic: 20 }],
    "default-case": "off",
    "func-style": "off",
    "import/no-relative-parent-imports": "off",
    "jsdoc/require-param-type": "off",
    "jsdoc/require-returns-type": "off",
    "max-classes-per-file": "off",
    "max-statements": "off",
    "no-empty-function": "off",
    "no-inline-comments": "off",
    "no-plusplus": "off",
    "no-unsafe-optional-chaining": "off",
    "no-use-before-define": "off",
    "no-warning-comments": "off",
    "oxc/no-accumulating-spread": "off",
    "oxc/no-this-in-exported-function": "off",
    "prefer-destructuring": "off",
    "typescript/array-type": "off",
    "typescript/no-empty-interface": "off",
    "typescript/no-empty-object-type": "off",
    "typescript/no-non-null-assertion": "off",
    "typescript/no-this-alias": "off",
    "unicorn/consistent-function-scoping": "off",
    "unicorn/custom-error-definition": "off",
    "unicorn/filename-case": "off",
    "unicorn/no-new-array": "off",
    "unicorn/no-this-assignment": "off",
    "unicorn/no-useless-collection-argument": "off",
    "unicorn/no-useless-error-capture-stack-trace": "off",
    "unicorn/no-useless-fallback-in-spread": "off",
    "unicorn/number-literal-case": "off",
    "unicorn/prefer-import-meta-properties": "off",
    "unicorn/prefer-module": "off",
    "unicorn/text-encoding-identifier-case": "off",
  },
});
