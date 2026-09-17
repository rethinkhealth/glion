#!/usr/bin/env sh
# Claude Code PostToolUse hook for Edit and Write: format and lint-fix the one
# file the tool changed. Lint errors left after fixing do not block; `pnpm
# check` and CI are the gate.
set -eu

file=$(node -e 'let s="";process.stdin.on("data",(c)=>{s+=c}).on("end",()=>{process.stdout.write(JSON.parse(s).tool_input?.file_path??"")})')
[ -f "$file" ] || exit 0

cd "${CLAUDE_PROJECT_DIR:-.}"
# ultracite spawns oxfmt and oxlint by name, so the workspace binaries go
# first. Options it does not know go to oxlint, which otherwise fails on
# files it does not lint (Markdown, JSON, YAML).
PATH="$PWD/node_modules/.bin:$PATH" exec ultracite fix --no-error-on-unmatched-pattern "$file"
