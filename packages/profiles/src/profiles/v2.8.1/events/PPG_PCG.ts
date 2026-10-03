// Generated profile automaton for PPG_PCG (v2.8.1)

export const start = 0;
export const finals = new Set<number>([
  5, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 20, 21, 22, 23, 24, 25, 26, 27,
  28, 29, 30, 31, 32, 33, 34, 35, 36,
]);
export const alphabet = new Set<string>([
  "GOL",
  "MSH",
  "NTE",
  "OBR",
  "OBX",
  "ORC",
  "PID",
  "PRB",
  "PRT",
  "PTH",
  "PV1",
  "PV2",
  "ROL",
  "SFT",
  "UAC",
  "VAR",
  "Hxx",
]);
export const transitions = new Map<number, Map<string, number>>([
  [0, new Map([["MSH", 1]])],
  [
    1,
    new Map([
      ["PID", 2],
      ["SFT", 4],
      ["UAC", 3],
    ]),
  ],
  [
    2,
    new Map([
      ["PTH", 5],
      ["PV1", 6],
    ]),
  ],
  [3, new Map([["PID", 2]])],
  [
    4,
    new Map([
      ["PID", 2],
      ["SFT", 4],
      ["UAC", 3],
    ]),
  ],
  [
    5,
    new Map([
      ["GOL", 7],
      ["NTE", 10],
      ["PTH", 5],
      ["ROL", 8],
      ["VAR", 9],
    ]),
  ],
  [
    6,
    new Map([
      ["PTH", 5],
      ["PV2", 11],
    ]),
  ],
  [
    7,
    new Map([
      ["GOL", 7],
      ["NTE", 17],
      ["OBX", 14],
      ["ORC", 12],
      ["PRB", 13],
      ["PTH", 5],
      ["ROL", 15],
      ["VAR", 16],
    ]),
  ],
  [
    8,
    new Map([
      ["GOL", 7],
      ["PTH", 5],
      ["ROL", 8],
      ["VAR", 18],
    ]),
  ],
  [
    9,
    new Map([
      ["GOL", 7],
      ["PTH", 5],
      ["ROL", 8],
      ["VAR", 9],
    ]),
  ],
  [
    10,
    new Map([
      ["GOL", 7],
      ["NTE", 10],
      ["PTH", 5],
      ["ROL", 8],
      ["VAR", 9],
    ]),
  ],
  [11, new Map([["PTH", 5]])],
  [
    12,
    new Map([
      ["GOL", 7],
      ["OBR", 19],
      ["ORC", 12],
      ["PTH", 5],
    ]),
  ],
  [
    13,
    new Map([
      ["GOL", 7],
      ["NTE", 23],
      ["OBX", 20],
      ["ORC", 12],
      ["PRB", 13],
      ["PTH", 5],
      ["ROL", 21],
      ["VAR", 22],
    ]),
  ],
  [
    14,
    new Map([
      ["GOL", 7],
      ["NTE", 24],
      ["OBX", 14],
      ["ORC", 12],
      ["PRB", 13],
      ["PRT", 25],
      ["PTH", 5],
    ]),
  ],
  [
    15,
    new Map([
      ["GOL", 7],
      ["OBX", 14],
      ["ORC", 12],
      ["PRB", 13],
      ["PTH", 5],
      ["ROL", 15],
      ["VAR", 26],
    ]),
  ],
  [
    16,
    new Map([
      ["GOL", 7],
      ["OBX", 14],
      ["ORC", 12],
      ["PRB", 13],
      ["PTH", 5],
      ["ROL", 15],
      ["VAR", 16],
    ]),
  ],
  [
    17,
    new Map([
      ["GOL", 7],
      ["NTE", 17],
      ["OBX", 14],
      ["ORC", 12],
      ["PRB", 13],
      ["PTH", 5],
      ["ROL", 15],
      ["VAR", 16],
    ]),
  ],
  [
    18,
    new Map([
      ["GOL", 7],
      ["PTH", 5],
      ["ROL", 8],
      ["VAR", 18],
    ]),
  ],
  [19, new Map([["Hxx", 27]])],
  [
    20,
    new Map([
      ["GOL", 7],
      ["NTE", 28],
      ["OBX", 20],
      ["ORC", 12],
      ["PRB", 13],
      ["PRT", 29],
      ["PTH", 5],
    ]),
  ],
  [
    21,
    new Map([
      ["GOL", 7],
      ["OBX", 20],
      ["ORC", 12],
      ["PRB", 13],
      ["PTH", 5],
      ["ROL", 21],
      ["VAR", 30],
    ]),
  ],
  [
    22,
    new Map([
      ["GOL", 7],
      ["OBX", 20],
      ["ORC", 12],
      ["PRB", 13],
      ["PTH", 5],
      ["ROL", 21],
      ["VAR", 22],
    ]),
  ],
  [
    23,
    new Map([
      ["GOL", 7],
      ["NTE", 23],
      ["OBX", 20],
      ["ORC", 12],
      ["PRB", 13],
      ["PTH", 5],
      ["ROL", 21],
      ["VAR", 22],
    ]),
  ],
  [
    24,
    new Map([
      ["GOL", 7],
      ["NTE", 24],
      ["OBX", 14],
      ["ORC", 12],
      ["PRB", 13],
      ["PTH", 5],
    ]),
  ],
  [
    25,
    new Map([
      ["GOL", 7],
      ["NTE", 24],
      ["OBX", 14],
      ["ORC", 12],
      ["PRB", 13],
      ["PRT", 25],
      ["PTH", 5],
    ]),
  ],
  [
    26,
    new Map([
      ["GOL", 7],
      ["OBX", 14],
      ["ORC", 12],
      ["PRB", 13],
      ["PTH", 5],
      ["ROL", 15],
      ["VAR", 26],
    ]),
  ],
  [
    27,
    new Map([
      ["GOL", 7],
      ["NTE", 33],
      ["OBX", 31],
      ["ORC", 12],
      ["PTH", 5],
      ["VAR", 32],
    ]),
  ],
  [
    28,
    new Map([
      ["GOL", 7],
      ["NTE", 28],
      ["OBX", 20],
      ["ORC", 12],
      ["PRB", 13],
      ["PTH", 5],
    ]),
  ],
  [
    29,
    new Map([
      ["GOL", 7],
      ["NTE", 28],
      ["OBX", 20],
      ["ORC", 12],
      ["PRB", 13],
      ["PRT", 29],
      ["PTH", 5],
    ]),
  ],
  [
    30,
    new Map([
      ["GOL", 7],
      ["OBX", 20],
      ["ORC", 12],
      ["PRB", 13],
      ["PTH", 5],
      ["ROL", 21],
      ["VAR", 30],
    ]),
  ],
  [
    31,
    new Map([
      ["GOL", 7],
      ["NTE", 35],
      ["OBX", 31],
      ["ORC", 12],
      ["PRT", 36],
      ["PTH", 5],
      ["VAR", 34],
    ]),
  ],
  [
    32,
    new Map([
      ["GOL", 7],
      ["OBX", 31],
      ["ORC", 12],
      ["PTH", 5],
      ["VAR", 32],
    ]),
  ],
  [
    33,
    new Map([
      ["GOL", 7],
      ["NTE", 33],
      ["OBX", 31],
      ["ORC", 12],
      ["PTH", 5],
      ["VAR", 32],
    ]),
  ],
  [
    34,
    new Map([
      ["GOL", 7],
      ["OBX", 31],
      ["ORC", 12],
      ["PTH", 5],
      ["VAR", 34],
    ]),
  ],
  [
    35,
    new Map([
      ["GOL", 7],
      ["NTE", 35],
      ["OBX", 31],
      ["ORC", 12],
      ["PTH", 5],
      ["VAR", 34],
    ]),
  ],
  [
    36,
    new Map([
      ["GOL", 7],
      ["NTE", 35],
      ["OBX", 31],
      ["ORC", 12],
      ["PRT", 36],
      ["PTH", 5],
      ["VAR", 34],
    ]),
  ],
]);
export const effects = {
  "10:GOL": {
    groupsClosed: ["PPG_PCG/PATHWAY/PATHWAY_ROLE"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "10:PTH": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "10:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/PATHWAY_ROLE"],
  },
  "11:PTH": {
    groupsClosed: ["PPG_PCG/PATIENT_VISIT"],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "12:GOL": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/CHOICE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "12:OBR": {
    groupsClosed: [],
    groupsOpened: [
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/CHOICE",
    ],
  },
  "12:ORC": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "12:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/CHOICE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "13:GOL": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "13:OBX": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION"],
  },
  "13:ORC": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "13:PRB": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM"],
  },
  "13:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "13:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE"],
  },
  "14:GOL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "14:OBX": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION"],
  },
  "14:ORC": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "14:PRB": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM"],
  },
  "14:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "15:GOL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "15:OBX": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/GOAL_ROLE"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION"],
  },
  "15:ORC": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/GOAL_ROLE",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "15:PRB": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/GOAL_ROLE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM"],
  },
  "15:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/GOAL_ROLE",
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "15:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/GOAL_ROLE"],
  },
  "16:GOL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "16:OBX": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/GOAL_ROLE"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION"],
  },
  "16:ORC": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/GOAL_ROLE",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "16:PRB": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/GOAL_ROLE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM"],
  },
  "16:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/GOAL_ROLE",
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "16:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/GOAL_ROLE"],
  },
  "17:GOL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "17:OBX": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/GOAL_ROLE"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION"],
  },
  "17:ORC": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/GOAL_ROLE",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "17:PRB": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/GOAL_ROLE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM"],
  },
  "17:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/GOAL_ROLE",
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "17:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/GOAL_ROLE"],
  },
  "18:GOL": {
    groupsClosed: ["PPG_PCG/PATHWAY/PATHWAY_ROLE"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "18:PTH": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "18:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/PATHWAY_ROLE"],
  },
  "20:GOL": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "20:OBX": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION"],
  },
  "20:ORC": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "20:PRB": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM"],
  },
  "20:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "21:GOL": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "21:OBX": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION"],
  },
  "21:ORC": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "21:PRB": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM"],
  },
  "21:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "21:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE"],
  },
  "22:GOL": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "22:OBX": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION"],
  },
  "22:ORC": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "22:PRB": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM"],
  },
  "22:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "22:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE"],
  },
  "23:GOL": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "23:OBX": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION"],
  },
  "23:ORC": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "23:PRB": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM"],
  },
  "23:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "23:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE"],
  },
  "24:GOL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "24:OBX": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION"],
  },
  "24:ORC": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "24:PRB": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM"],
  },
  "24:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "25:GOL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "25:OBX": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION"],
  },
  "25:ORC": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "25:PRB": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM"],
  },
  "25:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "26:GOL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "26:OBX": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/GOAL_ROLE"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION"],
  },
  "26:ORC": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/GOAL_ROLE",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "26:PRB": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/GOAL_ROLE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM"],
  },
  "26:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/GOAL_ROLE",
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "26:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/GOAL_ROLE"],
  },
  "27:GOL": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/CHOICE",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "27:NTE": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/CHOICE"],
    groupsOpened: [],
  },
  "27:OBX": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/CHOICE"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION"],
  },
  "27:ORC": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/CHOICE"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "27:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/CHOICE",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "27:VAR": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/CHOICE"],
    groupsOpened: [],
  },
  "28:GOL": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "28:OBX": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION"],
  },
  "28:ORC": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "28:PRB": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM"],
  },
  "28:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "29:GOL": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "29:OBX": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION"],
  },
  "29:ORC": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "29:PRB": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM"],
  },
  "29:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "2:PTH": {
    groupsClosed: ["PPG_PCG/PATIENT_VISIT"],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "2:PV1": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATIENT_VISIT"],
  },
  "30:GOL": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "30:OBX": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION"],
  },
  "30:ORC": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "30:PRB": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM"],
  },
  "30:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "30:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE"],
  },
  "31:GOL": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "31:OBX": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION"],
  },
  "31:ORC": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "31:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "32:GOL": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "32:OBX": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION"],
  },
  "32:ORC": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "32:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "33:GOL": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "33:OBX": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION"],
  },
  "33:ORC": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "33:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "34:GOL": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "34:OBX": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION"],
  },
  "34:ORC": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "34:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "35:GOL": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "35:OBX": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION"],
  },
  "35:ORC": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "35:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "36:GOL": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "36:OBX": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION"],
  },
  "36:ORC": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "36:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "5:GOL": {
    groupsClosed: ["PPG_PCG/PATHWAY/PATHWAY_ROLE"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "5:PTH": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "5:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/PATHWAY_ROLE"],
  },
  "6:PTH": {
    groupsClosed: ["PPG_PCG/PATIENT_VISIT"],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "7:GOL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "7:OBX": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/GOAL_ROLE"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION"],
  },
  "7:ORC": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/GOAL_ROLE",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "7:PRB": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/GOAL_ROLE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM"],
  },
  "7:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/GOAL_ROLE",
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "7:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/GOAL_ROLE"],
  },
  "8:GOL": {
    groupsClosed: ["PPG_PCG/PATHWAY/PATHWAY_ROLE"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "8:PTH": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "8:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/PATHWAY_ROLE"],
  },
  "9:GOL": {
    groupsClosed: ["PPG_PCG/PATHWAY/PATHWAY_ROLE"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "9:PTH": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "9:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/PATHWAY_ROLE"],
  },
} satisfies Readonly<
  Record<
    string,
    { groupsOpened: readonly string[]; groupsClosed: readonly string[] }
  >
>;
