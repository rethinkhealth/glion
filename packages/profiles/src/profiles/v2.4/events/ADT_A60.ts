// Generated profile automaton for ADT_A60 (v2.4)

export const start = 0;
export const finals = new Set<number>([3, 4, 5, 6]);
export const alphabet = new Set<string>([
  "EVN",
  "IAM",
  "MSH",
  "PID",
  "PV1",
  "PV2",
]);
export const transitions = new Map<number, Map<string, number>>([
  [0, new Map([["MSH", 1]])],
  [1, new Map([["EVN", 2]])],
  [2, new Map([["PID", 3]])],
  [
    3,
    new Map([
      ["IAM", 4],
      ["PV1", 6],
    ]),
  ],
  [4, new Map([["IAM", 4]])],
  [5, new Map([["IAM", 4]])],
  [
    6,
    new Map([
      ["IAM", 4],
      ["PV2", 5],
    ]),
  ],
]);
export const effects = {} satisfies Readonly<
  Record<
    string,
    { groupsOpened: readonly string[]; groupsClosed: readonly string[] }
  >
>;
