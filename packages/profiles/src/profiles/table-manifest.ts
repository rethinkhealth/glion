// Generated root table manifest

// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { tableImports as v2_1 } from "./v2.1/tables/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { tableImports as v2_2 } from "./v2.2/tables/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { tableImports as v2_3_1 } from "./v2.3.1/tables/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { tableImports as v2_3 } from "./v2.3/tables/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { tableImports as v2_4 } from "./v2.4/tables/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { tableImports as v2_5_1 } from "./v2.5.1/tables/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { tableImports as v2_5 } from "./v2.5/tables/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { tableImports as v2_6 } from "./v2.6/tables/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { tableImports as v2_7_1 } from "./v2.7.1/tables/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { tableImports as v2_7 } from "./v2.7/tables/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { tableImports as v2_8_1 } from "./v2.8.1/tables/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { tableImports as v2_8_2 } from "./v2.8.2/tables/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { tableImports as v2_8 } from "./v2.8/tables/manifest";

export interface TableModule {
  readonly id: string;
  readonly description: string;
  readonly type: "user" | "hl7";
  readonly codes: readonly {
    readonly name: string;
    readonly description: string;
  }[];
}

type TableImportFactory = () => Promise<TableModule>;

const rawTableImports = {
  ...v2_1,
  ...v2_2,
  ...v2_3,
  ...v2_3_1,
  ...v2_4,
  ...v2_5,
  ...v2_5_1,
  ...v2_6,
  ...v2_7,
  ...v2_7_1,
  ...v2_8,
  ...v2_8_1,
  ...v2_8_2,
} as const;

export const tableImports: Record<string, TableImportFactory> = rawTableImports;

export type TableImportKey = keyof typeof rawTableImports;
