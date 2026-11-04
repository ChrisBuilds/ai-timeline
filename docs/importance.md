# Historical significance and zoom

Importance measures historical significance using evidence available at the assessment date. It is independent of confidence, event age, selection, zoom and available screen space. A release can gain or lose significance as evidence accumulates. Never apply automatic age decay.

## Rubric v2

`score = round(20 × (0.35 × influence + 0.30 × adoption + 0.25 × capability + 0.10 × society))`

All four dimensions use integer ratings from 0 through 5. There is no bonus for the highest rating. Preserve these weights for v2; a future change to weights or anchors needs a new rubric version. Tiers remain Landmark ≥85, Major ≥65, Notable ≥40, Detail <40. A tier describes significance, not guaranteed full-card placement.

| Rating | Downstream influence · 35% | Adoption and practical reach · 30% | Capability or conceptual advance · 25% | Societal and institutional reach · 10% |
| --- | --- | --- | --- | --- |
| 0 | Evidence of negligible downstream effect | Evidence of negligible use or institutional uptake | No new capability or conceptual advance | Evidence of negligible societal or institutional effect |
| 1 | Local follow-on work | Isolated experiment, prototype or deployment | Small refinement | Local attention or organizational effect |
| 2 | Meaningful niche influence | Repeated specialist use | Useful improvement in an established approach | Meaningful niche discussion or institutional effect |
| 3 | Substantial field-level influence | Substantial use across the relevant audience | Substantial new practical or conceptual ability | Substantial public, professional or institutional effect |
| 4 | Redirected established practice across a field | Widespread use changing established practice | Major advance enabling substantially different work | Broad, sustained effects on expectations, institutions or governance |
| 5 | Foundational direction or durable new category | A standard part of practice across the relevant audience | Foundational new class of practical or conceptual work | Lasting change to public behavior or major institutions |

Rate adoption relative to the relevant audience: structural biologists, developers and regulators need not match consumer user counts. For policy, assess institutional application and coverage; do not equate entry into force with compliance or enforcement. Capability includes conceptual advances and enabling governance frameworks, not only benchmark performance. Influence measures later change attributable to this event; adoption measures use. Avoid counting the same observation twice without explaining the distinction.

Examples: the Transformer is a foundational technical advance; ChatGPT's initial release is more significant for adoption and downstream use than for a new architecture. A televised chess victory can have exceptional societal reach and limited direct adoption. A Nobel announcement recognizes earlier research rather than introducing that research again.

A missing observation is **unknown** (`rating: null`), not a zero. A provisional assessment exports the possible weighted score interval with unknowns ranging from 0 to 5. It does not normalize the remaining weights. For a newly added provisional event without any established score, the numeric index placement key is explicitly the interval’s lower bound (`score_basis: v2-lower-bound`); the UI shows the range and “No accepted point score.” It does not publish that key as an accepted assessment. Otherwise its published point score stays at the latest accepted assessment on or before its date, or the original v1 score if none exists. No partial assessment can be accepted. Confidence is recorded independently for each dimension and never multiplies the score. A provisional point estimate is not promoted automatically.

## Assess an event

1. Identify the exact contribution and relevant audience. Distinguish announcement, research preview, general availability, later adoption and subsequent model releases.
2. Open primary sources for what happened. For adoption or historical effects, seek independent longitudinal evidence and directly attributable successors. Vendor claims are usable attributed signals with an appropriate confidence level, not independent confirmation. Fetch every newly cited source. If a source cannot be read, retain valid existing sources and document the gap; do not claim fresh verification.
3. Rate each dimension against the anchors. Record a short dimension-specific rationale, confidence, and evidence URLs from the event's `sources`. Raw counts of citations, news coverage, revenue or page views inform the judgment; none is a direct importance formula.
4. Compare with two or three named events, preferably including a different organization or event category. Explain the relative ranking and the tradeoffs. Do not assign scores solely to achieve a desired card placement.
5. Record attribution limits, open questions, reviewer, assessment date, next review date and evidence-based review triggers. An old launch can gain influence, but should not receive all later credit for a company's separate products.
6. Request editorial acceptance through the usual content PR. Append a new record when changing a judgment, including accepting a provisional assessment. Never rewrite a previous record to conceal a changed opinion.

