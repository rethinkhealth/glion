import type { Group, Nodes, Root, Segment } from "@glion/ast";
import { select, value } from "@glion/util-query";
import type { VFile } from "vfile";

import { messages, ruleIds, source as messageSource } from "./messages";
import type { PathIndex } from "./paths";
import { encloses, indexPaths, isDelimiterLeaf, scopeSteps } from "./paths";
import { applyTransform } from "./transforms";
import type {
  Condition,
  DatatypeRule,
  ElementRule,
  FhirBundle,
  Leaf,
  ProvenanceEntry,
  ResourceRule,
  TransformName,
  TranslationSchema,
} from "./types";

const TARGET_STEP = /^([A-Za-z][A-Za-z0-9]*)(?:\[(\d+)])?$/;
const REPEATING_TARGET = /\[]$/;

/** A resource under construction, and the group instance it belongs to. */
interface Built {
  body: Record<string, unknown>;
  id: string;
  resourceType: string;
  rule: ResourceRule;
  scopeNode: Group | Root;
  scopePath: string;
  slot: string;
}

/** One populated leaf, read. */
interface Hit {
  ancestors: Nodes[];
  leafPath: string;
  node: Nodes;
  raw: string;
}

/** What every step of one translation shares. */
interface Run {
  consulted: Set<string>;
  file: VFile;
  index: PathIndex;
  provenance: ProvenanceEntry[];
  read: Set<string>;
  schema: TranslationSchema;
  tree: Root;
}

/** How one value reaches one FHIR element. */
interface Route {
  transform?: TransformName;
  via: string;
  vocabulary?: string;
}

/** Everything one pass over the resource rules carries between instances. */
interface BuildState {
  applied: Set<string>;
  built: Map<string, Built>;
  counters: Map<string, number>;
  order: Built[];
  position: number;
}

/** The path of `source` under the anchor segment's own path. */
function absolutePath(anchorPath: string, source: string): string {
  return `${anchorPath}${source.slice(source.indexOf("."))}`;
}

/** The datatype row's target appended to the element rule's target. */
function joinTarget(base: string, suffix: string): string {
  return suffix === "$value" ? base : `${base}.${suffix}`;
}

/** The part of a datatype row's source below its datatype: `CX.1` is `1`. */
function componentSuffix(rowSource: string): string {
  return rowSource.slice(rowSource.indexOf(".") + 1);
}

function setAt(
  body: Record<string, unknown>,
  path: string,
  written: string
): void {
  const steps = path.split(".");
  let cursor = body;
  for (const [position, step] of steps.entries()) {
    const parsed = TARGET_STEP.exec(step);
    // Stryker disable next-line ConditionalExpression,BlockStatement,StringLiteral: assertSchema rejects a target that is not an element path, so this guard never fires
    if (!parsed) {
      throw new Error(
        `Element target \`${path}\` is not a FHIR element path; this is a bug in @glion/to-fhir, please report it.`
      );
    }
    const key = parsed[1] as string;
    const last = position === steps.length - 1;
    if (parsed[2] === undefined) {
      if (last) {
        cursor[key] = written;
        return;
      }
      cursor[key] ??= {};
      cursor = cursor[key] as Record<string, unknown>;
      continue;
    }
    // Stryker disable next-line ArithmeticOperator: equivalent; compact() closes the holes, so an index decides order and not position
    const slot = Number(parsed[2]) - 1;
    cursor[key] ??= [];
    const list = cursor[key] as unknown[];
    if (last) {
      list[slot] = written;
      return;
    }
    list[slot] ??= {};
    cursor = list[slot] as Record<string, unknown>;
  }
}

/**
 * Drop array holes and empty objects.
 *
 * A FHIR array has no holes, and a write a rule declined leaves no empty
 * object behind it.
 */
function compact(input: unknown): unknown {
  if (Array.isArray(input)) {
    const present = input
      .filter((item) => item !== undefined)
      .map(compact)
      .filter((item) => item !== undefined);
    return present.length === 0 ? undefined : present;
  }
  if (typeof input !== "object" || input === null) {
    return input;
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(input)) {
    const kept = compact(item);
    if (kept !== undefined) {
      out[key] = kept;
    }
  }
  return Object.keys(out).length === 0 ? undefined : out;
}

function report(
  run: Run,
  text: string,
  ruleId: string,
  at: { ancestors?: Nodes[]; node?: Nodes }
) {
  const message = run.file.message(text, {
    ancestors: at.ancestors,
    place: at.node?.position,
  });
  message.ruleId = ruleId;
  message.source = messageSource;
  return message;
}

