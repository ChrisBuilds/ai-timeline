# AI Timeline

A crowdsourced, sourced timeline of artificial intelligence, from the 1956 Dartmouth workshop to now. The newest events sit at the top.

Site: https://chrisbuilds.github.io/ai-timeline/

## How it works

- Each event is one YAML file in `events/<year>/`, checked against `schema/event.schema.json`.
- Anyone can suggest, update or remove an event through the [issue forms](https://github.com/ChrisBuilds/ai-timeline/issues/new/choose).
- Submissions are researched against their sources with Claude Code, then reviewed and merged by a maintainer. The rules are in [`CLAUDE.md`](CLAUDE.md).
- Every merge to `main` rebuilds the site and deploys it to GitHub Pages.

## Development

```sh
npm install
npm run dev        # build data and start the dev server
npm run validate   # check every event
npm run check      # type check
npm test           # unit tests
npm run build      # production build into dist/
```

See [CONTRIBUTING.md](CONTRIBUTING.md).
