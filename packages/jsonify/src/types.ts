export type FieldJson = string | string[];

export interface SegmentJson {
  segment: string;
  fields: (FieldJson | FieldJson[])[]; // Nested arrays for fields/repetitions/components
}

export interface GroupJson {
  /** The group ID, such as `PATIENT_VISIT`. */
  group: string;
  /** The group name as the standard spells it, such as `PATIENT VISIT`. */
  name: string;
  children: (SegmentJson | GroupJson)[]; // Groups can contain segments and nested groups
}

export type Hl7v2JsonResult = (SegmentJson | GroupJson)[];