function readLeaf(run: Run, path: string): Hit | undefined {
  const hit = value(run.tree, path);
  if (!hit || hit.value === null || hit.value === "") {
    return undefined;
  }
  return {
    ancestors: hit.ancestors,
    leafPath: run.index.pathOf(hit.node) ?? path,
    node: hit.node,
    raw: hit.value,
  };
}

/**
 * Read a leaf to decide a condition.
 *
 * A field a condition read did not reach FHIR, and is not a field the mapping
 * ignored either, so it is reported as neither.
 */
function consult(run: Run, path: string): Hit | undefined {
  const hit = readLeaf(run, path);
  if (hit) {
    run.consulted.add(hit.leafPath);
  }
  return hit;
}

function satisfied(
  run: Run,
  condition: Condition,
  anchorPath: string
): boolean {
  if ("valued" in condition) {
    return (
      consult(run, absolutePath(anchorPath, condition.valued)) !== undefined
    );
  }
  return consult(run, absolutePath(anchorPath, condition.empty)) === undefined;
}

function convert(
  run: Run,
  transform: TransformName,
  hit: Hit
): string | undefined {
  const result = applyTransform(transform, hit.raw);
  if (result.ok) {
    return result.value;
  }
  const text =
    result.cause === "hl7-date"
      ? messages.dateConversion(hit.leafPath, hit.raw)
      : messages.dateTimeConversion(hit.leafPath, hit.raw);
  report(run, text, ruleIds.conversionFailure, hit).actual = hit.raw;
  return undefined;
}

function translateCode(
  run: Run,
  vocabulary: string,
  hit: Hit,
  into: { fhirPath: string; target: Built }
): string | undefined {
  const map = run.schema.vocabularies[vocabulary];
  // Stryker disable next-line ConditionalExpression,BlockStatement,StringLiteral: assertSchema rejects a concept map the schema does not define, so this guard never fires
  if (map === undefined) {
    throw new Error(
      `Element rule names concept map \`${vocabulary}\`, which the schema does not define; this is a bug in @glion/to-fhir, please report it.`
    );
  }
  const entry = map.codes[hit.raw];
  if (entry === undefined) {
    const message = report(
      run,
      messages.terminologyUnknown(hit.leafPath, hit.raw, map.v2Table),
      ruleIds.terminologyGap,
      hit
    );
    message.actual = hit.raw;
    message.expected = Object.keys(map.codes).toSorted();
    return undefined;
  }
  if ("unmapped" in entry) {
    const message = report(
      run,
      entry.unmapped === "declined"
        ? messages.terminologyDeclined(hit.leafPath, hit.raw, map.v2Table)
        : messages.terminologyError(hit.leafPath, hit.raw, map.v2Table),
      ruleIds.terminologyGap,
      hit
    );
    message.actual = hit.raw;
    message.note = entry.text;
    return undefined;
  }
  // A FHIR `Coding.code` takes its system from a sibling element; a plain
  // `code` element takes it from the element definition.
  if (into.fhirPath.endsWith(".code")) {
    const sibling = `${into.fhirPath.slice(0, -".code".length)}.system`;
    setAt(into.target.body, sibling, entry.system);
  }
  return entry.code;
}

function writeLiteral(
  run: Run,
  target: Built,
  fhirPath: string,
  assign: string
): void {
  setAt(target.body, fhirPath, assign);
  run.provenance.push({
    fhir: fhirPath,
    resource: `${target.resourceType}/${target.id}`,
    slot: target.slot,
    v2: null,
    via: "literal",
    written: assign,
  });
}

function writeValue(
  run: Run,
  target: Built,
  fhirPath: string,
  route: Route,
  hit: Hit
): void {
  let out = hit.raw;
  let via = route.via;

  if (route.transform) {
    const converted = convert(run, route.transform, hit);
    if (converted === undefined) {
      return;
    }
    out = converted;
    via = `${via} + ${route.transform}`;
  }

  if (route.vocabulary) {
    const code = translateCode(
      run,
      route.vocabulary,
      { ...hit, raw: out },
      { fhirPath, target }
    );
    if (code === undefined) {
      return;
    }
    out = code;
    via = `${via} + vocab:${route.vocabulary}`;
  }

  run.read.add(hit.leafPath);
  setAt(target.body, fhirPath, out);
  run.provenance.push({
    fhir: fhirPath,
    resource: `${target.resourceType}/${target.id}`,
    slot: target.slot,
    v2: hit.leafPath,
    via,
    written: out,
  });
}

/** Write one FHIR occurrence per HL7v2 field repetition. */
function applyEach(
  run: Run,
  target: Built,
  element: ElementRule,
  anchorPath: string
): void {
  const source = element.source as string;
  // A path read at runtime carries no literal type to infer the node from.
  const field = select(run.tree, absolutePath(anchorPath, source)) as {
    node: Nodes;
  } | null;
  const repetitions =
    field && "children" in field.node ? field.node.children.length : 0;
  for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    // The index omits the repetition index on a field that has only one, so
    // the path read here matches the path it recorded.
    const suffix = repetitions > 1 ? `[${repetition}]` : "";
    applyElement(
      run,
      target,
      {
        ...element,
        each: false,
        source: `${source}${suffix}`,
        target: element.target.replace(REPEATING_TARGET, `[${repetition}]`),
      },
      anchorPath
    );
  }
}

