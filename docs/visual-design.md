# Era artwork

The timeline uses original SVG patterns in `public/art/`. Their filenames match the era IDs in `src/lib/eras.ts`. They are decorative CSS masks, so they add no focus targets, screen-reader content, or per-node DOM work. URLs respect Vite's deployment base.

| Era | Motif |
| --- | --- |
| Foundations | Discrete marks, grids, and a computational tape |
| Symbolic AI and the first winter | Search spaces, explored paths, and abandoned routes |
| Expert systems and the second winter | Hierarchical rules, square gates, and broken branches |
| Statistical machine learning | Sample distributions, contours, and decision boundaries |
| Deep learning | Successive layers and selected signal paths |
| Transformers and scale | Token positions, long-range attention, and matrix patches |
| Generative and agentic AI | Variations from a seed, separate workflows, feedback, and expansion |

`Timeline.svelte` colors each mask with its era hue, using deeper ink on ivory and lighter ink on charcoal. `--era-art-opacity` in `app.css` controls theme-specific strength. Cards and labels use opaque surfaces. The patterns scale uniformly for compressed eras and repeat through taller eras; circles and rule-tree angles remain intact. Mobile uses smaller artwork and a horizontal zoom dock. Artwork is static, with no new animation or external requests.

When changing artwork, inspect all seven eras in light, dark, and system themes. Include a compressed era, an expanded era, a 320px viewport, and an open detail panel. Check that cards, labels, focus outlines, search, and zoom remain readable and operable. Run the standard validation, type check, tests, and production build.
