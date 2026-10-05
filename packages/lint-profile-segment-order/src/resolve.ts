import type { Root } from "@glion/ast";
import type { Definition } from "@glion/profiles";
import { profiles, resolveMessageStructure } from "@glion/profiles";
import { value } from "@glion/util-query";

/**
 * Discriminated result for definition resolution.
 *
 * Follows the Result pattern — either success with a definition,
 * or failure with a human-readable reason. The caller decides
 * how to handle the failure (report to VFile, throw, log, etc.).
 */
export type ResolveResult =
  | { ok: true; definition: Definition }
  | { ok: false; reason: string };

/**
 * Resolve an event profile definition from the tree.
 *
 * This is a **pure function** with no side effects — it does not report
 * to VFile or throw. It returns a {@link ResolveResult} that the caller
 * can handle as appropriate.
 *
 * **Resolution strategy** (wire value wins):
 *
 * 1. Reads `MSH-9.3` (message structure) directly from the AST.
 * 2. If MSH-9.3 is absent, falls back to resolving the canonical structure ID from
 *    `MSH-9.1` (message code) + `MSH-9.2` (trigger event) via
 *    `resolveMessageStructure()`.
 * 3. Loads the profile via `profiles.events.load(version, structure)`.
 *
 * @param tree - The HL7v2 AST root node
 * @returns A result containing the definition, or a reason string on failure
 */
export async function resolveDefinition(tree: Root): Promise<ResolveResult> {
  const version = value(tree, "MSH-12.1")?.value || undefined;

  if (!version) {
    return {
      ok: false,
      reason: "Cannot validate segment order: missing version (MSH-12)",
    };
  }

  // Wire value wins: prefer explicit MSH-9.3
  let messageStructure = value(tree, "MSH-9.3")?.value || undefined;

  // Fallback: resolve from MSH-9.1 + MSH-9.2 via event maps
  if (!messageStructure) {
    const messageCode = value(tree, "MSH-9.1")?.value || undefined;
    const triggerEvent = value(tree, "MSH-9.2")?.value || undefined;

    if (messageCode && triggerEvent) {
      messageStructure = resolveMessageStructure(
        version,
        messageCode,
        triggerEvent
      );
    }
  }

  if (!messageStructure) {
    return {
      ok: false,
      reason:
        "Cannot validate segment order: unable to determine message structure from MSH-9",
    };
  }

  // Load the profile definition (handles alias resolution internally)
  try {
    const definition = await profiles.events.load(version, messageStructure);
    return { definition, ok: true };
  } catch {
    return {
      ok: false,
      reason: `Cannot validate segment order: no profile found for ${messageStructure} (v${version})`,
    };
  }
}
