#!/usr/bin/env python3
"""Compile the Lean blocks of every lesson in docs/.

A block fenced `lean` is part of the lesson's file; a block fenced `lean skip`
is an excerpt or is meant to fail, and is left out. The blocks of one lesson are
joined in order and compiled with `lake env lean`. The check fails when Lean
reports an error, or when an `#eval` line ends in a `-- comment` that is not
what Lean printed for it.

Run from spec/: python3 scripts/check-lessons.py [docs/lesson_1.md ...]
"""

import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
BLOCK = re.compile(r"^```lean\n(.*?)^```", re.S | re.M)
EXPECTED = re.compile(r"^#eval .*?\s+-- (.+)$")


def normalize(text: str) -> str:
    return " ".join(text.split())


def check(lesson: pathlib.Path) -> list[str]:
    source = "\n".join(BLOCK.findall(lesson.read_text()))
    if not source.strip():
        return []
    out = ROOT / ".lake" / "lessons" / (lesson.stem.title().replace("_", "") + ".lean")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(source)

    expected = {}
    for number, line in enumerate(source.splitlines(), start=1):
        match = EXPECTED.match(line)
        if match:
            expected[number] = normalize(match.group(1))

    run = subprocess.run(
        ["lake", "env", "lean", "--json", str(out)], cwd=ROOT, capture_output=True, text=True
    )
    problems = []
    printed = {}
    for line in run.stdout.splitlines():
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            problems.append(line)
            continue
        where = message["pos"]["line"]
        if message["severity"] == "error":
            problems.append(f"line {where}: {message['data']}")
        else:
            printed[where] = normalize(message["data"])
    if run.returncode != 0 and not problems:
        problems.append(run.stderr.strip() or f"lean exited with {run.returncode}")
    for where, want in expected.items():
        got = printed.get(where)
        if got != want:
            problems.append(f"line {where}: the lesson says {want!r}, Lean printed {got!r}")
    return problems


def main() -> int:
    lessons = [pathlib.Path(arg).resolve() for arg in sys.argv[1:]] or sorted(
        (ROOT / "docs").glob("lesson_*.md")
    )
    failed = False
    for lesson in lessons:
        problems = check(lesson)
        print(f"{'FAIL' if problems else 'ok  '} {lesson.relative_to(ROOT)}")
        for problem in problems:
            print(f"     {problem}")
        failed = failed or bool(problems)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
