// Generated root profile manifest

// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { profileImports as v2_1 } from "./v2.1/events/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { profileImports as v2_2 } from "./v2.2/events/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { profileImports as v2_3_1 } from "./v2.3.1/events/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { profileImports as v2_3 } from "./v2.3/events/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { profileImports as v2_4 } from "./v2.4/events/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { profileImports as v2_5_1 } from "./v2.5.1/events/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { profileImports as v2_5 } from "./v2.5/events/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { profileImports as v2_6 } from "./v2.6/events/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { profileImports as v2_7_1 } from "./v2.7.1/events/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { profileImports as v2_7 } from "./v2.7/events/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { profileImports as v2_8_1 } from "./v2.8.1/events/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { profileImports as v2_8_2 } from "./v2.8.2/events/manifest";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { profileImports as v2_8 } from "./v2.8/events/manifest";

export interface ProfileModule {
  readonly start: number;
  readonly finals: Set<number>;
  readonly alphabet: Set<string>;
  readonly transitions: Map<number, Map<string, number>>;
  readonly effects?: Readonly<
    Record<
      string,
      { groupsOpened: readonly string[]; groupsClosed: readonly string[] }
    >
  >;
}

type ProfileImportFactory = () => Promise<ProfileModule>;

const rawProfileImports = {
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

export const profileImports: Record<string, ProfileImportFactory> =
  rawProfileImports;

export type ProfileImportKey = keyof typeof rawProfileImports;
