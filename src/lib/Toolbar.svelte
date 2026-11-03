<script lang="ts">
  import type { TimelineEvent } from './types'
  import { buildIndex, search } from './search'
  import { facets, isActive, toggle, NO_FILTERS, type Filters } from './filters'
  import type { Prefs } from './prefs'
  import { formatDate } from './dates'

  interface Props {
    events: TimelineEvent[]
    filters: Filters
    matching: number
    prefs: Prefs
    onpick: (id: string) => void
    onfilters: (f: Filters) => void
    onprefs: (p: Prefs) => void
  }

  let { events, filters, matching, prefs, onpick, onfilters, onprefs }: Props = $props()

  const index = $derived(buildIndex(events))
  const options = $derived(facets(events))

  let query = $state('')
  let active = $state(0)
  let listOpen = $state(false)
  let panel = $state<'filters' | 'display' | null>(null)
  let input: HTMLInputElement | undefined = $state()
  let root: HTMLDivElement | undefined = $state()

  const results = $derived(search(index, query))
  const filterCount = $derived(filters.categories.length + filters.organizations.length + filters.tags.length)

  export function focusSearch() {
    input?.focus()
    input?.select()
  }

  function pick(ev: TimelineEvent) {
    onpick(ev.id)
    query = ''
    listOpen = false
    input?.blur()
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' && results.length) {
      listOpen = true
      active = (active + 1) % results.length
    } else if (e.key === 'ArrowUp' && results.length) {
      listOpen = true
      active = (active - 1 + results.length) % results.length
    } else if (e.key === 'Enter' && results[active]) {
      pick(results[active])
    } else if (e.key === 'Escape') {
      if (query) query = ''
      else input?.blur()
      listOpen = false
    } else return
    e.preventDefault()
    e.stopPropagation()
  }

  function set(field: keyof Filters, value: string) {
    onfilters({ ...filters, [field]: toggle(filters[field], value) })
  }

  // Close popovers on an outside click.
  function onwindowclick(e: MouseEvent) {
    if (root && !root.contains(e.target as Node)) {
      panel = null
      listOpen = false
    }
  }
</script>

<svelte:window onclick={onwindowclick} />

