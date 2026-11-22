# Contributing

Thank you for looking into Home Twin. It is in beta and made by one person, so the most useful contributions right now are bug reports with steps to reproduce, and small, focused pull requests.

## Before you start

- **Open an issue first** for anything bigger than a typo or a one-line fix, so the work is not done twice and fits where the project is going (see the [roadmap](README.md#roadmap)).
- **Everything in the repository is in English**: code, comments, documentation and commit messages. Translations of the interface live in `editor/src/i18n/<language>.json`; the keys are the English strings themselves. CI refuses Cyrillic anywhere else.
- **Read the [code style](docs/code-style.md)** and the [editor's README](editor/README.md): how to build, run and test, and what is where. The plan file is described in [docs/plan-format.md](docs/plan-format.md).

## Making a change

```
cd editor
npm install
npm run dev        # http://localhost:8766/ with the demo homes, rebuilt on every change
npm run check      # the formatter, tsc (strict), the tests and the English-only check — what CI runs
```

- Keep a pull request to one change. Say in its description what it does and why, and how you tested it.
- Add or extend a test when the change is in logic that has one (the core, the HA layer, the wizard). The code is written to be read: types on named functions, one statement per line, names that say what a thing is, no `any`.
- A change to the integration (`custom_components/home_twin`) is checked by `hassfest` and the HACS action in CI; try it in a test Home Assistant as described in the [integration's README](integration/README.md).

## Translations

To improve a translation, edit the language's file in `editor/src/i18n/` and keep the English key as it is. A new language is a new file with the same keys (and one in `editor/src/i18n/demo/` for the examples' names), listed in `LANGS` in `editor/src/i18n/i18n.ts`; open an issue first so the Home Assistant side (`custom_components/home_twin/translations/`) gets it too.

## What is not here

The AI build's server (the service at twin.sync.md) is not part of this repository and is not open source; a pull request cannot change it. Problems with it are still welcome as issues, and anything about payments or your account goes to support@sync.md.

## License

Home Twin is released under the [GPL-3.0](LICENSE). By contributing you agree that your contribution is licensed the same way.
