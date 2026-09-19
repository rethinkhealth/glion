// Generated root datatype manifest

// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { datatypeImports as v2_1 } from "./v2.1/datatypes/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { datatypeImports as v2_2 } from "./v2.2/datatypes/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { datatypeImports as v2_3_1 } from "./v2.3.1/datatypes/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { datatypeImports as v2_3 } from "./v2.3/datatypes/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { datatypeImports as v2_4 } from "./v2.4/datatypes/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { datatypeImports as v2_5_1 } from "./v2.5.1/datatypes/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { datatypeImports as v2_5 } from "./v2.5/datatypes/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { datatypeImports as v2_6 } from "./v2.6/datatypes/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { datatypeImports as v2_7_1 } from "./v2.7.1/datatypes/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { datatypeImports as v2_7 } from "./v2.7/datatypes/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { datatypeImports as v2_8_1 } from "./v2.8.1/datatypes/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { datatypeImports as v2_8_2 } from "./v2.8.2/datatypes/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { datatypeImports as v2_8 } from "./v2.8/datatypes/manifest";

export interface DatatypeModule {
  readonly id: string;
  readonly version: string;
  readonly kind: "composite" | "primitive";
  readonly components: readonly {
    readonly sequence: number;
    readonly name: string;
    readonly datatypeId: string;
    readonly required: boolean;
  }[];
}

type DatatypeImportFactory = () => Promise<DatatypeModule>;

const rawDatatypeImports = {
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

export const datatypeImports: Record<string, DatatypeImportFactory> =
  rawDatatypeImports;

export type DatatypeImportKey = keyof typeof rawDatatypeImports;