<div class="toolbar" bind:this={root}>
  <div class="search">
    <label class="visually-hidden" for="search">Search events</label>
    <input
      id="search"
      bind:this={input}
      bind:value={query}
      type="search"
      placeholder="Search events  /"
      autocomplete="off"
      spellcheck="false"
      role="combobox"
      aria-expanded={listOpen && !!query}
      aria-controls="search-results"
      aria-activedescendant={listOpen && results[active] ? `result-${results[active].id}` : undefined}
      oninput={() => {
        active = 0
        listOpen = true
      }}
      onfocus={() => (listOpen = true)}
      {onkeydown}
    />
    {#if listOpen && query}
      <ul id="search-results" class="results" role="listbox" aria-label="Search results">
        {#each results as ev, i (ev.id)}
          <!-- Keyboard users pick with the arrow keys and Enter in the search box (combobox pattern). -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <li
            id="result-{ev.id}"
            role="option"
            aria-selected={i === active}
            class:active={i === active}
            onmousedown={(e) => e.preventDefault()}
            onclick={() => pick(ev)}
            onmouseenter={() => (active = i)}
          >
            <span class="r-date">{formatDate(ev.date)}</span>
            <span class="r-title">{ev.title}</span>
          </li>
        {:else}
          <li class="empty" role="presentation">No events match “{query}”.</li>
        {/each}
      </ul>
    {/if}
  </div>

  <button
    class="tool"
    class:on={filterCount > 0}
    aria-expanded={panel === 'filters'}
    aria-controls="filters-panel"
    onclick={() => (panel = panel === 'filters' ? null : 'filters')}
  >
    Filters{#if filterCount}<span class="count">{filterCount}</span>{/if}
  </button>
  <button
    class="tool"
    aria-expanded={panel === 'display'}
    aria-controls="display-panel"
    onclick={() => (panel = panel === 'display' ? null : 'display')}>Display</button
  >

  {#if isActive(filters)}
    <p class="status" aria-live="polite">
      {matching} of {events.length} events match.
      <button class="linkish" onclick={() => onfilters({ ...NO_FILTERS })}>Clear</button>
    </p>
  {/if}

  {#if panel === 'filters'}
    <div id="filters-panel" class="panel" role="group" aria-label="Filters">
      <p class="hint">Events that don't match fade out but stay on the timeline.</p>
      {#each [{ field: 'categories', label: 'Category', list: options.categories }, { field: 'organizations', label: 'Organization', list: options.organizations }, { field: 'tags', label: 'Tag', list: options.tags }] as group (group.field)}
        {@const field = group.field as keyof Filters}
        {#if group.list.length}
          <fieldset>
            <legend>{group.label}</legend>
            <div class="chips">
              {#each group.list as opt (opt.value)}
                <button
                  class="chip"
                  class:capital={field === 'categories'}
                  aria-pressed={filters[field].includes(opt.value)}
                  onclick={() => set(field, opt.value)}
                >
                  {opt.value} <span class="n">{opt.count}</span>
                </button>
              {/each}
            </div>
          </fieldset>
        {/if}
      {/each}
      {#if filterCount}
        <button class="linkish" onclick={() => onfilters({ ...NO_FILTERS })}>Clear all filters</button>
      {/if}
    </div>
  {/if}

  {#if panel === 'display'}
    <div id="display-panel" class="panel narrow" role="group" aria-label="Display">
      <fieldset>
        <legend>Theme</legend>
        <div class="segmented">
          {#each [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']] as [value, label] (value)}
            <button aria-pressed={prefs.theme === value} onclick={() => onprefs({ ...prefs, theme: value as Prefs['theme'] })}
              >{label}</button
            >
          {/each}
        </div>
      </fieldset>
      <fieldset>
        <legend>Motion</legend>
        <div class="segmented">
          {#each [['system', 'System'], ['reduce', 'Reduced'], ['full', 'Full']] as [value, label] (value)}
            <button aria-pressed={prefs.motion === value} onclick={() => onprefs({ ...prefs, motion: value as Prefs['motion'] })}
              >{label}</button
            >
          {/each}
        </div>
      </fieldset>
    </div>
  {/if}
</div>

<style>
  .toolbar {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 10px 0;
  }

  .search {
    position: relative;
    flex: 1 1 140px;
    max-width: 420px;
  }
  input {
    width: 100%;
    font: inherit;
    font-size: 0.95rem;
    padding: 7px 12px;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    background: var(--surface);
    color: var(--text);
  }
  input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .results {
    position: absolute;
    z-index: 30;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    list-style: none;
    margin: 0;
    padding: 4px;
    max-height: 60vh;
    overflow-y: auto;
    background: var(--surface);
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.12);
  }
  .results li {
    padding: 6px 8px;
    border-radius: 6px;
    cursor: pointer;
    line-height: 1.3;
  }
  .results li.active {
    background: var(--band);
  }
  .results .empty {
    color: var(--muted);
    cursor: default;
  }
  .r-date {
    display: block;
    font-size: 0.72rem;
    color: var(--muted);
  }
  .r-title {
    font-size: 0.9rem;
  }

  .tool {
    font: inherit;
    font-size: 0.9rem;
    padding: 7px 12px;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
  }
  .tool:hover,
  .tool[aria-expanded='true'] {
    border-color: var(--accent);
  }
  .tool.on {
    border-color: var(--accent);
    color: var(--accent);
  }
  .count {
    display: inline-block;
    margin-left: 6px;
    min-width: 1.4em;
    padding: 0 5px;
    border-radius: 999px;
    background: var(--accent);
    color: var(--surface);
    font-size: 0.75rem;
    text-align: center;
  }

  .status {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .panel {
    position: absolute;
    z-index: 30;
    top: calc(100% - 2px);
    left: 0;
    width: min(560px, 100%);
    max-height: 70vh;
    overflow-y: auto;
    padding: 12px 14px;
    background: var(--surface);
    border: 1px solid var(--line-strong);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.12);
  }
  .panel.narrow {
    width: min(320px, 100%);
  }
  .hint {
    margin: 0 0 8px;
    font-size: 0.8rem;
    color: var(--muted);
  }
  fieldset {
    border: none;
    margin: 0 0 12px;
    padding: 0;
  }
  legend {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
    margin-bottom: 6px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    font: inherit;
    font-size: 0.82rem;
    padding: 3px 10px;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    background: transparent;
    color: var(--text);
    cursor: pointer;
  }
  .chip.capital {
    text-transform: capitalize;
  }
  .chip[aria-pressed='true'] {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--surface);
  }
  .chip .n {
    opacity: 0.65;
    font-size: 0.75rem;
  }

  .segmented {
    display: inline-flex;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    overflow: hidden;
  }
  .segmented button {
    font: inherit;
    font-size: 0.85rem;
    padding: 5px 12px;
    border: none;
    background: transparent;
    color: var(--text);
    cursor: pointer;
  }
  .segmented button + button {
    border-left: 1px solid var(--line-strong);
  }
  .segmented button[aria-pressed='true'] {
    background: var(--accent);
    color: var(--surface);
  }

  .linkish {
    font: inherit;
    font-size: inherit;
    padding: 0;
    border: none;
    background: none;
    color: var(--accent);
    text-decoration: underline;
    cursor: pointer;
  }

  .chip:focus-visible,
  .tool:focus-visible,
  .segmented button:focus-visible,
  .linkish:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
