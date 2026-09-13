import type { PlopTypes } from "@turbo/gen";

export default function generator(plop: PlopTypes.NodePlopAPI): void {
  plop.setGenerator("package", {
    actions: [
      {
        path: "packages/{{ name }}/package.json",
        templateFile: "templates/package.json.hbs",
        type: "add",
      },
      {
        path: "packages/{{ name }}/tsconfig.json",
        templateFile: "templates/tsconfig.json.hbs",
        type: "add",
      },
      {
        path: "packages/{{ name }}/tsup.config.ts",
        templateFile: "templates/tsup.config.ts.hbs",
        type: "add",
      },
      {
        path: "packages/{{ name }}/vitest.config.ts",
        templateFile: "templates/vitest.config.ts.hbs",
        type: "add",
      },
      {
        path: "packages/{{ name }}/src/index.ts",
        templateFile: "templates/src/index.ts.hbs",
        type: "add",
      },
      {
        path: "packages/{{ name }}/tests/index.test.ts",
        templateFile: "templates/tests/index.test.ts.hbs",
        type: "add",
      },
      {
        path: "packages/{{ name }}/README.md",
        templateFile: "templates/README.md.hbs",
        type: "add",
      },
    ],
    description: "Create a new package with standard configuration",
    prompts: [
      {
        message: "Package name (without @glion/ prefix):",
        name: "name",
        type: "input",
        validate: (input: string) => {
          if (!input) {
            return "Package name is required";
          }
          if (!/^[a-z0-9-]+$/.test(input)) {
            return "Package name must be lowercase with hyphens only";
          }
          return true;
        },
      },
      {
        message: "Package description:",
        name: "description",
        type: "input",
        validate: (input: string) => {
          if (!input) {
            return "Description is required";
          }
          return true;
        },
      },
    ],
  });
}