/** Expand one HL7v2 datatype into the FHIR datatype it maps to. */
function applyDatatype(
  run: Run,
  target: Built,
  element: ElementRule,
  rows: DatatypeRule[],
  base: string
): void {
  for (const row of rows) {
    const suffix = componentSuffix(row.source);
    const whole = row.source === "$value";
    const hit = readLeaf(run, whole ? base : `${base}.${suffix}`);
    if (hit === undefined) {
      continue;
    }
    writeValue(
      run,
      target,
      joinTarget(element.target, row.target),
      {
        transform: row.transform ?? element.transform,
        via: `dt:${element.datatype}`,
        vocabulary: row.vocabulary ?? element.vocabulary,
      },
      hit
    );
  }
}

function applyElement(
  run: Run,
  target: Built,
  element: ElementRule,
  anchorPath: string
): void {
  if (element.when && !satisfied(run, element.when, anchorPath)) {
    return;
  }
  if (element.source === undefined) {
    if (element.assign !== undefined) {
      writeLiteral(run, target, element.target, element.assign);
    }
    return;
  }
  if (element.each) {
    applyEach(run, target, element, anchorPath);
    return;
  }

  const base = absolutePath(anchorPath, element.source);

  if (element.datatype !== undefined) {
    const rows = run.schema.datatypes[element.datatype];
    // Stryker disable next-line ConditionalExpression,BlockStatement,StringLiteral: assertSchema rejects a datatype map the schema does not define, so this guard never fires
    if (rows === undefined) {
      throw new Error(
        `Element rule names datatype map \`${element.datatype}\`, which the schema does not define; this is a bug in @glion/to-fhir, please report it.`
      );
    }
    applyDatatype(run, target, element, rows, base);
    return;
  }

  const hit = readLeaf(run, base);
  if (hit !== undefined) {
    writeValue(
      run,
      target,
      element.target,
      {
        transform: element.transform,
        via: "direct",
        vocabulary: element.vocabulary,
      },
      hit
    );
  }
}

/** The anchor segments of one rule inside one group instance. */
function anchorsIn(container: Group | Root, anchor: string): Segment[] {
  const children: Nodes[] = container.children;
  return children.filter(
    (child): child is Segment =>
      child.type === "segment" && child.name === anchor
  );
}

/** The resource `key` names, created on the first rule that writes it. */
function resourceFor(
  rule: ResourceRule,
  key: string,
  instance: { node: Group | Root; path: string },
  state: BuildState
): Built {
  const existing = state.built.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const n = (state.counters.get(rule.resourceType) ?? 0) + 1;
  state.counters.set(rule.resourceType, n);
  const target: Built = {
    body: { resourceType: rule.resourceType },
    id: `${rule.resourceType.toLowerCase()}-${n}`,
    resourceType: rule.resourceType,
    rule,
    scopeNode: instance.node,
    scopePath: instance.path,
    slot: rule.slot,
  };
  state.built.set(key, target);
  state.order.push(target);
  return target;
}

/** Produce the resources one rule writes for one group instance. */
function buildInstance(
  run: Run,
  rule: ResourceRule,
  instance: { node: Group | Root; path: string },
  state: BuildState
): void {
  const key = `${rule.slot}@${instance.path}`;
  const once = `${state.position}@${key}`;
  for (const anchor of anchorsIn(instance.node, rule.anchor)) {
    const anchorPath = run.index.pathOf(anchor);
    // Stryker disable next-line ConditionalExpression,BlockStatement: indexPaths walked every segment this returns, so this guard never fires
    if (anchorPath === undefined) {
      continue;
    }
    if (state.applied.has(once)) {
      report(
        run,
        messages.duplicateAnchor(rule.anchor, rule.slot),
        ruleIds.duplicateAnchor,
        {
          ancestors: [anchor],
          node: anchor,
        }
      );
      continue;
    }
    state.applied.add(once);
    const target = resourceFor(rule, key, instance, state);
    for (const element of rule.elements) {
      applyElement(run, target, element, anchorPath);
    }
  }
}

