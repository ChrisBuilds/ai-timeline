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

The ribbon takes each era's hue, blended between era midpoints by one SVG gradient. Category, selection and filter colors do not alter its width or fill. Nodes on the spine provide discovery and interaction; the ribbon supplies a secondary density cue.

## Hidden events as nodes

Events without a card at the current zoom are nodes on the spine, at their true dates: 9px rings in their category's colour, filled with the page background so they stand off the line. `nodes.ts` draws the rendered window's nodes into one SVG path per category, skipping a node within 3px of the previous one, so thousands of hidden events cost about a dozen DOM elements. Era headings show registered totals and the number shown as cards at this zoom. Hidden events add no display space: the timeline's scale is the calendar scale.

Hovering within 11px of a node fills it, haloes it and shows a small card with its date and title; clicking it selects the event, which pins a card for it. Keyboard users reach the same events through search and `j`/`k` stepping.

Nodes stand only for hidden events. When an event gets a card, its node leaves the spine and becomes the card, and the card's leader runs straight to the spine. The layout may move a card off its date to make room for its neighbours, so a node beside a card would not always line up with it, and nodes never move with cards. A selected card shows its diamond marker where its leader meets the spine.

## Colour

Colour carries meaning and stays light. Each era band has its own hue (`hue` in `eras.ts`), shown in the era's years, a faint wash under its heading, a tinted top rule and the spine. `--era-l`, `--era-c` and `--era-wash` set its lightness, chroma and wash strength per theme. Each category's colour marks its node ring, its card's leader, a tinted category pill and the card's hover fill. The header has a soft glow of the two accents, the "AI" wordmark runs from one accent to the other, and the Now marker uses the second accent. Text stays in the neutral ink for contrast.

## Reveal motion

As zooming in gives an event room, its node morphs into its card. The card starts as a node-sized circle on the spine, in the node's colour, then stretches into its box over 900ms while its corners square off. The fill fades while the shape is still small, so a faint outline traces the stretch, and the text and leader fade in as it lands. The node is not drawn while its card is shown. As zooming out takes the room away, the card runs the same morph in reverse (about 960ms), filling back in as it reaches the spine, and only then does its node return; the card is inert and hidden from assistive tech while it goes. A card the layout has moved far from its date starts and ends at the end of its leader instead, so it never flies across the screen. `RevealTracker` in `nodes.ts` compares consecutive layouts to find cards that appeared or went, and the motion is CSS transitions, so a card that returns mid-animation turns around from where it is rather than restarting. A leaving card keeps following its date marker, so it still lands on its node during a zoom glide. When the layout moves a card by 40 to 360px in one frame because its neighbours changed, the jump is eased out: the card keeps a shift that decays to zero over 320ms, and its leader is drawn to the shifted card, so a card never comes loose from its leader. Selection changes keep their own motion; reduced motion turns all of this off.

Run `npm run test:nodes` for browser coverage in both themes at desktop, phone and 320px widths: hidden nodes, cards growing in and shrinking out with no full-size pops, settled cards without collisions, node hover and click, and reduced motion.

Zoom generally narrows the ribbon as hidden events become visible. Collision thresholds, bin changes and expanded selections can change hidden counts locally; width is not a claim about historical importance or absolute activity. Compressed empty spans are labeled “no recorded events.”

## Selection motion

Interactive selection animates over 360ms from the card's current painted position and dimensions. Layout and any necessary scroll settle before the first paint; an inverse transform preserves the original view and eases into the destination. Card dimensions animate directly so text is not stretched. The mobile sheet and desktop panel slide fully into view with a 40ms lead for the card expansion; closing reverses the transition.

Mobile selections move only as far as needed to fit between the sticky toolbar and the resting sheet. Cards that already fit expand in place. Desktop panel width changes are measured before animation rather than waiting for ResizeObserver, avoiding a one-frame horizontal jump. Rapid selections capture the in-flight position and cancel obsolete work. Zoom and viewport changes cancel selection motion. Reduced motion applies immediately, and initial/deep-link navigation does not animate.

Run `npm run test:motion` for the selection browser regression checks; install Playwright Chromium first or set `CHROMIUM_PATH` to an installed executable. The checks sample initial/intermediate/final geometry, rapid reselection, reversing an opening/closing sheet, reduced-motion overrides and deep-link navigation.

The mobile sheet has a fixed 44px drag/tap handle above a separate scrollable content region. A deliberate downward pull or flick dismisses it; short or cancelled pulls settle back. Pointer capture keeps a drag attached to the handle. The handle is also a keyboard-accessible dismissal button. Content uses contained overscroll, with boundary guards for wheel/touch input so the timeline stays still when a gesture reaches either end of the details. Scrolling the uncovered timeline remains available.

The browser checks include native touch scrolling, both content boundaries, fixed handle placement, short/cancelled/dismissal drags, and tap/keyboard activation at phone and 320px widths.

These animations run only during selection. Normal scroll and zoom never trigger per-event motion measurements. `selection-motion.ts` owns the geometry capture, layout animation and minimal scroll calculation.

## Responsive behavior and performance

Desktop selection reserves room for the detail panel. At tablet widths the panel is narrower. Phone details use a bottom sheet capped at 55vh; the selected entry is anchored above it and zoom controls stay in the timeline gutter. Theme and motion preferences, URL state, lazy-loaded details, filtering and date-anchored zoom are retained.

The density model is independent of scrolling. SVG paths, nodes and entries are rendered near the viewport using the existing chunked window. Geometry is rebuilt on layout changes, not on every scroll.

Run `npm run validate`, `npm run check`, `npm test`, and `npm run build`. The microbenchmarks include ribbon and node geometry and full zoom work at 1,000, 5,000 and 20,000 events. Run `npm run bench` and `npm run bench:browser -- --budgets`; `CHROMIUM_PATH` optionally selects an installed Chromium executable. Inspect light/dark themes at 320px, phone, tablet and desktop widths; check selected/related states, long titles, same-date events, era boundaries, quiet spans, reveal motion while zooming, node hover and click, deep links, filter changes, keyboard access and reduced motion.

## Overview milestones

Historical significance and visibility are separate decisions; see [importance.md](importance.md). Explicitly designated overview milestones receive a full card even when their dates collide. Cards may move downward into reserved space, joined to the spine by leader lines. Supporting events stay on the spine as nodes. Matching filters take precedence over faded milestones; selection still pins the chosen event.
