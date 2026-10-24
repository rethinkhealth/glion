---
"create-glion": minor
---

Breaking: `--example` without a value no longer opens a picker. It takes the name of a directory in `examples/`, or the URL of a GitHub repository or a directory in one, like `create-next-app`, and an empty value is refused. `--example-path` names the directory when a branch name contains a slash. The template is downloaded into a temporary directory, and nothing is written to the target directory unless the template has a `package.json`.
