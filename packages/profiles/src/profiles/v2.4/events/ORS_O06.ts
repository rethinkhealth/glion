// Generated profile automaton for ORS_O06 (v2.4)

export const start = 0;
export const finals = new Set<number>([2, 5, 6, 7, 9, 10]);
export const alphabet = new Set<string>([
  "ERR",
  "MSA",
  "MSH",
  "NTE",
  "ORC",
  "PID",
  "RQ1",
  "RQD",
]);
export const transitions = new Map<number, Map<string, number>>([
  [0, new Map([["MSH", 1]])],
  [1, new Map([["MSA", 2]])],
  [
    2,
    new Map([
      ["ERR", 6],
      ["NTE", 5],
      ["ORC", 3],
      ["PID", 4],
    ]),
  ],
  [3, new Map([["RQD", 7]])],
  [
    4,
    new Map([
      ["NTE", 8],
      ["ORC", 3],
    ]),
  ],
  [
    5,
    new Map([
      ["NTE", 5],
      ["ORC", 3],
      ["PID", 4],
    ]),
  ],
  [
    6,
    new Map([
      ["NTE", 5],
      ["ORC", 3],
      ["PID", 4],
    ]),
  ],
  [
    7,
    new Map([
      ["NTE", 9],
      ["ORC", 3],
      ["RQ1", 10],
    ]),
  ],
  [
    8,
    new Map([
      ["NTE", 8],
      ["ORC", 3],
    ]),
  ],
  [
    9,
    new Map([
      ["NTE", 9],
      ["ORC", 3],
    ]),
  ],
  [
    10,
    new Map([
      ["NTE", 9],
      ["ORC", 3],
    ]),
  ],
]);
export const effects = {
  "10:ORC": {
    groupsClosed: [],
    groupsOpened: ["ORS_O06/RESPONSE/ORDER"],
  },
  "2:ORC": {
    groupsClosed: ["ORS_O06/RESPONSE/PATIENT"],
    groupsOpened: ["ORS_O06/RESPONSE", "ORS_O06/RESPONSE/ORDER"],
  },
  "2:PID": {
    groupsClosed: [],
    groupsOpened: ["ORS_O06/RESPONSE", "ORS_O06/RESPONSE/PATIENT"],
  },
  "4:ORC": {
    groupsClosed: ["ORS_O06/RESPONSE/PATIENT"],
    groupsOpened: ["ORS_O06/RESPONSE/ORDER"],
  },
  "5:ORC": {
    groupsClosed: ["ORS_O06/RESPONSE/PATIENT"],
    groupsOpened: ["ORS_O06/RESPONSE", "ORS_O06/RESPONSE/ORDER"],
  },
  "5:PID": {
    groupsClosed: [],
    groupsOpened: ["ORS_O06/RESPONSE", "ORS_O06/RESPONSE/PATIENT"],
  },
  "6:ORC": {
    groupsClosed: ["ORS_O06/RESPONSE/PATIENT"],
    groupsOpened: ["ORS_O06/RESPONSE", "ORS_O06/RESPONSE/ORDER"],
  },
  "6:PID": {
    groupsClosed: [],
    groupsOpened: ["ORS_O06/RESPONSE", "ORS_O06/RESPONSE/PATIENT"],
  },
  "7:ORC": {
    groupsClosed: [],
    groupsOpened: ["ORS_O06/RESPONSE/ORDER"],
  },
  "8:ORC": {
    groupsClosed: ["ORS_O06/RESPONSE/PATIENT"],
    groupsOpened: ["ORS_O06/RESPONSE/ORDER"],
  },
  "9:ORC": {
    groupsClosed: [],
    groupsOpened: ["ORS_O06/RESPONSE/ORDER"],
  },
} satisfies Readonly<
  Record<
    string,
    { groupsOpened: readonly string[]; groupsClosed: readonly string[] }
  >
>;
