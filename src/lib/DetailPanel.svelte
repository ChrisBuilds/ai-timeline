<script lang="ts">
  import type { EventDetails, TimelineEvent } from './types'
  import { formatRange } from './dates'
  import { TIER_NAMES } from './tiers'
  import { categoryColor } from './categories'
  import type { Filters } from './filters'
  import { parseDescription } from './markdown'
  import Inline from './Inline.svelte'
  import { cubicOut } from 'svelte/easing'
  import { SELECTION_DURATION } from './selection-motion'

  interface Props {
    event: TimelineEvent
    reducedMotion: boolean
    byId: Map<string, TimelineEvent>
    /** Events that link to this one. */
    backlinks: TimelineEvent[]
    onselect: (id: string) => void
    onclose: () => void
    filters: Filters
    /** Shows only events that share this value, or clears that filter if it is the only one on. */
    onfilter: (field: keyof Filters, value: string) => void
    /** Description, sources and artifacts; null until they have loaded. */
    details: EventDetails | null
    /** Why the details could not be loaded, if they couldn't. */
    detailsError: string | null
    onretry: () => void
  }

  let { event, reducedMotion, byId, backlinks, onselect, onclose, filters, onfilter, details, detailsError, onretry }: Props = $props()

  function panelTransition(_node: HTMLElement, options: { reduced: boolean }) {
    const axis = innerWidth < 720 ? 'Y' : 'X'
    return {
      duration: options.reduced ? 0 : SELECTION_DURATION,
      delay: options.reduced ? 0 : 40,
      easing: cubicOut,
      css: (t: number) => `transform: translate${axis}(${(1 - t) * 100}%);`,
    }
  }

  const facts = $derived(
    (
      [
        ['Organizations', 'organizations', event.organizations],
        ['People', 'people', event.people],
        ['Tags', 'tags', event.tags],
      ] as const
    ).filter(([, , values]) => values?.length),
  )

  const RELATION_LABEL = {
    builds_on: 'Builds on',
    responds_to: 'Responds to',
    supersedes: 'Supersedes',
  } as const

  // Descriptions are a safe subset of markdown, with {citation needed} and {note: …}
  // markers shown as superscripts (see markdown.ts and scripts/notes.mjs).
  const description = $derived(parseDescription(details?.description ?? ''))

  // One popover at a time, opened from a marker and placed under it.
  let panel: HTMLElement | undefined = $state()
  let popover: { key: string; kind: 'cn' | 'note'; n: number; top: number; left: number } | null = $state(null)
  let popoverEl: HTMLElement | undefined = $state()

  function openMarker(marker: { kind: 'cn'; i: number } | { kind: 'note'; n: number }, target: HTMLElement) {
    const key = marker.kind === 'cn' ? `cn-${marker.i}` : `note-${marker.n}`
    if (popover?.key === key) return closePopover()
    if (!panel) return
    const box = panel.getBoundingClientRect()
    const at = target.getBoundingClientRect()
    const width = Math.min(300, box.width - 32)
    popover = {
      key,
      kind: marker.kind,
      n: marker.kind === 'note' ? marker.n : marker.i,
      top: at.bottom - box.top + panel.scrollTop + 6,
      left: Math.max(16, Math.min(at.left - box.left - 12, box.width - width - 16)),
    }
  }

  function closePopover(refocus = false) {
    const key = popover?.key
    popover = null
    if (refocus && key) document.getElementById(key.replace('-', '-ref-'))?.focus()
  }

  $effect(() => {
    // A new event closes any open popover.
    void event.id
    popover = null
  })

  $effect(() => {
    if (!popover) return
    const onkey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closePopover(true)
      }
    }
    const onpointer = (e: PointerEvent) => {
      const t = e.target as HTMLElement
      if (!popoverEl?.contains(t) && !t.closest('.marker')) closePopover()
    }
    addEventListener('keydown', onkey, true)
    addEventListener('pointerdown', onpointer)
    return () => {
      removeEventListener('keydown', onkey, true)
      removeEventListener('pointerdown', onpointer)
    }
  })

  let notesList: HTMLOListElement | undefined = $state()
  function showNote(n: number) {
    closePopover()
    const item = notesList?.children[n - 1] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    item?.focus({ preventScroll: true })
  }
  function backToText(n: number) {
    const ref = document.getElementById(`note-ref-${n}`)
    ref?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    ref?.focus({ preventScroll: true })
  }

  const addSource = {
    kind: 'add source',
    prompt: 'Source for a detail marked "citation needed", and what it confirms:\n',
  }

  // Each contribution opens the update form with this event filled in. GitHub only
  // prefills text fields, so the kind of change goes in the title and a starter
  // line in "The proposed change"; the dropdown is left for the person to tick.
  function updateUrl(c: { kind: string; prompt: string }): string {
    const params = new URLSearchParams({
      template: '2-update-event.yml',
      title: `Update: ${event.title} (${c.kind})`,
      event: event.id,
      proposed: c.prompt,
    })
    return `https://github.com/ChrisBuilds/ai-timeline/issues/new?${params}`
  }

  const contributions = [
    { label: 'Add a source', hint: 'A report, filing or announcement', kind: 'add source', prompt: 'Source to add, and what it confirms:\n', icon: 'M9 12h6M10 7H8a5 5 0 0 0 0 10h2m4-10h2a5 5 0 0 1 0 10h-2' },
    {
      label: 'Add an artifact',
      hint: 'Paper, repo, model card, video',
      kind: 'add artifact',
      prompt: 'Artifact to add (paper, repo, model card, video or dataset):\n',
      icon: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5M9 13h6M9 17h4',
    },
    {
      label: 'Add details',
      hint: 'Context, people, what followed',
      kind: 'add details',
      prompt: 'Details to add:\n',
      icon: 'M12 5v14M5 12h14',
    },
    {
      label: 'Suggest a correction',
      hint: 'A wrong date, name or fact',
      kind: 'correction',
      prompt: 'What is wrong, and what it should say:\n',
      icon: 'M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4',
    },
  ]

  let heading: HTMLHeadingElement | undefined = $state()
  $effect(() => {
    // Move focus to the panel when a new event opens, for keyboard and screen reader users.
    void event.id
    heading?.focus({ preventScroll: true })
  })
