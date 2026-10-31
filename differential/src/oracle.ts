import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

/**
 * A message in the shape of the Lean specification's `Message`
 * (`spec/Hl7v2/Spec/Message.lean`): MSH-1 and MSH-2 as five delimiter
 * characters, the MSH fields from MSH-3 on, and every later segment. A field
 * is a list of repetitions, a repetition a list of components, and a component
 * a list of subcomponents.
 */
export interface SpecMessage {
  delimiters: string;
  header: SpecField[];
  segments: { id: string; fields: SpecField[] }[];
}

export type SpecField = SpecSubcomponent[][][];

/**
 * A run of data characters, or an escape sequence of §2.7.2 to §2.7.8 held as
 * its escape code ID and data characters (`H` for `\H\`).
 */
export type SpecPiece = string | { sequence: string };

/**
 * A value: a string when it holds only data characters, otherwise its pieces,
 * with no empty run and no two runs side by side (`toSpecSubcomponent`).
 */
export type SpecSubcomponent = string | SpecPiece[];

/**
 * The one way to write `pieces` as a `SpecSubcomponent`: runs side by side
 * joined, empty runs dropped, and a plain string when no sequence is left.
 *
 * `["a", "b", { sequence: "H" }, ""]` → `["ab", { sequence: "H" }]`;
 * `["a", "b"]` → `"ab"`.
 */
export const toSpecSubcomponent = (pieces: SpecPiece[]): SpecSubcomponent => {
  const joined: SpecPiece[] = [];
  for (const piece of pieces) {
    const last = joined.at(-1);
    if (typeof piece === "string" && typeof last === "string") {
      joined[joined.length - 1] = last + piece;
    } else if (piece !== "") {
      joined.push(piece);
    }
  }
  if (joined.every((piece) => typeof piece === "string")) {
    return joined.join("");
  }
  return joined;
};

/** What the specification says about a message. */
export interface SpecAnswer {
  /** `encode m`: the text a sender writes. */
  text: string;
  /** `m.failures`: the names of the rules the message breaks. */
  failures: string[];
}

const oraclePath = new URL("../../spec/.lake/build/bin/oracle", import.meta.url)
  .pathname;

/**
 * Starts the specification's `oracle` program (`spec/Oracle.lean`, built by
 * `lake build oracle`). `ask` sends one message and resolves with the answer;
 * calls MUST NOT overlap. `close` ends the program.
 */
export const startOracle = () => {
  const child = spawn(oraclePath, { stdio: ["pipe", "pipe", "inherit"] });
  const lines = createInterface({ input: child.stdout })[
    Symbol.asyncIterator
  ]();

  const ask = async (message: SpecMessage): Promise<SpecAnswer> => {
    child.stdin.write(`${JSON.stringify(message)}\n`);
    const { value, done } = await lines.next();
    if (done) {
      throw new Error("The specification oracle exited before answering.");
    }
    const answer = JSON.parse(value) as SpecAnswer | { error: string };
    if ("error" in answer) {
      throw new Error(
        `The specification oracle refused the message: ${answer.error}`
      );
    }
    return answer;
  };

  const close = () => {
    child.stdin.end();
  };

  return { ask, close };
};
