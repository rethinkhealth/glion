/**
 * Starts every receiver the Workers adapter tests dial, in Node, and hands
 * the ports to the tests running inside `workerd`.
 *
 * @module
 */

import type { TestProject } from "vitest/node";

import { peerNames, startPeer } from "../loopback";
import type { Listener, Peer } from "../loopback";

declare module "vitest" {
  export interface ProvidedContext {
    /** Loopback port of each receiver, by what it does. */
    readonly receivers: Readonly<Record<Peer, number>>;
  }
}

export default async function setup(project: TestProject) {
  const listeners = new Map<Peer, Listener>();
  for (const peer of peerNames) {
    listeners.set(peer, await startPeer(peer));
  }
  project.provide(
    "receivers",
    Object.fromEntries(
      [...listeners].map(([peer, listener]) => [peer, listener.port])
    ) as Record<Peer, number>
  );

  return async () => {
    await Promise.all([...listeners.values()].map((l) => l.close()));
  };
}
