// Generated profile automaton for PPP_PCB (v2.8.2)

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
      ["NTE", 10],
      ["PRB", 7],
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
      ["GOL", 13],
      ["NTE", 17],
      ["OBX", 14],
      ["ORC", 12],
      ["PRB", 7],
      ["PTH", 5],
      ["ROL", 15],
      ["VAR", 16],
    ]),
  ],
  [
    8,
    new Map([
      ["PRB", 7],
      ["PTH", 5],
      ["ROL", 8],
      ["VAR", 18],
    ]),
  ],
  [
    9,
    new Map([
      ["PRB", 7],
      ["PTH", 5],
      ["ROL", 8],
      ["VAR", 9],
    ]),
  ],
  [
    10,
    new Map([
      ["NTE", 10],
      ["PRB", 7],
      ["PTH", 5],
      ["ROL", 8],
      ["VAR", 9],
    ]),
  ],
  [11, new Map([["PTH", 5]])],
  [
    12,
    new Map([
      ["OBR", 19],
      ["ORC", 12],
      ["PRB", 7],
      ["PTH", 5],
    ]),
  ],
  [
    13,
    new Map([
      ["GOL", 13],
      ["NTE", 23],
      ["OBX", 20],
      ["ORC", 12],
      ["PRB", 7],
      ["PTH", 5],
      ["ROL", 21],
      ["VAR", 22],
    ]),
  ],
  [
    14,
    new Map([
      ["GOL", 13],
      ["NTE", 24],
      ["OBX", 14],
      ["ORC", 12],
      ["PRB", 7],
      ["PRT", 25],
      ["PTH", 5],
    ]),
  ],
  [
    15,
    new Map([
      ["GOL", 13],
      ["OBX", 14],
      ["ORC", 12],
      ["PRB", 7],
      ["PTH", 5],
      ["ROL", 15],
      ["VAR", 26],
    ]),
  ],
  [
    16,
    new Map([
      ["GOL", 13],
      ["OBX", 14],
      ["ORC", 12],
      ["PRB", 7],
      ["PTH", 5],
      ["ROL", 15],
      ["VAR", 16],
    ]),
  ],
  [
    17,
    new Map([
      ["GOL", 13],
      ["NTE", 17],
      ["OBX", 14],
      ["ORC", 12],
      ["PRB", 7],
      ["PTH", 5],
      ["ROL", 15],
      ["VAR", 16],
    ]),
  ],
  [
    18,
    new Map([
      ["PRB", 7],
      ["PTH", 5],
      ["ROL", 8],
      ["VAR", 18],
    ]),
  ],
  [19, new Map([["Hxx", 27]])],
  [
    20,
    new Map([
      ["GOL", 13],
      ["NTE", 28],
      ["OBX", 20],
      ["ORC", 12],
      ["PRB", 7],
      ["PRT", 29],
      ["PTH", 5],
    ]),
  ],
  [
    21,
    new Map([
      ["GOL", 13],
      ["OBX", 20],
      ["ORC", 12],
      ["PRB", 7],
      ["PTH", 5],
      ["ROL", 21],
      ["VAR", 30],
    ]),
  ],
  [
    22,
    new Map([
      ["GOL", 13],
      ["OBX", 20],
      ["ORC", 12],
      ["PRB", 7],
      ["PTH", 5],
      ["ROL", 21],
      ["VAR", 22],
    ]),
  ],
  [
    23,
    new Map([
      ["GOL", 13],
      ["NTE", 23],
      ["OBX", 20],
      ["ORC", 12],
      ["PRB", 7],
      ["PTH", 5],
      ["ROL", 21],
      ["VAR", 22],
    ]),
  ],
  [
    24,
    new Map([
      ["GOL", 13],
      ["NTE", 24],
      ["OBX", 14],
      ["ORC", 12],
      ["PRB", 7],
      ["PTH", 5],
    ]),
  ],
  [
    25,
    new Map([
      ["GOL", 13],
      ["NTE", 24],
      ["OBX", 14],
      ["ORC", 12],
      ["PRB", 7],
      ["PRT", 25],
      ["PTH", 5],
    ]),
  ],
  [
    26,
    new Map([
      ["GOL", 13],
      ["OBX", 14],
      ["ORC", 12],
      ["PRB", 7],
      ["PTH", 5],
      ["ROL", 15],
      ["VAR", 26],
    ]),
  ],
  [
    27,
    new Map([
      ["NTE", 33],
      ["OBX", 31],
      ["ORC", 12],
      ["PRB", 7],
      ["PTH", 5],
      ["VAR", 32],
    ]),
  ],
  [
    28,
    new Map([
      ["GOL", 13],
      ["NTE", 28],
      ["OBX", 20],
      ["ORC", 12],
      ["PRB", 7],
      ["PTH", 5],
    ]),
  ],
  [
    29,
    new Map([
      ["GOL", 13],
      ["NTE", 28],
      ["OBX", 20],
      ["ORC", 12],
      ["PRB", 7],
      ["PRT", 29],
      ["PTH", 5],
    ]),
  ],
  [
    30,
    new Map([
      ["GOL", 13],
      ["OBX", 20],
      ["ORC", 12],
      ["PRB", 7],
      ["PTH", 5],
      ["ROL", 21],
      ["VAR", 30],
    ]),
  ],
  [
    31,
    new Map([
      ["NTE", 35],
      ["OBX", 31],
      ["ORC", 12],
      ["PRB", 7],
      ["PRT", 36],
      ["PTH", 5],
      ["VAR", 34],
    ]),
  ],
  [
    32,
    new Map([
      ["OBX", 31],
      ["ORC", 12],
      ["PRB", 7],
      ["PTH", 5],
      ["VAR", 32],
    ]),
  ],
  [
    33,
    new Map([
      ["NTE", 33],
      ["OBX", 31],
      ["ORC", 12],
      ["PRB", 7],
      ["PTH", 5],
      ["VAR", 32],
    ]),
  ],
  [
    34,
    new Map([
      ["OBX", 31],
      ["ORC", 12],
      ["PRB", 7],
      ["PTH", 5],
      ["VAR", 34],
    ]),
  ],
  [
    35,
    new Map([
      ["NTE", 35],
      ["OBX", 31],
      ["ORC", 12],
      ["PRB", 7],
      ["PTH", 5],
      ["VAR", 34],
    ]),
  ],
  [
    36,
    new Map([
      ["NTE", 35],
      ["OBX", 31],
      ["ORC", 12],
      ["PRB", 7],
      ["PRT", 36],
      ["PTH", 5],
      ["VAR", 34],
    ]),
  ],
]);
export const effects = {
  "10:PRB": {
    groupsClosed: ["PPP_PCB/PATHWAY/PATHWAY_ROLE"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "10:PTH": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "10:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PATHWAY_ROLE"],
  },
  "11:PTH": {
    groupsClosed: ["PPP_PCB/PATIENT_VISIT"],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "12:OBR": {
    groupsClosed: [],
    groupsOpened: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/CHOICE",
    ],
  },
  "12:ORC": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "12:PRB": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/CHOICE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "12:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/CHOICE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "13:GOL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL"],
  },
  "13:OBX": {
    groupsClosed: ["PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION"],
  },
  "13:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "13:PRB": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "13:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "13:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE"],
  },
  "14:GOL": {
    groupsClosed: ["PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL"],
  },
  "14:OBX": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION"],
  },
  "14:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION",
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
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
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
  "16:GOL": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL"],
  },
  "16:OBX": {
    groupsClosed: ["PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION"],
  },
  "16:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "16:PRB": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "16:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "16:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE"],
  },
  "17:GOL": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL"],
  },
  "17:OBX": {
    groupsClosed: ["PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION"],
  },
  "17:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "17:PRB": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "17:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "17:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE"],
  },
  "18:PRB": {
    groupsClosed: ["PPP_PCB/PATHWAY/PATHWAY_ROLE"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "18:PTH": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "18:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PATHWAY_ROLE"],
  },
  "20:GOL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL"],
  },
  "20:OBX": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION"],
  },
  "20:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "20:PRB": {
    groupsClosed: ["PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "20:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
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
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL"],
  },
  "22:OBX": {
    groupsClosed: ["PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION"],
  },
  "22:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "22:PRB": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "22:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "22:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE"],
  },
  "23:GOL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL"],
  },
  "23:OBX": {
    groupsClosed: ["PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION"],
  },
  "23:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "23:PRB": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "23:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "23:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE"],
  },
  "24:GOL": {
    groupsClosed: ["PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL"],
  },
  "24:OBX": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION"],
  },
  "24:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "24:PRB": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "24:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "25:GOL": {
    groupsClosed: ["PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL"],
  },
  "25:OBX": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION"],
  },
  "25:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "25:PRB": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "25:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "26:GOL": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL"],
  },
  "26:OBX": {
    groupsClosed: ["PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION"],
  },
  "26:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "26:PRB": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "26:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "26:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE"],
  },
  "27:NTE": {
    groupsClosed: ["PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/CHOICE"],
    groupsOpened: [],
  },
  "27:OBX": {
    groupsClosed: ["PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/CHOICE"],
    groupsOpened: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
  },
  "27:ORC": {
    groupsClosed: ["PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/CHOICE"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "27:PRB": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/CHOICE",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "27:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/CHOICE",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "27:VAR": {
    groupsClosed: ["PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/CHOICE"],
    groupsOpened: [],
  },
  "28:GOL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL"],
  },
  "28:OBX": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION"],
  },
  "28:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "28:PRB": {
    groupsClosed: ["PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "28:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "29:GOL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL"],
  },
  "29:OBX": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION"],
  },
  "29:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "29:PRB": {
    groupsClosed: ["PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "29:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
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
  "30:GOL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL"],
  },
  "30:OBX": {
    groupsClosed: ["PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION"],
  },
  "30:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "30:PRB": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "30:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "30:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL/GOAL_ROLE"],
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
  "32:OBX": {
    groupsClosed: [],
    groupsOpened: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
  },
  "32:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "32:PRB": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "32:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "33:OBX": {
    groupsClosed: [],
    groupsOpened: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
  },
  "33:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "33:PRB": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "33:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "34:OBX": {
    groupsClosed: [],
    groupsOpened: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
  },
  "34:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "34:PRB": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "34:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "35:OBX": {
    groupsClosed: [],
    groupsOpened: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
  },
  "35:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "35:PRB": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "35:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "36:OBX": {
    groupsClosed: [],
    groupsOpened: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
  },
  "36:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "36:PRB": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "36:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER/ORDER_DETAIL/ORDER_OBSERVATION",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "5:PRB": {
    groupsClosed: ["PPP_PCB/PATHWAY/PATHWAY_ROLE"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "5:PTH": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "5:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PATHWAY_ROLE"],
  },
  "6:PTH": {
    groupsClosed: ["PPP_PCB/PATIENT_VISIT"],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "7:GOL": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/GOAL"],
  },
  "7:OBX": {
    groupsClosed: ["PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION"],
  },
  "7:ORC": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/ORDER"],
  },
  "7:PRB": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "7:PTH": {
    groupsClosed: [
      "PPP_PCB/PATHWAY/PROBLEM/GOAL",
      "PPP_PCB/PATHWAY/PROBLEM/ORDER",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_OBSERVATION",
      "PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE",
    ],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "7:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM/PROBLEM_ROLE"],
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
  "9:PRB": {
    groupsClosed: ["PPP_PCB/PATHWAY/PATHWAY_ROLE"],
    groupsOpened: ["PPP_PCB/PATHWAY/PROBLEM"],
  },
  "9:PTH": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY"],
  },
  "9:ROL": {
    groupsClosed: [],
    groupsOpened: ["PPP_PCB/PATHWAY/PATHWAY_ROLE"],
  },
} satisfies Readonly<
  Record<
    string,
    { groupsOpened: readonly string[]; groupsClosed: readonly string[] }
  >
>;
