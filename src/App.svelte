<script lang="ts">
  import { onMount } from 'svelte'
  import type { TimelineData, TimelineEvent, RemovedEvent } from './lib/types'
  import { formatRange } from './lib/dates'

  let data = $state<TimelineData | null>(null)
  let error = $state<string | null>(null)
  let hash = $state('')

  const years = $derived.by(() => {
    const groups: { year: string; events: TimelineEvent[] }[] = []
    for (const ev of data?.events ?? []) {
      const year = ev.date.slice(0, 4)
      const last = groups.at(-1)
      if (last?.year === year) last.events.push(ev)
      else groups.push({ year, events: [ev] })
    }
    return groups
  })

  // A link to a removed or merged event shows a note instead of nothing.
  const removedNote = $derived.by((): RemovedEvent | null => {
    if (!hash || !data) return null
    if (data.events.some((e) => e.id === hash)) return null
    return data.removed.find((r) => r.id === hash) ?? null
  })

  function syncHash() {
    hash = decodeURIComponent(location.hash.slice(1))
    if (!data || !hash) return
    const target = data.events.find((e) => e.id === hash || e.aliases?.includes(hash))
    if (target) requestAnimationFrame(() => document.getElementById(target.id)?.scrollIntoView({ block: 'center' }))
  }

  onMount(() => {
    fetch(`${import.meta.env.BASE_URL}data/events.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: TimelineData) => {
        data = d
        syncHash()
      })
      .catch((e) => (error = `Could not load events: ${e.message}`))
    addEventListener('hashchange', syncHash)
    return () => removeEventListener('hashchange', syncHash)
  })
</script>

<header>
  <h1>AI Timeline</h1>
  <p class="lede">Artificial intelligence from the 1956 Dartmouth workshop to now. Every event is sourced and reviewed.</p>
  <p class="contribute">
    Missing something? <a href="https://github.com/ChrisBuilds/ai-timeline/issues/new/choose">Suggest an event</a>.
  </p>
</header>

<main>
  {#if removedNote}
    <aside class="notice" role="status">
      This event was removed ({removedNote.reason}).
      {#if removedNote.duplicate_of}
        It was merged into <a href={`#${removedNote.duplicate_of}`}>another event</a>.
      {/if}
      {#if removedNote.note}{removedNote.note}{/if}
    </aside>
  {/if}

  {#if error}
    <p class="notice">{error}</p>
  {:else if !data}
    <p class="muted">Loading…</p>
  {:else}
    <div class="now" aria-hidden="true">Now</div>
    <ol class="timeline">
      {#each years as group (group.year)}
        <li class="year">
          <h2>{group.year}</h2>
          <ol>
            {#each group.events as ev (ev.id)}
              <li>
                <article id={ev.id} class:selected={hash === ev.id || ev.aliases?.includes(hash)}>
                  <p class="meta">
                    <time datetime={ev.date}>{formatRange(ev.date, ev.end_date)}</time>
                    <span class="category">{ev.category}</span>
                    {#if ev.developing}<span class="badge">developing</span>{/if}
                    {#if ev.disputed}<span class="badge warn">disputed</span>{/if}
                  </p>
                  <h3><a href={`#${ev.id}`}>{ev.title}</a></h3>
                  <p>{ev.summary}</p>
                  <p class="sources">
                    {#each ev.sources as s, i}
                      {#if i > 0} · {/if}<a href={s.url} rel="noopener">{s.publisher}</a>
                    {/each}
                  </p>
                </article>
              </li>
            {/each}
          </ol>
        </li>
      {/each}
    </ol>
  {/if}
</main>

<footer class="muted">
  Data and code on <a href="https://github.com/ChrisBuilds/ai-timeline">GitHub</a>.
  {#if data}Updated {data.generated.slice(0, 10)}.{/if}
</footer>
