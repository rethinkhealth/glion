// Generated root field manifest

// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { fieldImports as v2_1 } from "./v2.1/fields/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { fieldImports as v2_2 } from "./v2.2/fields/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { fieldImports as v2_3_1 } from "./v2.3.1/fields/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { fieldImports as v2_3 } from "./v2.3/fields/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { fieldImports as v2_4 } from "./v2.4/fields/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { fieldImports as v2_5_1 } from "./v2.5.1/fields/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { fieldImports as v2_5 } from "./v2.5/fields/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { fieldImports as v2_6 } from "./v2.6/fields/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { fieldImports as v2_7_1 } from "./v2.7.1/fields/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { fieldImports as v2_7 } from "./v2.7/fields/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { fieldImports as v2_8_1 } from "./v2.8.1/fields/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { fieldImports as v2_8_2 } from "./v2.8.2/fields/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { fieldImports as v2_8 } from "./v2.8/fields/manifest";

export interface FieldModule {
  readonly segmentId: string;
  readonly fields: readonly {
    readonly sequence: number;
    readonly id: string;
    readonly required: boolean;
    readonly repeatable: boolean;
    readonly datatype: string;
    readonly maxLength?: number;
    readonly table?: string;
    readonly name?: string;
    readonly item?: string;
  }[];
}

type FieldImportFactory = () => Promise<FieldModule>;

const rawFieldImports = {
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

export const fieldImports: Record<string, FieldImportFactory> = rawFieldImports;

export type FieldImportKey = keyof typeof rawFieldImports;
