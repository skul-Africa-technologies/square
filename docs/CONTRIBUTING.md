# Contributing to Docs

Documentation lives in `docs/`. Follow the repo conventions in `CONTRIBUTING.md` at the root.

When adding or updating docs:

1. Create a branch: `docs/<scope>-<topic>`
2. Update the relevant `.md` file under `docs/`
3. Run `pnpm format` to apply Prettier
4. Open a PR against `main`

Sections:

- `docs/backend-blueprint.md` — backend service layout and infrastructure
- `docs/frontend-api-needs.md` — frontend API endpoint reference
- `docs/api-contract-diff.md` — API contract change log
- `docs/runbooks/` — operational runbooks