</script>

<aside transition:panelTransition={{ reduced: reducedMotion }} class="panel" bind:this={panel} aria-labelledby="panel-title" style:--c={categoryColor(event.category)}>
  <span class="grabber" aria-hidden="true"></span>
  <header>
    <p class="meta">
      <time datetime={event.date}>{formatRange(event.date, event.end_date)}</time>
      <button
        class="category facet-link"
        aria-pressed={filters.categories.includes(event.category)}
        title="Show {event.category} events"
        onclick={() => onfilter('categories', event.category)}
        ><span class="swatch" aria-hidden="true"></span>{event.category}</button
      >
      <span class="tier">{TIER_NAMES[event.tier]}</span>
    </p>
    <button class="close" onclick={onclose} aria-label="Close details">×</button>
  </header>

  <h2 id="panel-title" tabindex="-1" bind:this={heading}>{event.title}</h2>

  {#if event.developing}
    <p class="notice">This story is still developing and is being rechecked.</p>
  {/if}
  {#if event.disputed}
    <p class="notice warn">
      Disputed: {event.disputed.reason}
      (<a href="https://github.com/ChrisBuilds/ai-timeline/issues/{event.disputed.issue}">issue #{event.disputed.issue}</a>)
    </p>
  {/if}

  <p class="summary">{event.summary}</p>
  <div class="prose">
    {#each description.blocks as block, i (i)}
      {#if block.kind === 'p'}
        <p><Inline nodes={block.content} onmarker={openMarker} open={popover?.key} /></p>
      {:else if block.kind === 'quote'}
        <blockquote><Inline nodes={block.content} onmarker={openMarker} open={popover?.key} /></blockquote>
      {:else if block.kind === 'ul'}
        <ul>
          {#each block.items as item, j (j)}<li><Inline nodes={item} onmarker={openMarker} open={popover?.key} /></li>{/each}
        </ul>
      {:else if block.kind === 'ol'}
        <ol>
          {#each block.items as item, j (j)}<li><Inline nodes={item} onmarker={openMarker} open={popover?.key} /></li>{/each}
        </ol>
      {/if}
    {/each}
  </div>

  {#if description.notes.length}
    <h3 id="notes-heading">Notes</h3>
    <ol class="notes" aria-labelledby="notes-heading" bind:this={notesList}>
      {#each description.notes as note, i (i)}
        <li tabindex="-1">
          <Inline nodes={note} />
          <button class="back" onclick={() => backToText(i + 1)} aria-label="Back to note {i + 1} in the text">↑</button>
        </li>
      {/each}
    </ol>
  {/if}

  {#if popover}
    <div
      class="popover"
      class:cn={popover.kind === 'cn'}
      role="dialog"
      aria-label={popover.kind === 'cn' ? 'Citation needed' : `Note ${popover.n}`}
      bind:this={popoverEl}
      style:top="{popover.top}px"
      style:left="{popover.left}px"
    >
      {#if popover.kind === 'cn'}
        <p class="popover-title">Citation needed</p>
        <p>This detail has low confidence. It is kept because it is useful, but it needs another source.</p>
        <a class="popover-action" href={updateUrl(addSource)} target="_blank" rel="noopener noreferrer">Suggest a source</a>
      {:else}
        <p class="popover-title">Note {popover.n}</p>
        <p><Inline nodes={description.notes[popover.n - 1]} /></p>
        <button class="popover-action" onclick={() => showNote(popover!.n)}>Show in notes</button>
      {/if}
    </div>
  {/if}

  {#if facts.length}
    <dl class="facts">
      {#each facts as [label, field, values] (field)}
        <dt>{label}</dt>
        <dd>
          {#each values ?? [] as value (value)}
            <button
              class="chip"
              aria-pressed={filters[field].includes(value)}
              title="Show events with {value}"
              onclick={() => onfilter(field, value)}>{value}</button
            >
          {/each}
        </dd>
      {/each}
    </dl>
    <p class="facts-hint">Select any of these to filter the timeline.</p>
  {/if}

  {#if event.related?.length || backlinks.length}
    <h3>Connections</h3>
    <ul class="links">
      {#each event.related ?? [] as link (link.id)}
        {@const target = byId.get(link.id)}
        {#if target}
          <li>
            <span class="relation">{RELATION_LABEL[link.relation]}</span>
            <button class="link" onclick={() => onselect(target.id)}>{target.title}</button>
          </li>
        {/if}
      {/each}
      {#each backlinks as other (other.id)}
        <li>
          <span class="relation">Led to</span>
          <button class="link" onclick={() => onselect(other.id)}>{other.title}</button>
        </li>
      {/each}
    </ul>
  {/if}

  <h3>Sources</h3>
  {#if description.citationsNeeded}
    <p class="needs-source">
      {description.citationsNeeded === 1 ? 'One detail' : `${description.citationsNeeded} details`} in this description
      {description.citationsNeeded === 1 ? 'needs' : 'need'} another source.
      <a href={updateUrl(addSource)} target="_blank" rel="noopener noreferrer">Suggest one</a>
    </p>
  {/if}
  {#if detailsError}
    <p class="load-error" role="alert">
      Could not load the description and sources for this event.
      <button class="retry" onclick={onretry}>Try again</button>
    </p>
  {:else if !details}
    <ul class="links sources loading" aria-busy="true" aria-label="Loading sources">
      <li class="placeholder"></li>
      <li class="placeholder short"></li>
    </ul>
  {/if}
  <ul class="links sources" hidden={!details}>
    {#each details?.sources ?? [] as s (s.url)}
      <li class="source">
        <a href={s.url} rel="noopener noreferrer" target="_blank">{s.title}</a>
        <span class="muted">{s.publisher}</span>
        {#if s.archived_url}<a class="muted" href={s.archived_url} rel="noopener noreferrer" target="_blank">(archived)</a>{/if}
      </li>
    {/each}
  </ul>

  {#if details?.artifacts?.length}
    <h3>Artifacts</h3>
    <ul class="links">
      {#each details.artifacts as a (a.url)}
        <li>
          <span class="relation">{a.type}</span>
          <a href={a.url} rel="noopener noreferrer" target="_blank">{a.title}</a>
        </li>
      {/each}
    </ul>
  {/if}

  <section class="contribute" aria-labelledby="contribute-heading">
    <h3 id="contribute-heading">Know more about this event?</h3>
    <p class="contribute-note">Every addition is checked against its sources before it goes live.</p>
    <ul class="actions">
      {#each contributions as c (c.label)}
        <li>
          <a class="action" href={updateUrl(c)} target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={c.icon} /></svg>
            <span class="action-text">
              <span class="action-label">{c.label}</span>
              <span class="action-hint">{c.hint}</span>
            </span>
          </a>
        </li>
      {/each}
    </ul>
    {#if details?.issue}
      <a class="discussion" href="https://github.com/ChrisBuilds/ai-timeline/issues/{details.issue}" target="_blank" rel="noopener noreferrer"
        >Read the discussion for this event</a
      >
    {/if}
  </section>
</aside>

<style>
  .panel {
    position: fixed;
    z-index: 20;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(420px, 100vw);
    overflow-y: auto;
    padding: 22px 24px 40px;
    background: var(--surface);
    border-left: 1px solid var(--line);
    box-shadow: var(--shadow-lg);
  }
  @media (min-width: 720px) and (max-width: 1099px) { .panel { width: 340px; } }
  .panel > :global(*) {
    position: relative;
  }
  .grabber {
    display: none;
  }
  @media (max-width: 719px) {
    .panel {
      top: auto;
      left: 0;
      width: 100%;
      max-height: 55vh;
      padding: 10px 20px calc(32px + env(safe-area-inset-bottom));
      border-left: none;
      border-top: 1px solid var(--line);
      border-radius: 20px 20px 0 0;
    }
    .grabber {
      display: block;
      width: 40px;
      height: 4px;
      margin: 0 auto 12px;
      border-radius: 999px;
      background: var(--line-strong);
    }
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: start;
    gap: 8px;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 12px;
    margin: 6px 0 0;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .meta time {
    font-weight: 600;
    color: var(--text);
  }
  .category {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    text-transform: capitalize;
  }
  .swatch {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    background: var(--c);
  }
  .tier {
    border: 1px solid color-mix(in srgb, var(--c) 50%, var(--line));
    color: var(--text);
    border-radius: 999px;
    padding: 0 8px;
    font-size: 0.72rem;
    font-weight: 600;
  }

  .close {
    font: inherit;
    font-size: 1.4rem;
    line-height: 1;
    width: 36px;
    height: 36px;
    border: 1px solid var(--line);
    border-radius: 50%;
    background: var(--surface);
    color: var(--muted);
    cursor: pointer;
    flex: none;
  }
  .close:hover,
  .close:focus-visible {
    background: var(--band);
    color: var(--text);
  }

  h2 {
    font-family: var(--font-display);
    font-size: 1.6rem;
    font-weight: 600;
    line-height: 1.15;
    letter-spacing: -0.015em;
    margin: 14px 0 14px;
    outline: none;
  }
  h3 {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    margin: 26px 0 8px;
  }

  p {
    line-height: 1.65;
  }
  .summary {
    font-size: 1.05rem;
    font-weight: 500;
    line-height: 1.55;
  }

  .prose :global(code) {
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    font-size: 0.86em;
    padding: 1px 5px;
    border-radius: 5px;
    background: var(--surface-2);
    border: 1px solid var(--line);
  }
  .prose :global(a),
  .notes :global(a),
  .popover :global(a:not(.popover-action)) {
    color: var(--accent);
    text-underline-offset: 2px;
  }
  .prose ul,
  .prose ol {
    padding-left: 22px;
    line-height: 1.6;
  }
  .prose li + li {
    margin-top: 4px;
  }
  blockquote {
    margin: 14px 0;
    padding: 4px 0 4px 14px;
    border-left: 3px solid color-mix(in srgb, var(--c) 60%, var(--line));
    color: var(--muted);
    font-style: italic;
    line-height: 1.6;
  }

  .notes {
    margin: 0;
    padding: 0 0 0 22px;
    font-size: 0.84rem;
    line-height: 1.55;
    color: var(--muted);
  }
  .notes li {
    padding: 2px 4px;
    border-radius: 6px;
    scroll-margin: 24px;
  }
  .notes li + li {
    margin-top: 4px;
  }
  .notes li:focus {
    outline: none;
    background: var(--accent-soft);
    color: var(--text);
  }
  .back {
    all: unset;
    cursor: pointer;
    margin-left: 4px;
    padding: 0 4px;
    border-radius: 4px;
    color: var(--accent);
    font-weight: 700;
  }
  .back:hover,
  .back:focus-visible {
    background: var(--accent-soft);
  }

  .popover {
    position: absolute;
    z-index: 5;
    width: min(300px, calc(100% - 32px));
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid var(--line-strong);
    border-top: 3px solid var(--accent);
    background: var(--surface);
    box-shadow: var(--shadow-lg);
    font-size: 0.86rem;
    line-height: 1.5;
    animation: pop 120ms ease-out;
  }
  .popover.cn {
    border-top-color: var(--warn);
  }
  .popover p {
    margin: 0 0 8px;
    line-height: 1.5;
  }
  .popover-title {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .popover-action {
    all: unset;
    cursor: pointer;
    font-weight: 600;
    color: var(--accent);
  }
  .popover.cn .popover-action {
    color: var(--warn);
  }
  .popover-action:hover,
  .popover-action:focus-visible {
    text-decoration: underline;
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .popover {
      animation: none;
    }
  }

  .needs-source {
    font-size: 0.84rem;
    margin: 0 0 8px;
    padding: 8px 12px;
    border-radius: 10px;
    border: 1px dashed color-mix(in srgb, var(--warn) 60%, var(--line));
    color: var(--muted);
  }
  .needs-source a {
    color: var(--warn);
    font-weight: 600;
  }

  .notice {
    font-size: 0.85rem;
    border: 1px solid var(--line-strong);
    border-radius: 10px;
    padding: 8px 12px;
  }
  .notice.warn {
    border-color: var(--warn);
  }

  .facts {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 16px;
    font-size: 0.88rem;
    margin: 18px 0 0;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--surface-2);
    border: 1px solid var(--line);
  }
  .facts dt {
    color: var(--muted);
  }
  .facts dt {
    padding-top: 3px;
  }
  .facts dd {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    font: inherit;
    font-size: 0.82rem;
    line-height: 1.3;
    padding: 2px 10px;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    transition:
      border-color 0.15s,
      background 0.15s;
  }
  .chip:hover,
  .facet-link:hover {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .chip[aria-pressed='true'],
  .facet-link[aria-pressed='true'] {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--surface);
  }
  .chip:focus-visible,
  .facet-link:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .facts-hint {
    margin: 6px 2px 0;
    font-size: 0.75rem;
    color: var(--muted);
  }
  .facet-link {
    font: inherit;
    color: inherit;
    padding: 1px 8px;
    margin: -1px 0;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    background: transparent;
    cursor: pointer;
  }

  .links {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 8px;
    font-size: 0.9rem;
  }
  .sources .source {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 9px 12px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface-2);
  }
  .sources .source a {
    font-weight: 500;
  }
  .sources .placeholder {
    height: 46px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: linear-gradient(90deg, var(--surface-2) 30%, var(--line) 50%, var(--surface-2) 70%) 0 0 / 300% 100%;
    animation: shimmer 1.4s linear infinite;
  }
  .sources .placeholder.short {
    width: 70%;
  }
  @keyframes shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: 0 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .sources .placeholder {
      animation: none;
    }
  }
  .load-error {
    font-size: 0.88rem;
    color: var(--muted);
  }
  .retry {
    font: inherit;
    color: var(--accent);
    background: none;
    border: 0;
    padding: 0;
    text-decoration: underline;
    cursor: pointer;
  }
  .sources .muted {
    font-size: 0.78rem;
  }
  .relation {
    display: inline-block;
    min-width: 6.5em;
    font-size: 0.75rem;
    color: var(--muted);
    text-transform: capitalize;
  }
  .link {
    all: unset;
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 0.18em;
    cursor: pointer;
  }
  .link:focus-visible {
    outline: 2px solid var(--accent);
  }
  .muted {
    color: var(--muted);
  }
  .contribute {
    margin-top: 28px;
    padding: 16px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: color-mix(in srgb, var(--c, var(--accent)) 5%, var(--surface-2));
  }
  .contribute h3 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    text-transform: none;
    color: var(--text);
  }
  .contribute-note {
    margin: 2px 0 12px;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .actions {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 8px;
  }
  .action {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    height: 100%;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    text-decoration: none;
    transition:
      border-color 0.15s,
      background 0.15s;
  }
  .action:hover {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 6%, var(--surface));
  }
  .action:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .action svg {
    flex: none;
    width: 18px;
    height: 18px;
    margin-top: 1px;
    fill: none;
    stroke: var(--accent);
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .action-text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    line-height: 1.3;
  }
  .action-label {
    font-size: 0.86rem;
    font-weight: 600;
  }
  .action-hint {
    font-size: 0.75rem;
    color: var(--muted);
  }
  .discussion {
    display: inline-block;
    margin-top: 12px;
    font-size: 0.82rem;
  }
</style>
