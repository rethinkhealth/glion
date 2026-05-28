import { Box, Text } from "ink";
import type { ReactElement } from "react";

import type { StoreState } from "./store.js";
import { statusMeta, theme } from "./theme.js";

export interface HeaderProps {
  state: StoreState;
  uptimeMs: number;
}

interface Shortcut {
  key: string;
  label: string;
}

const SHORTCUTS: readonly Shortcut[] = [
  { key: "r", label: "reload" },
  { key: "q", label: "quit" },
];

/**
 * Topbar for the dev TUI. Two rows:
 *
 * Row 1: brand + mode + port + optional (tls, zero-config) | status · conns ·
 * uptime row 2: keyboard shortcuts
 *
 * The whole component is the TUI "chrome" — there is no separate
 * footer. Shortcuts live up top so the log is the only thing below
 * the header and fills the rest of the terminal.
 */
export function Header({ state, uptimeMs }: HeaderProps): ReactElement {
  const { label, color } = statusMeta(state.status);
  const port = state.port === null ? "—" : String(state.port);
  const connections = state.connections.size;

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between">
        <Text>
          <Text bold color={theme.brand}>
            glion
          </Text>
          <Text dimColor> dev</Text>
          <Text dimColor>{"  ·  "}</Text>
          <Text>:{port}</Text>
          {state.tls ? (
            <>
              <Text dimColor>{"  ·  "}</Text>
              <Text color={theme.success}>tls</Text>
            </>
          ) : null}
        </Text>
        <Text>
          <Text color={color}>●</Text>
          <Text color={color}> {label}</Text>
          <Text dimColor>{"  ·  "}</Text>
          <Text>{connections}</Text>
          <Text dimColor> conns</Text>
          {state.msgPerSec > 0 ? (
            <>
              <Text dimColor>{"  ·  "}</Text>
              <Text>{state.msgPerSec}</Text>
              <Text dimColor> msg/s</Text>
            </>
          ) : null}
          <Text dimColor>{"  ·  "}</Text>
          <Text>{formatUptime(uptimeMs)}</Text>
        </Text>
      </Box>
      <Text>
        {SHORTCUTS.map((shortcut, index) => (
          <Text key={shortcut.key}>
            {index > 0 ? <Text dimColor>{"  ·  "}</Text> : null}
            <Text bold color={theme.accent}>
              {shortcut.key}
            </Text>
            <Text dimColor> {shortcut.label}</Text>
          </Text>
        ))}
      </Text>
    </Box>
  );
}

function formatUptime(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const s = Math.floor(ms / 1000);
  if (s < 60) {
    return `${s}s`;
  }
  const m = Math.floor(s / 60);
  if (m < 60) {
    return `${m}m${s % 60}s`;
  }
  const h = Math.floor(m / 60);
  return `${h}h${m % 60}m`;
}
