#!/usr/bin/env sh
# Claude Code Stop hook: a turn may not end while a workspace package with
# uncommitted changes has failing tests. Exit 2 blocks the stop and hands
# stderr back to the agent. `stop_hook_active` is set when the agent is
# already continuing because of this hook; exiting 0 then avoids a loop.
set -eu

input=$(cat)
case "$input" in
  *'"stop_hook_active":true'*) exit 0 ;;
esac

changed=$( { git diff --name-only HEAD; git ls-files --others --exclude-standard; } |
  grep -oE '^(packages|tools)/[^/]+|^qa' | sort -u)
[ -z "$changed" ] && exit 0

filters=$(printf '%s\n' "$changed" | sed 's#^#--filter=./#' | tr '\n' ' ')
log=$(mktemp)
# shellcheck disable=SC2086
if NO_COLOR=1 pnpm turbo run test $filters >"$log" 2>&1; then
  rm -f "$log"
  exit 0
fi

{
  echo "Tests are failing in a package you changed. Fix them before stopping."
  grep -E 'FAIL|✗|×|Error|expected|received|Tests ' "$log" | grep -v '✓' | head -40
} >&2
rm -f "$log"
exit 2
