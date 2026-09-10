// Generated profile automaton for PPG_PCG (v2.3.1)

export const start = 0;
export const finals = new Set<number>([
  3, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22, 23, 24, 25, 26,
  27, 28, 29, 30, 31,
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
  "PTH",
  "PV1",
  "PV2",
  "ROL",
  "RXO",
  "VAR",
]);
export const transitions = new Map<number, Map<string, number>>([
  [0, new Map([["MSH", 1]])],
  [1, new Map([["PID", 2]])],
  [
    2,
    new Map([
      ["PTH", 3],
      ["PV1", 4],
    ]),
  ],
  [
    3,
    new Map([
      ["GOL", 5],
      ["NTE", 8],
      ["PTH", 3],
      ["ROL", 6],
      ["VAR", 7],
    ]),
  ],
  [
    4,
    new Map([
      ["PTH", 3],
      ["PV2", 9],
    ]),
  ],
  [
    5,
    new Map([
      ["GOL", 5],
      ["NTE", 15],
      ["OBX", 12],
      ["ORC", 10],
      ["PRB", 11],
      ["PTH", 3],
      ["ROL", 13],
      ["VAR", 14],
    ]),
  ],
  [
    6,
    new Map([
      ["GOL", 5],
      ["PTH", 3],
      ["ROL", 6],
      ["VAR", 16],
    ]),
  ],
  [
    7,
    new Map([
      ["GOL", 5],
      ["PTH", 3],
      ["ROL", 6],
      ["VAR", 7],
    ]),
  ],
  [
    8,
    new Map([
      ["GOL", 5],
      ["NTE", 8],
      ["PTH", 3],
      ["ROL", 6],
      ["VAR", 7],
    ]),
  ],
  [9, new Map([["PTH", 3]])],
  [
    10,
    new Map([
      ["GOL", 5],
      ["OBR", 17],
      ["ORC", 10],
      ["PTH", 3],
    ]),
  ],
  [
    11,
    new Map([
      ["GOL", 5],
      ["NTE", 21],
      ["OBX", 18],
      ["ORC", 10],
      ["PRB", 11],
      ["PTH", 3],
      ["ROL", 19],
      ["VAR", 20],
    ]),
  ],
  [
    12,
    new Map([
      ["GOL", 5],
      ["NTE", 22],
      ["OBX", 12],
      ["ORC", 10],
      ["PRB", 11],
      ["PTH", 3],
    ]),
  ],
  [
    13,
    new Map([
      ["GOL", 5],
      ["OBX", 12],
      ["ORC", 10],
      ["PRB", 11],
      ["PTH", 3],
      ["ROL", 13],
      ["VAR", 23],
    ]),
  ],
  [
    14,
    new Map([
      ["GOL", 5],
      ["OBX", 12],
      ["ORC", 10],
      ["PRB", 11],
      ["PTH", 3],
      ["ROL", 13],
      ["VAR", 14],
    ]),
  ],
  [
    15,
    new Map([
      ["GOL", 5],
      ["NTE", 15],
      ["OBX", 12],
      ["ORC", 10],
      ["PRB", 11],
      ["PTH", 3],
      ["ROL", 13],
      ["VAR", 14],
    ]),
  ],
  [
    16,
    new Map([
      ["GOL", 5],
      ["PTH", 3],
      ["ROL", 6],
      ["VAR", 16],
    ]),
  ],
  [17, new Map([["RXO", 24]])],
  [
    18,
    new Map([
      ["GOL", 5],
      ["NTE", 25],
      ["OBX", 18],
      ["ORC", 10],
      ["PRB", 11],
      ["PTH", 3],
    ]),
  ],
  [
    19,
    new Map([
      ["GOL", 5],
      ["OBX", 18],
      ["ORC", 10],
      ["PRB", 11],
      ["PTH", 3],
      ["ROL", 19],
      ["VAR", 26],
    ]),
  ],
  [
    20,
    new Map([
      ["GOL", 5],
      ["OBX", 18],
      ["ORC", 10],
      ["PRB", 11],
      ["PTH", 3],
      ["ROL", 19],
      ["VAR", 20],
    ]),
  ],
  [
    21,
    new Map([
      ["GOL", 5],
      ["NTE", 21],
      ["OBX", 18],
      ["ORC", 10],
      ["PRB", 11],
      ["PTH", 3],
      ["ROL", 19],
      ["VAR", 20],
    ]),
  ],
  [
    22,
    new Map([
      ["GOL", 5],
      ["NTE", 22],
      ["OBX", 12],
      ["ORC", 10],
      ["PRB", 11],
      ["PTH", 3],
    ]),
  ],
  [
    23,
    new Map([
      ["GOL", 5],
      ["OBX", 12],
      ["ORC", 10],
      ["PRB", 11],
      ["PTH", 3],
      ["ROL", 13],
      ["VAR", 23],
    ]),
  ],
  [
    24,
    new Map([
      ["GOL", 5],
      ["NTE", 29],
      ["OBX", 27],
      ["ORC", 10],
      ["PTH", 3],
      ["VAR", 28],
    ]),
  ],
  [
    25,
    new Map([
      ["GOL", 5],
      ["NTE", 25],
      ["OBX", 18],
      ["ORC", 10],
      ["PRB", 11],
      ["PTH", 3],
    ]),
  ],
  [
    26,
    new Map([
      ["GOL", 5],
      ["OBX", 18],
      ["ORC", 10],
      ["PRB", 11],
      ["PTH", 3],
      ["ROL", 19],
      ["VAR", 26],
    ]),
  ],
  [
    27,
    new Map([
      ["GOL", 5],
      ["NTE", 31],
      ["OBX", 27],
      ["ORC", 10],
      ["PTH", 3],
      ["VAR", 30],
    ]),
  ],
  [
    28,
    new Map([
      ["GOL", 5],
      ["OBX", 27],
      ["ORC", 10],
      ["PTH", 3],
      ["VAR", 28],
    ]),
  ],
  [
    29,
    new Map([
      ["GOL", 5],
      ["NTE", 29],
      ["OBX", 27],
      ["ORC", 10],
      ["PTH", 3],
      ["VAR", 28],
    ]),
  ],
  [
    30,
    new Map([
      ["GOL", 5],
      ["OBX", 27],
      ["ORC", 10],
      ["PTH", 3],
      ["VAR", 30],
    ]),
  ],
  [
    31,
    new Map([
      ["GOL", 5],
      ["NTE", 31],
      ["OBX", 27],
      ["ORC", 10],
      ["PTH", 3],
      ["VAR", 30],
    ]),
  ],
]);
export const effects = {
  "10:GOL": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/CHOICE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "10:OBR": {
    groupsClosed: [],
    groupsOpened: [
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/CHOICE",
    ],
  },
  "10:ORC": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "10:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/CHOICE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "11:GOL": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "11:OBX": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION"],
  },
  "11:ORC": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "11:PRB": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM"],
  },
  "11:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "11:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE"],
  },
  "12:GOL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "12:OBX": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION"],
  },
  "12:ORC": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "12:PRB": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM"],
  },
  "12:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "13:GOL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "13:OBX": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/GOAL_ROLE"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION"],
  },
  "13:ORC": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/GOAL_ROLE",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "13:PRB": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/GOAL_ROLE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM"],
  },
  "13:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/GOAL_ROLE",
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "13:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/GOAL_ROLE"],
  },
  "14:GOL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "14:OBX": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/GOAL_ROLE"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION"],
  },
  "14:ORC": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/GOAL_ROLE",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "14:PRB": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/GOAL_ROLE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM"],
  },
  "14:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/GOAL_ROLE",
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "14:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/GOAL_ROLE"],
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
    groupsClosed: ["PPG_PCG/PATHWAY/PATHWAY_ROLE"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "16:PTH": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "16:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/PATHWAY_ROLE"],
  },
  "18:GOL": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "18:OBX": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION"],
  },
  "18:ORC": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "18:PRB": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM"],
  },
  "18:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "19:GOL": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "19:OBX": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION"],
  },
  "19:ORC": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "19:PRB": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM"],
  },
  "19:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "19:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE"],
  },
  "20:GOL": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "20:OBX": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION"],
  },
  "20:ORC": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE",
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
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "20:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE"],
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
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "22:OBX": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION"],
  },
  "22:ORC": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "22:PRB": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM"],
  },
  "22:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "23:GOL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "23:OBX": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/GOAL_ROLE"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION"],
  },
  "23:ORC": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/GOAL_ROLE",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "23:PRB": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/GOAL_ROLE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM"],
  },
  "23:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/GOAL_ROLE",
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "23:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/GOAL_ROLE"],
  },
  "24:GOL": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/CHOICE",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "24:NTE": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/CHOICE"],
    groupsOpened: [],
  },
  "24:OBX": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/CHOICE"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION"],
  },
  "24:ORC": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/CHOICE"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "24:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/CHOICE",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "24:VAR": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/CHOICE"],
    groupsOpened: [],
  },
  "25:GOL": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "25:OBX": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION"],
  },
  "25:ORC": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "25:PRB": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM"],
  },
  "25:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "26:GOL": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "26:OBX": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION"],
  },
  "26:ORC": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "26:PRB": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM"],
  },
  "26:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "26:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM/PROBLEM_ROLE"],
  },
  "27:GOL": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "27:OBX": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION"],
  },
  "27:ORC": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "27:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "28:GOL": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "28:OBX": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION"],
  },
  "28:ORC": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "28:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "29:GOL": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "29:OBX": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION"],
  },
  "29:ORC": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "29:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
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
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "30:OBX": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION"],
  },
  "30:ORC": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "30:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL",
      "PPG_PCG/PATHWAY/GOAL/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
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
  "3:GOL": {
    groupsClosed: ["PPG_PCG/PATHWAY/PATHWAY_ROLE"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "3:PTH": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "3:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/PATHWAY_ROLE"],
  },
  "4:PTH": {
    groupsClosed: ["PPG_PCG/PATIENT_VISIT"],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "5:GOL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "5:OBX": {
    groupsClosed: ["PPG_PCG/PATHWAY/GOAL/GOAL_ROLE"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION"],
  },
  "5:ORC": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/GOAL_ROLE",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/ORDER"],
  },
  "5:PRB": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/GOAL_ROLE",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/PROBLEM"],
  },
  "5:PTH": {
    groupsClosed: [
      "PPG_PCG/PATHWAY/GOAL/GOAL_OBSERVATION",
      "PPG_PCG/PATHWAY/GOAL/GOAL_ROLE",
      "PPG_PCG/PATHWAY/GOAL/ORDER",
      "PPG_PCG/PATHWAY/GOAL/PROBLEM",
    ],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "5:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL/GOAL_ROLE"],
  },
  "6:GOL": {
    groupsClosed: ["PPG_PCG/PATHWAY/PATHWAY_ROLE"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "6:PTH": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "6:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/PATHWAY_ROLE"],
  },
  "7:GOL": {
    groupsClosed: ["PPG_PCG/PATHWAY/PATHWAY_ROLE"],
    groupsOpened: ["PPG_PCG/PATHWAY/GOAL"],
  },
  "7:PTH": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
  "7:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPG_PCG/PATHWAY/PATHWAY_ROLE"],
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
  "9:PTH": {
    groupsClosed: ["PPG_PCG/PATIENT_VISIT"],
    groupsOpened: ["PPG_PCG/PATHWAY"],
  },
} satisfies Readonly<
  Record<
    string,
    { groupsOpened: readonly string[]; groupsClosed: readonly string[] }
  >
>;
