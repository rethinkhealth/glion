// Generated profile automaton for PPP_PCB (v2.4)

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
      ["NTE", 8],
      ["PRB", 5],
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
      ["GOL", 11],
      ["NTE", 15],
      ["OBX", 12],
      ["ORC", 10],
      ["PRB", 5],
      ["PTH", 3],
      ["ROL", 13],
      ["VAR", 14],
    ]),
  ],
  [
    6,
    new Map([
      ["PRB", 5],
      ["PTH", 3],
      ["ROL", 6],
      ["VAR", 16],
    ]),
  ],
  [
    7,
    new Map([
      ["PRB", 5],
      ["PTH", 3],
      ["ROL", 6],
      ["VAR", 7],
    ]),
  ],
  [
    8,
    new Map([
      ["NTE", 8],
      ["PRB", 5],
      ["PTH", 3],
      ["ROL", 6],
      ["VAR", 7],
    ]),
  ],
  [9, new Map([["PTH", 3]])],
  [
    10,
    new Map([
      ["OBR", 17],
      ["ORC", 10],
      ["PRB", 5],
      ["PTH", 3],
    ]),
  ],
  [
    11,
    new Map([
      ["GOL", 11],
      ["NTE", 21],
      ["OBX", 18],
      ["ORC", 10],
      ["PRB", 5],
      ["PTH", 3],
      ["ROL", 19],
      ["VAR", 20],
    ]),
  ],
  [
    12,
    new Map([
      ["GOL", 11],
      ["NTE", 22],
      ["OBX", 12],
      ["ORC", 10],
      ["PRB", 5],
      ["PTH", 3],
    ]),
  ],
  [
    13,
    new Map([
      ["GOL", 11],
      ["OBX", 12],
      ["ORC", 10],
      ["PRB", 5],
      ["PTH", 3],
      ["ROL", 13],
      ["VAR", 23],
    ]),
  ],
  [
    14,
    new Map([
      ["GOL", 11],
      ["OBX", 12],
      ["ORC", 10],
      ["PRB", 5],
      ["PTH", 3],
      ["ROL", 13],
      ["VAR", 14],
    ]),
  ],
  [
    15,
    new Map([
      ["GOL", 11],
      ["NTE", 15],
      ["OBX", 12],
      ["ORC", 10],
      ["PRB", 5],
      ["PTH", 3],
      ["ROL", 13],
      ["VAR", 14],
    ]),
  ],
  [
    16,
    new Map([
      ["PRB", 5],
      ["PTH", 3],
      ["ROL", 6],
      ["VAR", 16],
    ]),
  ],
  [17, new Map([["RXO", 24]])],
  [
    18,
    new Map([
      ["GOL", 11],
      ["NTE", 25],
      ["OBX", 18],
      ["ORC", 10],
      ["PRB", 5],
      ["PTH", 3],
    ]),
  ],
  [
    19,
    new Map([
      ["GOL", 11],
      ["OBX", 18],
      ["ORC", 10],
      ["PRB", 5],
      ["PTH", 3],
      ["ROL", 19],
      ["VAR", 26],
    ]),
  ],
  [
    20,
    new Map([
      ["GOL", 11],
      ["OBX", 18],
      ["ORC", 10],
      ["PRB", 5],
      ["PTH", 3],
      ["ROL", 19],
      ["VAR", 20],
    ]),
  ],
  [
    21,
    new Map([
      ["GOL", 11],
      ["NTE", 21],
      ["OBX", 18],
      ["ORC", 10],
      ["PRB", 5],
      ["PTH", 3],
      ["ROL", 19],
      ["VAR", 20],
    ]),
  ],
  [
    22,
    new Map([
      ["GOL", 11],
      ["NTE", 22],
      ["OBX", 12],
      ["ORC", 10],
      ["PRB", 5],
      ["PTH", 3],
    ]),
  ],
  [
    23,
    new Map([
      ["GOL", 11],
      ["OBX", 12],
      ["ORC", 10],
      ["PRB", 5],
      ["PTH", 3],
      ["ROL", 13],
      ["VAR", 23],
    ]),
  ],
  [
    24,
    new Map([
      ["NTE", 29],
      ["OBX", 27],
      ["ORC", 10],
      ["PRB", 5],
      ["PTH", 3],
      ["VAR", 28],
    ]),
  ],
  [
    25,
    new Map([
      ["GOL", 11],
      ["NTE", 25],
      ["OBX", 18],
      ["ORC", 10],
      ["PRB", 5],
      ["PTH", 3],
    ]),
  ],
  [
    26,
    new Map([
      ["GOL", 11],
      ["OBX", 18],
      ["ORC", 10],
      ["PRB", 5],
      ["PTH", 3],
      ["ROL", 19],
      ["VAR", 26],
    ]),
  ],
  [
    27,
    new Map([
      ["NTE", 31],
      ["OBX", 27],
      ["ORC", 10],
      ["PRB", 5],
      ["PTH", 3],
      ["VAR", 30],
    ]),
  ],
  [
    28,
    new Map([
      ["OBX", 27],
      ["ORC", 10],
      ["PRB", 5],
      ["PTH", 3],
      ["VAR", 28],
    ]),
  ],
  [
    29,
    new Map([
      ["NTE", 29],
      ["OBX", 27],
      ["ORC", 10],
      ["PRB", 5],
      ["PTH", 3],
      ["VAR", 28],
    ]),
  ],
  [
    30,
    new Map([
      ["OBX", 27],
      ["ORC", 10],
      ["PRB", 5],
      ["PTH", 3],
      ["VAR", 30],
    ]),
  ],
  [
    31,
    new Map([
      ["NTE", 31],
      ["OBX", 27],
      ["ORC", 10],
      ["PRB", 5],
      ["PTH", 3],
      ["VAR", 30],
    ]),
  ],
]);
export const effects = {
  "10:OBR": {
    groupsClosed: [],
    groupsOpened: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/CHOICE",
    ],
  },
  "10:ORC": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "10:PRB": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/CHOICE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "10:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/CHOICE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "11:GOL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL"],
  },
  "11:OBX": {
    groupsClosed: ["PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION"],
  },
  "11:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "11:PRB": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "11:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "11:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE"],
  },
  "12:GOL": {
    groupsClosed: ["PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL"],
  },
  "12:OBX": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION"],
  },
  "12:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "12:PRB": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "12:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "13:GOL": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL"],
  },
  "13:OBX": {
    groupsClosed: ["PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION"],
  },
  "13:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "13:PRB": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "13:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "13:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE"],
  },
  "14:GOL": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL"],
  },
  "14:OBX": {
    groupsClosed: ["PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION"],
  },
  "14:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "14:PRB": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "14:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "14:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE"],
  },
  "15:GOL": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL"],
  },
  "15:OBX": {
    groupsClosed: ["PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION"],
  },
  "15:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "15:PRB": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "15:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "15:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE"],
  },
  "16:PRB": {
    groupsClosed: ["PPP_PCB/PATHWAY/PATHWAY_ROLE"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "16:PTH": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "16:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PATHWAY_ROLE"],
  },
  "18:GOL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL"],
  },
  "18:OBX": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION"],
  },
  "18:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "18:PRB": {
    groupsClosed: ["PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "18:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "19:GOL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL"],
  },
  "19:OBX": {
    groupsClosed: ["PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION"],
  },
  "19:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "19:PRB": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "19:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "19:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE"],
  },
  "20:GOL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL"],
  },
  "20:OBX": {
    groupsClosed: ["PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION"],
  },
  "20:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "20:PRB": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "20:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "20:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE"],
  },
  "21:GOL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL"],
  },
  "21:OBX": {
    groupsClosed: ["PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION"],
  },
  "21:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "21:PRB": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "21:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "21:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE"],
  },
  "22:GOL": {
    groupsClosed: ["PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL"],
  },
  "22:OBX": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION"],
  },
  "22:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "22:PRB": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "22:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "23:GOL": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL"],
  },
  "23:OBX": {
    groupsClosed: ["PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION"],
  },
  "23:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "23:PRB": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "23:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "23:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE"],
  },
  "24:NTE": {
    groupsClosed: ["PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/CHOICE"],
    groupsOpened: [],
  },
  "24:OBX": {
    groupsClosed: ["PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/CHOICE"],
    groupsOpened: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
  },
  "24:ORC": {
    groupsClosed: ["PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/CHOICE"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "24:PRB": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/CHOICE",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "24:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/CHOICE",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "24:VAR": {
    groupsClosed: ["PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/CHOICE"],
    groupsOpened: [],
  },
  "25:GOL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL"],
  },
  "25:OBX": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION"],
  },
  "25:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "25:PRB": {
    groupsClosed: ["PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "25:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "26:GOL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL"],
  },
  "26:OBX": {
    groupsClosed: ["PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION"],
  },
  "26:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "26:PRB": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "26:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "26:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE"],
  },
  "27:OBX": {
    groupsClosed: [],
    groupsOpened: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
  },
  "27:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "27:PRB": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "27:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "28:OBX": {
    groupsClosed: [],
    groupsOpened: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
  },
  "28:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "28:PRB": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "28:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "29:OBX": {
    groupsClosed: [],
    groupsOpened: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
  },
  "29:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "29:PRB": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "29:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "2:PTH": {
    groupsClosed: ["PPP_PCB/PATIENT_VISIT"],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "2:PV1": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATIENT_VISIT"],
  },
  "30:OBX": {
    groupsClosed: [],
    groupsOpened: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
  },
  "30:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "30:PRB": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "30:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "31:OBX": {
    groupsClosed: [],
    groupsOpened: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
  },
  "31:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "31:PRB": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "31:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "3:PRB": {
    groupsClosed: ["PPP_PCB/PATHWAY/PATHWAY_ROLE"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "3:PTH": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "3:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PATHWAY_ROLE"],
  },
  "4:PTH": {
    groupsClosed: ["PPP_PCB/PATIENT_VISIT"],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "5:GOL": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL"],
  },
  "5:OBX": {
    groupsClosed: ["PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION"],
  },
  "5:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "5:PRB": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "5:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "5:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE"],
  },
  "6:PRB": {
    groupsClosed: ["PPP_PCB/PATHWAY/PATHWAY_ROLE"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "6:PTH": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "6:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PATHWAY_ROLE"],
  },
  "7:PRB": {
    groupsClosed: ["PPP_PCB/PATHWAY/PATHWAY_ROLE"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "7:PTH": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "7:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PATHWAY_ROLE"],
  },
  "8:PRB": {
    groupsClosed: ["PPP_PCB/PATHWAY/PATHWAY_ROLE"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "8:PTH": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "8:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PATHWAY_ROLE"],
  },
  "9:PTH": {
    groupsClosed: ["PPP_PCB/PATIENT_VISIT"],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
} satisfies Readonly<
  Record<
    string,
    { groupsOpened: readonly string[]; groupsClosed: readonly string[] }
  >
>;
