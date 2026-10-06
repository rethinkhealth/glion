import { memoize } from "../utils";
import { lazyImport } from "./utils";

/**
 * The event map of a version: it maps a message code and trigger event, such
 * as `"ADT_A04"`, to the ID of the message structure it uses, such as
 * `"ADT_A01"`.
 */
export type EventMap = Readonly<Record<string, string>>;

const index = memoize(
  (raw: Record<string, string>): EventMap =>
    Object.setPrototypeOf({ ...raw }, null)
);

/** The loader of event maps, one per HL7v2 version. */
export type EventMapStore = Readonly<{
  /**
   * Loads the event map of `version`, or `undefined` when `version` is not
   * bundled. Later loads of the same version resolve the same value.
   *
   * The map has no prototype, so a key read from a message, such as
   * `"__proto__"` or `"constructor"`, has no entry.
   *
   * @throws {Error} When a bundled event map fails to load.
   */
  load(version: string): Promise<EventMap | undefined>;
}>;

/** The loader of event maps. */
export const eventMaps: EventMapStore = {
  load: async (version) => {
    const raw = await lazyImport<Record<string, string>>(
      `../profiles/v${version}/event-map.json`
    );
    return raw === undefined ? undefined : index(raw);
  },
};
