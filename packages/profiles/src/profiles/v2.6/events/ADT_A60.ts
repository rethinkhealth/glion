// Generated profile automaton for ADT_A60 (v2.6)

export const start = 0;
export const finals = new Set<number>([5, 6, 7, 8, 9, 10]);
export const alphabet = new Set<string>([
  "ARV",
  "EVN",
  "IAM",
  "MSH",
  "PID",
  "PV1",
  "PV2",
  "SFT",
  "UAC",
]);
export const transitions = new Map<number, Map<string, number>>([
  [0, new Map([["MSH", 1]])],
  [
    1,
    new Map([
      ["EVN", 2],
      ["SFT", 4],
      ["UAC", 3],
    ]),
  ],
  [2, new Map([["PID", 5]])],
  [3, new Map([["EVN", 2]])],
  [
    4,
    new Map([
      ["EVN", 2],
      ["SFT", 4],
      ["UAC", 3],
    ]),
  ],
  [
    5,
    new Map([
      ["ARV", 7],
      ["IAM", 6],
      ["PV1", 9],
    ]),
  ],
  [6, new Map([["IAM", 6]])],
  [
    7,
    new Map([
      ["ARV", 7],
      ["IAM", 6],
      ["PV1", 9],
    ]),
  ],
  [
    8,
    new Map([
      ["ARV", 10],
      ["IAM", 6],
    ]),
  ],
  [
    9,
    new Map([
      ["ARV", 10],
      ["IAM", 6],
      ["PV2", 8],
    ]),
  ],
  [
    10,
    new Map([
      ["ARV", 10],
      ["IAM", 6],
    ]),
  ],
]);
export const effects = {} satisfies Readonly<
  Record<
    string,
    { groupsOpened: readonly string[]; groupsClosed: readonly string[] }
  >
>;
