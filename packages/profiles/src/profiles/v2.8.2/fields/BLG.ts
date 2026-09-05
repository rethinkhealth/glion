// Generated segment profile for BLG (v2.8.2)

export const segmentId = "BLG";
export const fields = [
  {
    datatype: "CCD",
    id: "BLG-1",
    item: "234",
    name: "When to Charge",
    repeatable: false,
    required: false,
    sequence: 1,
    table: "HL70100",
  },
  {
    datatype: "ID",
    id: "BLG-2",
    item: "235",
    maxLength: 2,
    name: "Charge Type",
    repeatable: false,
    required: false,
    sequence: 2,
    table: "HL70122",
  },
  {
    datatype: "CX",
    id: "BLG-3",
    item: "236",
    name: "Account ID",
    repeatable: false,
    required: false,
    sequence: 3,
  },
  {
    datatype: "CWE",
    id: "BLG-4",
    item: "1645",
    name: "Charge Type Reason",
    repeatable: false,
    required: false,
    sequence: 4,
    table: "HL70475",
  },
] as const;
