// Generated profile automaton for ADT_A60 (v2.5.1)

export const start = 0;
export const finals = new Set<number>([4, 5, 6, 7]);
export const alphabet = new Set<string>([
  "EVN",
  "IAM",
  "MSH",
  "PID",
  "PV1",
  "PV2",
  "SFT",
]);
export const transitions = new Map<number, Map<string, number>>([
  [0, new Map([["MSH", 1]])],
  [
    1,
    new Map([
      ["EVN", 2],
      ["SFT", 3],
    ]),
  ],
  [2, new Map([["PID", 4]])],
  [
    3,
    new Map([
      ["EVN", 2],
      ["SFT", 3],
    ]),
  ],
  [
    4,
    new Map([
      ["IAM", 5],
      ["PV1", 7],
    ]),
  ],
  [5, new Map([["IAM", 5]])],
  [6, new Map([["IAM", 5]])],
  [
    7,
    new Map([
      ["IAM", 5],
      ["PV2", 6],
    ]),
  ],
]);
export const effects = {} satisfies Readonly<
  Record<
    string,
    { groupsOpened: readonly string[]; groupsClosed: readonly string[] }
  >
>;
