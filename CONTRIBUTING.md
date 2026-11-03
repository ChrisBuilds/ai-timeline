# Contributing

Thanks for helping build the AI Timeline.

## Suggest, fix or remove an event

Use one of the [issue forms](https://github.com/ChrisBuilds/ai-timeline/issues/new/choose):

- **Suggest an event** for something missing.
- **Update an event** to fix a source, add an artifact, correct a fact, or argue for a different importance.
- **Remove an event** for duplicates, hoaxes, unverifiable claims, or events that don't belong.

Please search the open issues first. If someone has already suggested the event, add a 👍 and any new sources there.

Every event is researched against its sources and reviewed by a maintainer before it goes live, so it can take a few days. Events are removed only when they are false, duplicated or out of scope, never because they are unflattering.

## Unverified details

If you are unsure of a detail in an event, drop it. If it is still worth keeping, put `{citation needed}` straight after it in the description, and say so in the pull request, so a reviewer can find a source. If the exact day is unconfirmed, use the month.

Other remarks about the text, such as how a source was read, go in a note rather than in parentheses: `{note: The date is from the publisher's page.}`. The site shows `{citation needed}` as a superscript badge and each note as a numbered footnote under the description. Both work only in `description`.

```yaml
description: |
  The paper appeared on 9 October 1986.{note: The date is from the Nature page.}
  It is the standard way networks are trained today.{citation needed}
```

## Formatting descriptions

The `description` supports a small, safe set of markdown: `*italic*` (for journal and book titles), `**bold**`, `` `code` ``, `[links](https://…)`, lists starting with `- ` or `1. `, and quotes starting with `> `. Leave a blank line between paragraphs. HTML is shown as plain text.

## Work on the site

1. Open or pick an issue labelled `site`.
2. Branch from `main` as `dev/<issue-number>-<short-name>`.
3. Run `npm install`, then `npm run dev`. Before opening a PR, run `npm run check`, `npm test` and `npm run build`.
4. Open a pull request titled `Site: …` with `Closes #<issue>` in the body.

## Add events by hand

Branch as `event/<event-id>`, add `events/<year>/<event-id>.yaml` following `schema/event.schema.json` and the rules in `CLAUDE.md`, run `npm run validate`, and open a PR titled `Event: …`.
