import {
  clearInterval as nodeClearInterval,
  setInterval as nodeSetInterval,
} from "node:timers";

import { Box, render, useInput } from "ink";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import { Header } from "./header.js";
import { handleKey } from "./hotkeys.js";
import type { HotkeyHandlers } from "./hotkeys.js";
import { LogPane } from "./log-pane.js";
import type { Store } from "./store.js";
import { theme } from "./theme.js";

export interface AppProps {
  store: Store;
  startedAt: number;
  hotkeys?: Partial<HotkeyHandlers>;
}

const noop = (): void => {
  // default no-op for optional hotkey handlers
};

/**
 * The dev TUI is two siblings:
 *
 * 1. `<LogPane>` renders a Static stream — lines are committed to the terminal's
 *    native scrollback and never repainted. The user scrolls through the full
 *    session history with their terminal's normal scroll keys.
 * 2. `<Header>` inside a rounded border sits below the Static stream and is the
 *    only dynamic region. It rewrites on every event so status / connections /
 *    uptime stay live, while never clobbering the log lines above.
 */
export function App({ store, startedAt, hotkeys }: AppProps): ReactElement {
  // A version counter is enough to drive re-renders — the store mutates
  // state in place, so cloning would be wasted work.
  const [, setVersion] = useState(0);
  const [uptimeMs, setUptimeMs] = useState(Date.now() - startedAt);

  useEffect(
    () =>
      store.subscribe(() => {
        setVersion((v) => v + 1);
      }),
    [store]
  );

  useEffect(() => {
    const t = nodeSetInterval(() => {
      setUptimeMs(Date.now() - startedAt);
      store.tick();
    }, 1000);
    return () => nodeClearInterval(t);
  }, [startedAt, store]);

  useInput((input) => {
    handleKey(input, {
      onQuit: hotkeys?.onQuit ?? noop,
      onReload: hotkeys?.onReload ?? noop,
    });
  });

  const state = store.getState();

  return (
    <>
      <LogPane entries={state.log} epoch={state.logEpoch} />
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.border}
        paddingX={1}
      >
        <Header state={state} uptimeMs={uptimeMs} />
      </Box>
    </>
  );
}

/**
 * Renders the Ink app and returns a handle for programmatic control.
 * Used by `commands/dev.ts`.
 */
export function renderTui(props: AppProps): {
  unmount: () => void;
  waitUntilExit: () => Promise<void>;
} {
  const instance = render(<App {...props} />);
  return {
    unmount: () => instance.unmount(),
    waitUntilExit: () => instance.waitUntilExit(),
  };
}
