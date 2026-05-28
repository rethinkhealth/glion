/**
 * Keys wired into the dev TUI. v1 ships only the two keys with
 * implementations — additional keys will be added when their handlers
 * are written, rather than shipped as silent no-ops.
 */
export interface HotkeyHandlers {
  onReload: () => void;
  onQuit: () => void;
}

/**
 * Pure key→action mapping. Separated from Ink's `useInput` hook so
 * the dispatch logic can be unit-tested without rendering.
 */
export function handleKey(key: string, handlers: HotkeyHandlers): void {
  const k = key.toLowerCase();
  if (k === "r") {
    handlers.onReload();
  } else if (k === "q") {
    handlers.onQuit();
  }
}
