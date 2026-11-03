# ADR 0014: `file.data` vs `node.data` — Where Pipeline Metadata Lives

## Status

Accepted — supersedes [ADR 0002](./0002-message-metadata-storage.md)

[ADR 0037](./0037-delimiters-are-read-from-the-tree.md) supersedes the delimiters part of this decision: they are read from the tree, and `file.data.delimiters` is removed.

## Context

The unified ecosystem provides two storage locations for metadata during processing:

- **`node.data`** — attached to AST nodes, travels with the tree
- **`file.data`** — attached to the VFile, scoped to the current processing run

ADR 0002 chose `Root.data` for all document-level metadata (delimiters, message info), reasoning that it was "document-intrinsic." In practice this created problems:

1. **Dual source of truth.** The parser stored delimiters in `Root.data.delimiters`, but the same information already existed in MSH-1/MSH-2 as actual field values. Changes to one didn't update the other.
2. **Builder gap.** Programmatically-constructed trees (via `m()`, `s()`, `f()`) never had `Root.data.delimiters`, so consumers silently fell back to defaults.
3. **Derivable data stored as if it were enrichment.** Delimiters and message info can be re-derived from the tree at any time — storing them on `Root.data` treated ephemeral cache as permanent annotation.

We needed a clearer principle for when data belongs on the tree vs. on the file.

## Decision

### The Principle

**Can it be re-derived from the tree alone?**

| Question                           | Answer | Storage     |
| ---------------------------------- | ------ | ----------- |
| Derivable from the tree structure? | Yes    | `file.data` |
| Requires external knowledge?       | Yes    | `node.data` |
| Pure processing state?             | Yes    | `file.data` |

### `file.data` — Pipeline-Scoped, Derivable Metadata

Use `file.data` for metadata that:

- Can be **computed from the tree** by any plugin at any time
- Is needed by **multiple plugins** during a single pipeline run
- Does **not need to survive** tree serialization (because it can be re-derived)

The annotator plugin computes it once and stores it on `file.data`. Downstream plugins read from `file.data` via their `(tree, file)` signature. Standalone tools (outside unified) derive on demand via a utility function or accept an explicit parameter.

**Examples:**

- `file.data.delimiters` — derived from MSH-1 and MSH-2
- `file.data.messageInfo` — derived from MSH-9 and MSH-12

### `node.data` — Persistent, Externally-Sourced Annotations

Use `node.data` for metadata that:

- Requires **external context** to produce (profile definitions, lookup tables, configuration)
- Should **travel with the node** — when a subtree is passed to another function, the annotation is still meaningful
- Cannot be **re-derived from the tree alone**

**Examples:**

- `field.data.name` — the human-readable field name from an HL7v2 profile ("Patient Name")
- `field.data.required` — optionality from a conformance profile
- `component.data.datatypeId` — datatype from a profile definition
- `fieldRepetition.data.kind` — semantic kind from external schema

### Standalone Tool Support

Tools that operate outside a unified pipeline (e.g., `toHl7v2(tree)`) won't have a `file`. They should:

1. Accept an explicit parameter: `toHl7v2(tree, { delimiters })`
2. Fall back to deriving from the tree: read MSH-1/MSH-2 directly
3. Fall back to defaults: `DEFAULT_DELIMITERS`

This is handled by a shared utility function (e.g., `resolveDelimiters()`) that encapsulates the fallback chain.

## Plugin Development Patterns

### Pattern 1: Annotator Plugin (Sets `file.data`)

```typescript
const hl7v2AnnotateDelimiters: Plugin<[], Root, Root> = () => {
  return (tree: Root, file: VFile) => {
    file.data.delimiters = deriveDelimitersFromMSH(tree);
  };
};
```

### Pattern 2: Consumer Plugin (Reads `file.data`)

```typescript
const myPlugin: Plugin<[], Root, Root> = () => {
  return (tree: Root, file: VFile) => {
    const delimiters = file.data.delimiters ?? deriveDelimitersFromMSH(tree);
    // Use delimiters
  };
};
```

The fallback ensures the plugin works even without the annotator in the pipeline.

### Pattern 3: Standalone Tool (No file available)

```typescript
export function toHl7v2(node: Nodes, delimiters?: Partial<Delimiters>): string {
  const d = {
    ...resolveDelimiters(node),
    ...delimiters,
  };
  // Serialize using d
}
```

### Pattern 4: Node Annotation (Sets `node.data`)

```typescript
const hl7v2AnnotateProfileFields: Plugin<[], Root, Root> = () => {
  return async (tree: Root, file: VFile) => {
    const profile = file.data.profile; // external context
    visit(tree, "field", (node) => {
      if (!node.data) node.data = {};
      node.data.name = profile.fields[node.index]?.name;
    });
  };
};
```

## Consequences

### Positive

1. **Single source of truth.** Derivable metadata is computed, not stored. MSH-1/MSH-2 are the authority for delimiters — always.
2. **No builder gap.** Programmatically-built trees work identically to parsed trees — delimiters are derived from MSH fields either way.
3. **Clear mental model.** "Can I re-derive it?" is an unambiguous test for where data goes.
4. **Unified-idiomatic.** `file.data` is the ecosystem's standard inter-plugin channel.
5. **Smaller AST.** `Root.data` no longer carries redundant copies of derivable information.

### Negative

1. **Standalone tools need fallback logic.** `toHl7v2()` can't rely on `file.data` and must derive on demand. This is handled by a shared utility.
2. **Migration cost.** Existing code reading `root.data.delimiters` or `root.data.messageInfo` must be updated.
3. **No free serialization.** If you serialize the tree to JSON and reload it, `file.data` is gone. You must re-derive (or re-annotate). But since the data is derivable from the tree, this is a non-issue.

### Neutral

1. **Type safety.** Module augmentation works on `VFile.data` the same way it works on `node.data` — via `declare module 'vfile'`.
2. **Pipeline ordering.** Annotator plugins should run early, but consumers fall back to on-demand derivation, so ordering is a performance concern, not a correctness concern.

## Migration

### Phase 1: Delimiters (this PR)

- Remove `delimiters` from `RootData`
- Parser stops setting `root.data.delimiters`
- Add `resolveDelimiters()` utility for standalone use
- Update `hl7v2-decode-escapes`, `hl7v2-encode-escapes`, `hl7v2-to-hl7v2` to use `file.data.delimiters` with fallback

### Phase 2: Message Info

- Move `messageInfo` from `Root.data` to `file.data`
- Update `hl7v2-annotate-message` to write `file.data.messageInfo`
- Update consumers to read from `file.data` with fallback

## References

- [unified — VFile data](https://unifiedjs.com/learn/guide/using-unified/#plugins)
- [unist specification — data](https://github.com/syntax-tree/unist#data)
- [ADR 0002](./0002-message-metadata-storage.md) — prior decision, now superseded
- [GitHub issue #400](https://github.com/rethinkhealth/hl7v2/issues/400) — original discovery

## History

- 2026-03-30: Accepted, superseding ADR 0002
