import { loaderByVersion } from "./load";
import type { DatatypeDefinition, DatatypeEntry } from "./types";

const compileDatatype = ({
  id,
  version,
  kind,
  title,
  components,
}: DatatypeEntry): DatatypeDefinition => ({
  componentsBySequence: new Map(
    components.map((component) => [component.sequence, component])
  ),
  id,
  kind,
  requiredSequences: new Set(
    components
      .filter((component) => component.required)
      .map((component) => component.sequence)
  ),
  title,
  version,
});

/**
 * The datatype definitions of an HL7v2 version, by datatype ID, or `undefined`
 * for a version not bundled.
 */
export const loadDatatypes: (
  version: string
) => Promise<ReadonlyMap<string, DatatypeDefinition> | undefined> =
  loaderByVersion(
    import.meta.glob<readonly DatatypeEntry[]>(
      "../profiles/v*/datatypes.json",
      { import: "default" }
    ),
    (datatypes) =>
      new Map(
        datatypes.map((datatype) => [datatype.id, compileDatatype(datatype)])
      )
  );
