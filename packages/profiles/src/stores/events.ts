import { eventMapEntry } from "../event-map-entry";
import { programOf } from "../event-schema/compile";
import type { EventSchema } from "../event-schema/types";
import type { ProfileStoreConfig } from "../store";

/** A bundled event schema file. */
export type EventSchemaModule = Readonly<{ default: EventSchema }>;

/** Lazy loaders for the bundled event schemas, keyed by file path. */
export const eventSchemaImports: Readonly<
  Record<string, () => Promise<EventSchemaModule>>
> = import.meta.glob<EventSchemaModule>("../profiles/v*/events/*.json");

/** The path `eventSchemaImports` keys a schema by. */
export const eventSchemaPath = (version: string, id: string): string =>
  `../profiles/v${version}/events/${id}.json`;

/** Store configuration for event (event schema) profiles. */
export const eventsConfig: ProfileStoreConfig<EventSchemaModule, EventSchema> =
  {
    // Compiling on load makes an invalid schema fail the load, not a later
    // runner() call.
    compile: ({ default: schema }) => {
      programOf(schema);
      return schema;
    },
    manifest: eventSchemaImports,
    manifestKey: eventSchemaPath,
    namespace: "events",
    resolveId: eventMapEntry,
  };
