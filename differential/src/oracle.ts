import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

/**
 * A message in the shape of the Lean specification's `Message`
 * (`spec/Hl7v2/Spec/Message.lean`): MSH-1 and MSH-2 as five delimiter
 * characters, the MSH fields from MSH-3 on, and every later segment. A field
 * is a list of repetitions, a repetition a list of components, and a component
 * a list of subcomponent strings.
 */
export interface SpecMessage {
  delimiters: string;
  header: SpecField[];
  segments: { id: string; fields: SpecField[] }[];
}

export type SpecField = string[][][];

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
