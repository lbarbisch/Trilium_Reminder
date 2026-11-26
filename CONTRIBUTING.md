# Contributing

Thanks for helping. Bug reports, fixes and documentation improvements are all welcome.

## Set up

You need Git and Node.js 24. See [Development](docs/manual/development.md) for the full toolchain.

```bash
git clone https://github.com/lbarbisch/Trilium_Reminder.git
cd Trilium_Reminder
npm ci
npm run dev
```

Use a **test note** in Trilium while developing, never your real list.

## Before you open a pull request

Run the same checks as CI:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run docs:build
```

On Linux, also run `shellcheck linux/*.sh` if you changed the scripts.

## Pull request rules

- One topic per pull request, on a branch, against `main`.
- Add or update tests for changed behaviour. List rules belong in `tests/todoDoc.test.ts`, sync behaviour in `tests/sync*.test.ts`.
- A change that users can notice updates the manual in `docs/manual/` and `CHANGELOG.md` under **Unreleased**.
- Never commit tokens, server addresses or real note content. Anonymise fixtures.
- Keep the security settings: sandbox and context isolation on, Node integration off, `default-src 'self'`, text set with `textContent`.
- CI must pass on Ubuntu and Windows.

Wake behaviour (unlock, standby) can't be tested in CI. If you change it, describe which rows of the manual test table in [Development](docs/manual/development.md#manual-test-table) you ran, and on which OS and desktop.

By contributing, you agree that your contribution is licensed under the GPL-3.0, like the rest of the project.
