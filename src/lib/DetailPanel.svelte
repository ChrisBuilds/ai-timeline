<script lang="ts">
  import type { TimelineEvent } from './types'
  import { formatRange } from './dates'
  import { TIER_NAMES } from './tiers'

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

<aside class="panel" aria-labelledby="panel-title">
  <header>
    <p class="meta">
      <time datetime={event.date}>{formatRange(event.date, event.end_date)}</time>
      <span class="category">{event.category}</span>
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
  <ul class="links">
    {#each event.sources as s (s.url)}
      <li>
        <a href={s.url} rel="noopener noreferrer" target="_blank">{s.title}</a>
        <span class="muted">· {s.publisher}</span>
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
    <a href={editUrl} target="_blank" rel="noopener noreferrer">Suggest a correction</a>
    {#if event.issue}
      · <a href="https://github.com/ChrisBuilds/ai-timeline/issues/{event.issue}" target="_blank" rel="noopener noreferrer">Discussion</a>
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
    width: min(400px, 100vw);
    overflow-y: auto;
    padding: 16px 20px 32px;
    background: var(--surface);
    border-left: 1px solid var(--line);
    box-shadow: -8px 0 24px rgb(0 0 0 / 0.08);
  }

  @media (max-width: 719px) {
    .panel {
      top: auto;
      left: 0;
      width: 100%;
      max-height: 70vh;
      border-left: none;
      border-top: 1px solid var(--line);
      border-radius: 12px 12px 0 0;
      box-shadow: 0 -8px 24px rgb(0 0 0 / 0.12);
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
    gap: 8px;
    margin: 6px 0 0;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .category {
    text-transform: capitalize;
  }
  .tier {
    border: 1px solid currentColor;
    border-radius: 999px;
    padding: 0 6px;
  }

  .close {
    font: inherit;
    font-size: 1.5rem;
    line-height: 1;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 8px;
    background: transparent;
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
    font-size: 1.25rem;
    margin: 8px 0 12px;
    outline: none;
  }
  h3 {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
    margin: 20px 0 6px;
  }

  .summary {
    font-weight: 500;
  }

  .notice {
    font-size: 0.85rem;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    padding: 6px 10px;
  }
  .notice.warn {
    border-color: var(--warn);
  }

  .facts {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 12px;
    font-size: 0.85rem;
    margin: 12px 0 0;
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
    gap: 6px;
    font-size: 0.9rem;
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
    cursor: pointer;
  }
  .link:focus-visible {
    outline: 2px solid var(--accent);
  }
  .muted {
    color: var(--muted);
  }
  .footer {
    margin-top: 24px;
    font-size: 0.85rem;
  }
</style>
