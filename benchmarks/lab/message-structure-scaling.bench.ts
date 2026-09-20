/**
 * Lab sweep — how segment-order validation and structure matching scale with
 * message size, next to the stages around them.
 *
 * Not CodSpeed-tracked: run with `pnpm bench:lab` when touching
 * `@glion/profiles`' message structures or
 * `@glion/lint-profile-events-segments-order`.
 *
 * The question it answers: is the engine linear in the number of segments, and
 * where is the ceiling? The engine never backtracks, so doubling the segments
 * should double the time. A curve that bends upward means a regression in the
 * engine, not a slow machine.
 *
 * Three tiers, from the engine alone to the whole pipeline. Each tier stops at
 * a smaller size than the one before, because each adds work per segment:
 *
 * 1. Engine: `runner` and `matchStructure` over segment names only.
 * 2. Tree: parsing, and the segment-order lint over a parsed tree.
 * 3. Pipeline: every profile lint rule, and the full `@glion/hl7v2` pipeline.
 *
 * Reading the output: every bench is named `<stage> | <shape> n=<segments>
 * bytes=<message size>`. Compare one stage across sizes for the scaling curve,
 * and the stages at one size for what share of the pipeline the engine is.
 *
 * Two ORU_R01 v2.5.1 shapes, from 10 to 100,000 segments:
 *
 * - "results": one order with many OBX, the common lab result. The engine stays
 *   inside one repeating group.
 * - "orders": many OBR/OBX pairs, a new ORDER_OBSERVATION every other segment.
 *   The engine closes and reopens nested groups constantly, its worst case.
 */
import { parseHL7v2 as pipeline } from "@glion/hl7v2";
import hl7v2LintSegmentOrder from "@glion/lint-profile-events-segments-order";
import { parseHL7v2 } from "@glion/parser";
import hl7v2PresetLintProfileRecommended from "@glion/preset-lint-profile-recommended";
import { matchStructure, profiles, runner } from "@glion/profiles";
import { unified } from "unified";
import { VFile } from "vfile";
import { bench, describe } from "vitest";

import { ORU_R01_HEADER, hl7, oruObx, repeat } from "../fixtures/messages";

// Segment counts per tier, about three points per decade so the curve is
// readable on a log scale. A typical message is 10 to 100 segments; the larger
// sizes are there to find the ceiling, not because such messages are common.
const ENGINE_SIZES = [10, 30, 100, 300, 1000, 3000, 10_000, 30_000, 100_000];
const TREE_SIZES = [10, 30, 100, 300, 1000, 3000, 10_000, 30_000];
const PIPELINE_SIZES = [10, 30, 100, 300, 1000, 3000];

// Loaded once, outside every bench: the sweep measures running a structure,
// not loading it.
const structure = await profiles.events.load("2.5.1", "ORU_R01");

// Builds a message of about `n` segments in each shape.
const shapes = {
  orders: (n: number) =>
    hl7(
      ORU_R01_HEADER[0] as string,
      ORU_R01_HEADER[1] as string,
      ...repeat(
        (i) => [
          `OBR|${i}||LAB${i}|CBC^Complete Blood Count`,
          `OBX|1|NM|WBC^White Blood Cell Count||${5 + (i % 10)}|10*9/L|4.5-11.0|N|||F`,
        ],
        Math.max(1, Math.floor((n - 2) / 2))
      ).flat()
    ),
  results: (n: number) =>
    hl7(
      ...ORU_R01_HEADER,
      ...repeat(oruObx, Math.max(1, n - ORU_R01_HEADER.length))
    ),
};

// The engine's input: segment names, without the cost of parsing.
const names = (text: string) =>
  parseHL7v2(text).children.map((node) =>
    node.type === "segment" ? node.name : ""
  );

// Large messages take long enough per run that three iterations are stable;
// small ones need a time budget to collect enough samples.
const options = (n: number) =>
  n >= 10_000 ? { iterations: 3, time: 0, warmupIterations: 1 } : { time: 200 };

for (const [shape, build] of Object.entries(shapes)) {
  describe(`scaling: ${shape}`, () => {
    // Tier 1: the engine alone, on segment names.
    for (const n of ENGINE_SIZES) {
      const text = build(n);
      const input = names(text);
      const label = `${shape} n=${input.length} bytes=${text.length}`;

      // A runner is single-use, so creating it is part of the per-message cost.
      bench(
        `runner | ${label}`,
        () => {
          const automaton = runner(structure);
          for (const name of input) {
            automaton.consume(name);
          }
        },
        options(n)
      );

      bench(
        `matchStructure | ${label}`,
        () => {
          matchStructure(structure, input);
        },
        options(n)
      );
    }

    // Tier 2: parsing, and the lint over a tree parsed outside the bench. The
    // lint is given the structure, so resolving it from MSH-9 is not measured.
    for (const n of TREE_SIZES) {
      const text = build(n);
      const tree = parseHL7v2(text);
      const label = `${shape} n=${tree.children.length} bytes=${text.length}`;
      const lint = unified().use(hl7v2LintSegmentOrder, {
        definition: structure,
      });

      bench(
        `parse | ${label}`,
        () => {
          parseHL7v2(text);
        },
        options(n)
      );

      bench(
        `segment-order lint | ${label}`,
        async () => {
          await lint.run(tree, new VFile());
        },
        options(n)
      );
    }

    // Tier 3: what a caller pays. The preset runs every profile lint rule on a
    // parsed tree; the pipeline also parses, decodes escapes, and serializes.
    for (const n of PIPELINE_SIZES) {
      const text = build(n);
      const tree = parseHL7v2(text);
      const label = `${shape} n=${tree.children.length} bytes=${text.length}`;
      const preset = unified().use(hl7v2PresetLintProfileRecommended);

      bench(
        `lint-profile preset | ${label}`,
        async () => {
          await preset.run(tree, new VFile());
        },
        options(n)
      );

      bench(
        `hl7v2 pipeline | ${label}`,
        async () => {
          await pipeline.process(text);
        },
        options(n)
      );
    }
  });
}