function buildResources(run: Run): Built[] {
  const state: BuildState = {
    applied: new Set(),
    built: new Map(),
    counters: new Map(),
    order: [],
    position: 0,
  };

  for (const [position, rule] of run.schema.resources.entries()) {
    state.position = position;
    const instances = run.index.scopes.get(rule.scope) ?? [];
    // A message whose segments did not group carries the data outside any
    // group the schema can scope to, and would translate to nothing.
    if (instances.length === 0) {
      if (run.index.segmentNames.has(rule.anchor)) {
        report(
          run,
          messages.scopeAbsent(rule.map, rule.scope, rule.anchor),
          ruleIds.scopeAbsent,
          {}
        );
      }
      continue;
    }
    for (const instance of instances) {
      buildInstance(run, rule, instance, state);
    }
  }
  return state.order;
}

/** The resource filling `slot` in the nearest group enclosing `resource`. */
function nearestFilling(
  order: Built[],
  resource: Built,
  slot: string
): Built | undefined {
  return order
    .filter(
      (other) =>
        other.slot === slot &&
        other !== resource &&
        encloses(other.scopePath, resource.scopePath)
    )
    .toSorted(
      (a, b) => scopeSteps(b.scopePath).length - scopeSteps(a.scopePath).length
    )[0];
}

function wireReferences(run: Run, order: Built[]): void {
  for (const resource of order) {
    for (const reference of resource.rule.references ?? []) {
      const nearest = nearestFilling(order, resource, reference.slot);
      if (nearest === undefined) {
        report(
          run,
          messages.unresolvedReference(
            resource.resourceType,
            reference.target,
            reference.slot
          ),
          ruleIds.unresolvedReference,
          { node: resource.scopeNode }
        );
        continue;
      }
      const written = `${nearest.resourceType}/${nearest.id}`;
      setAt(resource.body, reference.target, written);
      run.provenance.push({
        fhir: reference.target,
        resource: `${resource.resourceType}/${resource.id}`,
        slot: resource.slot,
        v2: null,
        via: `reference:${reference.slot}`,
        written,
      });
    }
  }
}

/** Report one populated leaf that neither reached FHIR nor decided a rule. */
function reportUnmapped(
  run: Run,
  leaf: Leaf,
  anchored: Set<string>,
  bySegment: Map<string, number>
): void {
  if (!anchored.has(leaf.segment)) {
    bySegment.set(leaf.segment, (bySegment.get(leaf.segment) ?? 0) + 1);
    return;
  }
  const message = report(
    run,
    leaf.name === undefined
      ? messages.unmappedFieldUnnamed(leaf.path, leaf.value)
      : messages.unmappedField(leaf.path, leaf.name, leaf.value),
    ruleIds.unmappedField,
    { node: leaf.node }
  );
  message.actual = leaf.value;
}

/** Account for every populated leaf, and report the ones nothing read. */
function account(run: Run, resources: number): void {
  const anchored = new Set(run.schema.resources.map((rule) => rule.anchor));
  const bySegment = new Map<string, number>();
  const content = run.index.leaves.filter((leaf) => !isDelimiterLeaf(leaf));
  const unmapped = content.filter(
    (leaf) => !(run.read.has(leaf.path) || run.consulted.has(leaf.path))
  );
  // A field a condition read and an element then wrote is read, not consulted,
  // so that the three counts partition the populated leaves.
  const consultedOnly = [...run.consulted].filter(
    (path) => !run.read.has(path)
  );

  for (const leaf of unmapped) {
    reportUnmapped(run, leaf, anchored, bySegment);
  }
  for (const [segment, leafCount] of bySegment) {
    report(
      run,
      messages.unmappedSegment(segment, leafCount),
      ruleIds.unmappedSegment,
      {}
    );
  }

  run.file.data.provenance = run.provenance;
  run.file.data.fhirCoverage = {
    consulted: consultedOnly.length,
    populated: content.length,
    read: run.read.size,
    resources,
    unmapped: unmapped.length,
  };
}

/**
 * Compile a grouped HL7v2 tree into a FHIR Bundle.
 *
 * Reports every populated field the schema does not read, every code the
 * mapping cannot translate, every conversion that fails, and every reference
 * that cannot be resolved, as messages on `file`. Writes the provenance of
 * every element and the coverage of the message to `file.data`.
 *
 * The schema MUST have passed `assertSchema`.
 *
 * @param tree - A tree that has been grouped and field-annotated.
 */
export function translate(
  tree: Root,
  schema: TranslationSchema,
  file: VFile
): FhirBundle {
  const run: Run = {
    consulted: new Set(),
    file,
    index: indexPaths(tree),
    provenance: [],
    read: new Set(),
    schema,
    tree,
  };

  const order = buildResources(run);
  wireReferences(run, order);
  account(run, order.length);

  return {
    entry: order.map((resource) => ({
      fullUrl: `urn:uuid:${resource.id}`,
      resource: compact(resource.body) as Record<string, unknown>,
    })),
    resourceType: "Bundle",
    type: "collection",
  };
}
