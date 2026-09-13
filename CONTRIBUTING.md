<!-- omit in toc -->

# Contributing to @glion/hl7v2

First off, thanks for taking the time to contribute! ❤️

All types of contributions are encouraged and valued. See the [Table of Contents](#table-of-contents) for different ways to help and details about how this project handles them. Please make sure to read the relevant section before making your contribution. It will make it a lot easier for us maintainers and smooth out the experience for all involved. The community looks forward to your contributions. 🎉

> And if you like the project, but just don't have time to contribute, that's fine. There are other easy ways to support the project and show your appreciation, which we would also be very happy about:
>
> - Star the project
> - Tweet about it
> - Refer this project in your project's readme
> - Mention the project at local meetups and tell your friends/colleagues

<!-- omit in toc -->

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [I Have a Question](#i-have-a-question)
- [I Want To Contribute](#i-want-to-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Enhancements](#suggesting-enhancements)
- [Testing](#testing)
- [Packaging Checks](#packaging-checks)
- [Preview Releases](#preview-releases)
- [Release Canary](#release-canary)

## Code of Conduct

This project and everyone participating in it is governed by the [@glion/hl7v2 Code of Conduct](https://github.com/rethinkhealth/glion/blob/main/CODE_OF_CONDUCT.md).
By participating, you are expected to uphold this code. Please report unacceptable behavior to <contact@rethinkhealth.io>.

## I Have a Question

> If you want to ask a question, we assume that you have read the available [Documentation](https://glion.dev).

Before you ask a question, it is best to search for existing [Issues](https://github.com/rethinkhealth/glion/issues) that might help you. In case you have found a suitable issue and still need clarification, you can write your question in this issue. It is also advisable to search the internet for answers first.

If you then still feel the need to ask a question and need clarification, we recommend the following:

- Open an [Issue](https://github.com/rethinkhealth/glion/issues/new).
- Provide as much context as you can about what you're running into.
- Provide project and platform versions (nodejs, npm, etc), depending on what seems relevant.

We will then take care of the issue as soon as possible.

## I Want To Contribute

> ### Legal Notice <!-- omit in toc -->
>
> When contributing to this project, you must agree that you have authored 100% of the content, that you have the necessary rights to the content and that the content you contribute may be provided under the project license.

### Reporting Bugs

<!-- omit in toc -->

#### Before Submitting a Bug Report

A good bug report shouldn't leave others needing to chase you up for more information. Therefore, we ask you to investigate carefully, collect information and describe the issue in detail in your report. Please complete the following steps in advance to help us fix any potential bug as fast as possible.

- Make sure that you are using the latest version.
- Determine if your bug is really a bug and not an error on your side e.g. using incompatible environment components/versions (Make sure that you have read the [documentation](https://glion.dev). If you are looking for support, you might want to check [this section](#i-have-a-question)).
- To see if other users have experienced (and potentially already solved) the same issue you are having, check if there is not already a bug report existing for your bug or error in the [bug tracker](https://github.com/rethinkhealth/glion/issues?q=label%3Abug).
- Also make sure to search the internet (including Stack Overflow) to see if users outside of the GitHub community have discussed the issue.
- Collect information about the bug:
  - Stack trace (Traceback)
  - OS, Platform and Version (Windows, Linux, macOS, x86, ARM)
  - Version of the interpreter, compiler, SDK, runtime environment, package manager, depending on what seems relevant.
  - Possibly your input and the output
  - Can you reliably reproduce the issue? And can you also reproduce it with older versions?

<!-- omit in toc -->

#### How Do I Submit a Good Bug Report?

> You must never report security related issues, vulnerabilities or bugs including sensitive information to the issue tracker, or elsewhere in public. Instead sensitive bugs must be sent by email to <security@rethinkhealth.io>.

We use GitHub issues to track bugs and errors. If you run into an issue with the project:

- Open an [Issue](https://github.com/rethinkhealth/glion/issues/new). (Since we can't be sure at this point whether it is a bug or not, we ask you not to talk about a bug yet and not to label the issue.)
- Explain the behavior you would expect and the actual behavior.
- Please provide as much context as possible and describe the _reproduction steps_ that someone else can follow to recreate the issue on their own. This usually includes your code. For good bug reports you should isolate the problem and create a reduced test case.
- Provide the information you collected in the previous section.

Once it's filed:

- The project team will label the issue accordingly.
- A team member will try to reproduce the issue with your provided steps. If there are no reproduction steps or no obvious way to reproduce the issue, the team will ask you for those steps and mark the issue as `needs-repro`. Bugs with the `needs-repro` tag will not be addressed until they are reproduced.
- If the team is able to reproduce the issue, it will be marked `needs-fix`, as well as possibly other tags (such as `critical`), and the issue will be left to be [implemented by someone](#your-first-code-contribution).

### Suggesting Enhancements

This section guides you through submitting an enhancement suggestion for @glion/hl7v2, **including completely new features and minor improvements to existing functionality**. Following these guidelines will help maintainers and the community to understand your suggestion and find related suggestions.

<!-- omit in toc -->

#### Before Submitting an Enhancement

- Make sure that you are using the latest version.
- Read the [documentation](https://glion.dev) carefully and find out if the functionality is already covered, maybe by an individual configuration.
- Perform a [search](https://github.com/rethinkhealth/glion/issues) to see if the enhancement has already been suggested. If it has, add a comment to the existing issue instead of opening a new one.
- Find out whether your idea fits with the scope and aims of the project. It's up to you to make a strong case to convince the project's developers of the merits of this feature. Keep in mind that we want features that will be useful to the majority of our users and not just a small subset. If you're just targeting a minority of users, consider writing an add-on/plugin library.

<!-- omit in toc -->

#### How Do I Submit a Good Enhancement Suggestion?

Enhancement suggestions are tracked as [GitHub issues](https://github.com/rethinkhealth/glion/issues).

- Use a **clear and descriptive title** for the issue to identify the suggestion.
- Provide a **step-by-step description of the suggested enhancement** in as many details as possible.
- **Describe the current behavior** and **explain which behavior you expected to see instead** and why. At this point you can also tell which alternatives do not work for you.
- **Explain why this enhancement would be useful** to most @glion/hl7v2 users. You may also want to point out the other projects that solved it better and which could serve as inspiration.

<!-- omit in toc -->

## Testing

Every change is judged by the same automated gates whether a person or an agent wrote it: `pnpm check` (lint, formatting, complexity caps), `pnpm check-types` (source and tests), `pnpm test`, and patch coverage on the PR. Run the first three locally before pushing. Human review is reserved for design, HL7v2 semantics, and security, which is only possible when the gates carry everything else.

What a change must bring with it:

1. **Tests next to the code they prove.** Behaviour changes ship with tests in the owning package's `tests/` directory, mirroring the `src/` layout (`src/commands/send.ts` is tested by `tests/commands/send.test.ts`). Adapter behaviour is tested at the adapter, core behaviour at the core.
2. **A round-trip property for every inverse pair.** A new encode/decode, frame/unframe, parse/format, or select/set pair ships with a [fast-check](https://fast-check.dev/) property asserting `decode(encode(x)) === x` over generated inputs. Example tests cover the cases you imagined; the property covers the empty string, the delimiter inside the data, and the chunk boundary you did not.
3. **A failing test before a bug fix.** A bug fix lands the regression first, in the owning package's `tests/` for logic bugs or as a `qa/fixtures/` message for shape bugs, named after the symptom. The fix is proven by a test that failed on the parent commit.
4. **Mutation survivors triaged** (once the changed-files mutation script lands). For the parser, serializer, codec, client, server, and query packages, run it after tests pass. Each surviving mutant gets either a test whose name states the HL7v2 or MLLP contract it protects, or a one-line reason why it is equivalent. Never a test named after the mutant.
5. **Lint rules through the shared harness** (once it lands in `@glion/testing`). A lint rule's README Valid and Invalid examples are its test cases, so the two cannot drift.
6. **A changeset** for any change to a published package (`pnpm changeset`).

Where things live: `benchmarks/README.md` is the contract for performance work, `qa/README.md` describes the conformance, fuzz, and round-trip suites that run against the packages as a consumer would.

<!-- omit in toc -->

## Packaging Checks

Run `pnpm build && pnpm publint` locally before pushing. CI enforces the same check. See [ADR 0015](./docs/adr/0015-secure-publishing.md) for rationale.

<!-- omit in toc -->

## Preview Releases

Every PR and every commit on `main` publishes preview packages to [pkg.pr.new](https://pkg.pr.new) via `.github/workflows/preview.yml`. The pkg.pr.new bot posts install commands as a PR comment so reviewers and bug reporters can validate a change before it is released to npm. See [ADR 0016](./docs/adr/0016-continuous-preview-releases.md) for rationale.

<!-- omit in toc -->

## Release Canary

`pnpm check:release` compares every public package's workspace version with the npm registry and fails when a version is missing or was published without a provenance attestation. It runs weekly, and on demand, from `.github/workflows/release-canary.yml`; a publish that fails is already reported by the release workflow itself. A new package fails it until a maintainer has published it once from their own account, because npm trusted publishing cannot create a package; see [ADR 0015](./docs/adr/0015-secure-publishing.md).

<!-- omit in toc -->

## Attribution

This guide is based on the **contributing-gen**. [Make your own](https://github.com/bttger/contributing-gen)!
