# Contributing

Thanks for helping out. Bug-fix PRs are welcome any time. For a new feature, please open an issue first, so we can
agree on it before you build it.

## Setup

You need Node 24, the version CI uses.

```sh
npm ci
npm test          # unit tests (Vitest)
npm run typecheck
npm run site      # the website, docs and studio on localhost
```

## Dev tools

These are for working on Nox itself. They aren't part of the package.

- `npm run dev`: the playground, a lab for tuning looks, motion and states.
- `npm run studio`, then open `/lottie-check.html`: compares a Lottie export with the live bot.
- `npm run examples`: the package's three usages (element, React, plain JS) against the built `dist/`.
- `npm run perf`: 20 bots in headless Chrome, measured against the frame-time targets.

Drawing a new body, ears or bolts? See [art/README.md](art/README.md).

## Pull requests

- Branch off `dev` and open your PR into `dev`.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org): `fix(element): …`,
  `feat(react): …`, `docs: …`.
- If your change affects people using the package, add a changeset: run `npx changeset`, pick the bump and write
  one line about the change. Docs, tests and site-only changes don't need one.
- `npm test` and `npm run typecheck` pass.

By contributing, you agree that your code is licensed under [MIT](LICENSE), and any art under
[CC BY 4.0](LICENSE-ART).