## Records and history

`importance.rubric` and any top-level override retain the original v1 inputs verbatim. `importance.legacy` records the migration date and version, **not an invented original assessment date**. New events may start directly with v2 assessments and omit the original rubric and legacy record entirely; do not invent a v1 history. New judgments are stored in `importance.assessments`, selected explicitly by `importance.current`; changing list order does not select a new judgment. Every new record uses an event-local unique ID, a date, a version and status. Reverting a current pointer is explicit and leaves history intact.

The schema and data builder validate records, completeness, comparison references, evidence references, review dates and current pointers. CI compares event files with the PR base and rejects edits or deletions of existing assessment records or frozen original inputs. Event removal still follows the documented removal workflow. Overrides require a written reason and review date. Frozen original overrides retain their original reason without fabricating a retrospective expiry; they affect v1 reproduction and provisional fallback, not accepted v2 ratings. Expiry sends an override to the review queue; it does not silently change published scores.

The slim index exports the published score, tier, overview flag, score status, basis assessment ID and provisional bounds. Full assessment history, evidence and review information remain in the details endpoint and downloadable full dataset. The detail panel displays these records, including the original rubric and unknown original date.

## Reassessment queue

- Recent events (initially those from 2022 onward): review within three months.
- Established events: review annually.
- Provisional or unavailable evidence: initial review within one month; shorten further when useful.
- Override review: set an explicit deadline based on why the exception is needed.
- Review early when sustained adoption, direct successors, replication failures, abandonment or corrected historical attribution change the evidence.

`npm run importance:review` prints the queue as JSON without contacting services or editing scores. `npm run importance:review -- --as-of 2027-02-04` makes a review reproducible. It includes provisional records immediately, scheduled reviews when due, and legacy records awaiting migration. CI displays the queue; a maintainer turns actionable entries into issues through the usual workflow. Scheduling notifications is deliberately separate from scoring and is not configured automatically.

`npm run importance:report` prints the v1/published/v2 comparison table. `node scripts/assessment-history.mjs origin/main` verifies append-only history against a local base. Tests cover schema constraints, score provenance and incomplete judgments.

## Overview and dynamic zoom

An assessment can carry `overview_reason`: an explicit editorial argument that the event is necessary to the overview narrative. This is independent of its numerical tier. ChatGPT's consumer access transition and Claude Code's terminal coding workflow are overview milestones without making every nearby release a landmark. The initial curated set also includes foundational research, benchmark, scientific, infrastructure and policy milestones.

At each zoom, the one-column layout places overview milestones before ordinary score-ranked cards. If protected cards collide, including on the same date, later cards move down into reserved display space. Date markers remain anchored to the actual time; a leader connects each displaced card to its marker. Era footer space is calculated from actual protected-card overflow, including same-date milestones, rather than adding an empty tail for every milestone. Collapsed groups reserve their own rows and retain access to every hidden supporting event. Their projection must preserve markers, inverse navigation and group counts even around displaced milestones.

Ordinary events compete within local collision neighborhoods, with score first and chronological ties deterministic. More temporal space generally exposes more individual supporting cards; groups, era headers and a selected card can change local counts. Selecting a hidden event still pins it and may temporarily displace an overview card. With filters, matching events win over faded events and only matching overview milestones are protected. Removing selection or filters restores the overview. Group browsing does not change zoom.

Overview protection and stable tie-breaking prevent arbitrary loss of essential milestones without promising that thousands of simultaneous milestones can fit on one screen. The page scrolls and virtualizes full cards at their displayed positions. Repeated identical state yields identical placement. Zoom remains continuous; local collision thresholds may still exchange ordinary representatives.
