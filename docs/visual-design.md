# Ribbon timeline and focus + context

The timeline has one date-anchored event column. Eras use plain typographic headings and rules; decorative era artwork remains in `public/art/` but is no longer rendered.

## Event hierarchy

- Ordinary events are unboxed titles with restrained date/category metadata.
- Related events have an accent outline and a relationship label derived from the selected event's outgoing links or backlinks. Labels preserve direction; no connections are inferred from proximity.
- The selected event has a contrasting surface, a Selected label, a diamond marker, and a summary. The detail panel supplies the full description, sources, artifacts and connections. On phones the timeline selection is compact, with the summary in the bottom sheet.
- Importance affects placement priority and modest title emphasis. It never implies selection. Search/filter matches use title underlining rather than the selected-event surface.

`layout.ts` accepts `heightFor` to reserve the full height of each event state. The selected event remains pinned. `scale.ts` reserves non-time footer space for entries that extend beyond an era's last date so the next heading cannot be covered. Headers and footers do not stretch calendar time.

## Ribbon semantics

Width means events hidden by the current layout, including nonmatching events retained as context. Offscreen events omitted by virtualization do not count as hidden. Event dates are cached; counts use their original dates rather than cluster positions.

`ribbon.ts` constructs equal-duration calendar bins within each era, selecting month, quarter, half-year, year or multi-year windows according to zoom. Partial end bins are clipped. Counts use an absolute capped logarithmic mapping from 2 to 16 pixels (12 on narrow layouts); extreme counts cannot make the ribbon dominate the interface. Cubic smoothstep joins avoid width overshoot. Paths end at era headers and compressed gaps, so density never bleeds across those spaces.

The ribbon is neutral in both themes. Category, selection and filter colors do not alter its width or fill. Hover/focus reveals the period and count. A 44px-wide invisible button opens a nonmodal event list, limited to the 12 highest-priority events, plus a zoom action. All events remain reachable through zoom, search and keyboard navigation. Escape dismisses the list and returns focus to its ribbon target. Counts and periods are exposed in accessible labels.

Zoom generally narrows the ribbon as hidden events become visible. Collision thresholds, bin changes and expanded selections can change hidden counts locally; width is not a claim about historical importance or absolute activity. Compressed empty spans are labeled “no recorded events.”

## Selection motion

Interactive selection animates over 360ms from the card's current painted position and dimensions. Layout and any necessary scroll settle before the first paint; an inverse transform preserves the original view and eases into the destination. Card dimensions animate directly so text is not stretched. The mobile sheet and desktop panel slide fully into view with a 40ms lead for the card expansion; closing reverses the transition.

Mobile selections move only as far as needed to fit between the sticky toolbar and the resting sheet. Cards that already fit expand in place. Desktop panel width changes are measured before animation rather than waiting for ResizeObserver, avoiding a one-frame horizontal jump. Rapid selections capture the in-flight position and cancel obsolete work. Zoom and viewport changes cancel selection motion. Reduced motion applies immediately, and initial/deep-link navigation does not animate.

Run `npm run test:motion` for the selection browser regression checks; install Playwright Chromium first or set `CHROMIUM_PATH` to an installed executable. The checks sample initial/intermediate/final geometry, rapid reselection, reversing an opening/closing sheet, reduced-motion overrides and deep-link navigation.

These animations run only during selection. Normal scroll and zoom never trigger per-event motion measurements. `selection-motion.ts` owns the geometry capture, layout animation and minimal scroll calculation.

## Responsive behavior and performance

Desktop selection reserves room for the detail panel. At tablet widths the panel is narrower. Phone details use a bottom sheet capped at 55vh; the selected entry is anchored above it and zoom controls stay in the timeline gutter. Theme and motion preferences, URL state, lazy-loaded details, filtering and date-anchored zoom are retained.

The density model is independent of scrolling. SVG paths, hit regions and entries are rendered near the viewport using the existing chunked window. Geometry is rebuilt on layout changes, not on every scroll.

Run `npm run validate`, `npm run check`, `npm test`, and `npm run build`. The microbenchmarks include ribbon calculation and full zoom work at 1,000, 5,000 and 20,000 events. Run `npm run bench` and `npm run bench:browser -- --budgets`; `CHROMIUM_PATH` optionally selects an installed Chromium executable. Inspect light/dark themes at 320px, phone, tablet and desktop widths; check selected/related states, long titles, same-date events, era boundaries, quiet spans, density menus, deep links, filter changes, keyboard access and reduced motion.
