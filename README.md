# workbenchmarks fixtures

Starting points for the benchmarks published at
[workbenches.dev/benchmarks](https://workbenches.dev/benchmarks).

Every attempt in a benchmark starts from one commit of this repository, and
each post names that commit. To audit or rerun an attempt, check out the
commit it names.

## Layout

Each fixture lives on its own orphan branch, so an agent sees only the files
that fixture holds and nothing from this README or from other fixtures.

| Branch  | What the agent starts with                    |
| ------- | --------------------------------------------- |
| `empty` | An empty project: only a `.gitignore`.        |

## Rules

- A fixture commit is never rewritten once a post names it. Changes land as
  new commits, and posts pin the new commit when they rerun.
- No secrets, keys, or private data, ever. Everything here is public.
- The harness, task prompt, and checks live in
  [pompeii-labs/workbenchmarks](https://github.com/pompeii-labs/workbenchmarks).
