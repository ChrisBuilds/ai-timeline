<script lang="ts">
  import type { TimelineEvent } from './types'
  import { formatRange } from './dates'
  import { TIER_NAMES } from './tiers'
  import { categoryColor } from './categories'

  interface Props {
    event: TimelineEvent
    byId: Map<string, TimelineEvent>
    /** Events that link to this one. */
    backlinks: TimelineEvent[]
    onselect: (id: string) => void
    onclose: () => void
  }

  let { event, byId, backlinks, onselect, onclose }: Props = $props()

  const RELATION_LABEL = {
    builds_on: 'Builds on',
    responds_to: 'Responds to',
    supersedes: 'Supersedes',
  } as const

  // Descriptions are markdown; render them as plain paragraphs for now so no HTML is injected.
  const paragraphs = $derived((event.description ?? '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean))

  const editUrl = $derived(
    `https://github.com/ChrisBuilds/ai-timeline/issues/new?template=2-update-event.yml&title=${encodeURIComponent(
      `Update: ${event.title}`,
    )}&event=${encodeURIComponent(event.id)}`,
  )

  let heading: HTMLHeadingElement | undefined = $state()
  $effect(() => {
    // Move focus to the panel when a new event opens, for keyboard and screen reader users.
    void event.id
    heading?.focus({ preventScroll: true })
  })
</script>

<aside class="panel" aria-labelledby="panel-title" style:--c={categoryColor(event.category)}>
  <span class="grabber" aria-hidden="true"></span>
  <header>
    <p class="meta">
      <time datetime={event.date}>{formatRange(event.date, event.end_date)}</time>
      <span class="category"><span class="swatch" aria-hidden="true"></span>{event.category}</span>
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
  {#each paragraphs as p, i (i)}
    <p>{p}</p>
  {/each}

  {#if event.organizations?.length || event.people?.length}
    <dl class="facts">
      {#if event.organizations?.length}
        <dt>Organizations</dt>
        <dd>{event.organizations.join(', ')}</dd>
      {/if}
      {#if event.people?.length}
        <dt>People</dt>
        <dd>{event.people.join(', ')}</dd>
      {/if}
    </dl>
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
  <ul class="links sources">
    {#each event.sources as s (s.url)}
      <li class="source">
        <a href={s.url} rel="noopener noreferrer" target="_blank">{s.title}</a>
        <span class="muted">{s.publisher}</span>
        {#if s.archived_url}<a class="muted" href={s.archived_url} rel="noopener noreferrer" target="_blank">(archived)</a>{/if}
      </li>
    {/each}
  </ul>

  {#if event.artifacts?.length}
    <h3>Artifacts</h3>
    <ul class="links">
      {#each event.artifacts as a (a.url)}
        <li>
          <span class="relation">{a.type}</span>
          <a href={a.url} rel="noopener noreferrer" target="_blank">{a.title}</a>
        </li>
      {/each}
    </ul>
  {/if}

  <p class="footer">
    <a class="pill" href={editUrl} target="_blank" rel="noopener noreferrer">Suggest a correction</a>
    {#if event.issue}
      <a class="pill" href="https://github.com/ChrisBuilds/ai-timeline/issues/{event.issue}" target="_blank" rel="noopener noreferrer">Discussion</a>
    {/if}
  </p>
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
    animation: slide-in 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .panel::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 120px;
    background: linear-gradient(180deg, color-mix(in srgb, var(--c) 16%, transparent), transparent);
    pointer-events: none;
  }
  .panel > :global(*) {
    position: relative;
  }
  .grabber {
    display: none;
  }
  @keyframes slide-in {
    from {
      transform: translateX(24px);
      opacity: 0;
    }
  }

  @media (max-width: 719px) {
    .panel {
      top: auto;
      left: 0;
      width: 100%;
      max-height: 72vh;
      padding: 10px 20px calc(32px + env(safe-area-inset-bottom));
      border-left: none;
      border-top: 1px solid var(--line);
      border-radius: 20px 20px 0 0;
      animation-name: slide-up;
    }
    .grabber {
      display: block;
      width: 40px;
      height: 4px;
      margin: 0 auto 12px;
      border-radius: 999px;
      background: var(--line-strong);
    }
    @keyframes slide-up {
      from {
        transform: translateY(32px);
        opacity: 0;
      }
    }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(:root:not([data-motion='full'])) .panel {
      animation: none;
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
  .facts dd {
    margin: 0;
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
  .footer {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 28px;
    font-size: 0.85rem;
  }
  .pill {
    padding: 6px 12px;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    text-decoration: none;
    font-weight: 500;
  }
  .pill:hover {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
</style>
