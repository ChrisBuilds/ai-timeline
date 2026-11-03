# Benchmarks

The timeline should stay responsive with many thousands of events on a low-end
phone. These tools measure that with synthetic data, so a slowdown shows up in a
pull request before it reaches the site.

| Command | What it does |
| --- | --- |
| `npm run bench` | Micro-benchmarks (`bench/core.bench.ts`) for the work done on every zoom frame, filter change and keystroke: `buildScale`, `layout`, ribbon geometry, search and filters, at 1,000, 5,000 and 20,000 events. |
| `npm run build && npm run bench:browser` | Loads the built site in Chromium with synthetic data, with the CPU slowed 4x to stand in for a low-end phone, on a desktop and a phone viewport. Measures time to the first card, long tasks while loading, DOM size, frame times while zooming and scrolling, and how long filtering and selecting an event take. Options: `--sizes 1000,5000`, `--cpu 6`, `--json out.json`, `--budgets`. |
| `npm run build && npm run bench:profile -- <load\|filter\|select\|zoom> [events]` | Records one interaction with Chromium's CPU profiler and lists the functions with the most self time. Build with `npx vite build --minify false` to see real function names. |

`bench/synthetic.mjs` makes the data. It is seeded, so every run sees the same
events: dates skew heavily towards the present, most events are minor, and
organizations, people and tags repeat with a long tail, like the real data.
To try a large timeline by hand, `node bench/synthetic.mjs 5000 --site dist/data`
after `npm run build` replaces the built site's data, then `npm run preview`.
(`npm run dev` and `npm run build` rebuild `public/data/` from `events/`.)

## CI

The `Performance` workflow runs a short sample of both benchmarks on pull
requests that touch the site and on pushes to `main`: 5,000 events only, with
micro-benchmarks sampled for 100ms each (`BENCH_SIZES=5000 BENCH_TIME=100`).
The benchmarks themselves take under 20 seconds. Run the full sweep locally
before changing anything performance-sensitive. Results go in the run summary and the
`bench-results` artifact. The browser benchmark fails the run when a metric is
over its budget in `bench/budgets.json`.

Budgets are set at roughly twice the values measured when they were last
changed, because shared CI machines are noisy. Tighten them when the site gets
faster, and only loosen them on purpose, with the reason in the PR.

## What keeps it fast

- **Layout runs in O(n log n).** Each lane keeps its occupied spans sorted, so
  placing a card is a binary search, and the placement order (by importance)
  is sorted once per data or filter change rather than on every zoom frame.
- **Only what is near the screen is rendered.** Cards, `+N` markers, year marks
  and gaps outside a window from half a screen above the view to half a screen
  below it are left out of the DOM. The window moves in 256px steps, so
  scrolling re-renders only when it crosses a step.
- **Eras grow sublinearly.** Past 12 events, an era's height grows with the
  event count to the power 0.4, so 20,000 events make a timeline a few dozen
  screens tall at zoom 1 instead of thousands, and zooming reveals the rest.
- **The timeline loads a slim index.** `data/index.json` holds what the
  timeline, search and filters need. Each event's description, sources,
  artifacts and rubric are in `data/details/<id>.json`, fetched when the event
  is opened and prefetched when its card is hovered or focused. That makes the
  first download about a third of the full data. The full `data/events.json` is
  still published as a dataset, but the site doesn't load it.
- **The event data is not reactive.** It is loaded with `$state.raw`, because a
  deep reactive proxy taxes every read of every event.
- **Cheap per-frame work.** Per-event years and scores are plain arrays in event
  order, `scale.y()` finds its segment with a binary search, cards use
  `contain: strict`, and cards fade in with a CSS animation rather than a script
  transition.

Set `CHROMIUM_PATH=/path/to/chromium` to use an existing browser executable for browser benchmarks and profiles.
