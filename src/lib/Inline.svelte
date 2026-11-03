<script lang="ts">
  import type { Inline } from './markdown'
  import Self from './Inline.svelte'

  interface Props {
    nodes: Inline[]
    /** Called when a {citation needed} or note marker is selected. */
    onmarker?: (marker: { kind: 'cn'; i: number } | { kind: 'note'; n: number }, target: HTMLElement) => void
    /** The marker whose popover is open, so its button can say so. */
    open?: string | null
  }

  let { nodes, onmarker, open = null }: Props = $props()
</script>

{#each nodes as node, i (i)}{#if node.kind === 'text'}{node.text}{:else if node.kind === 'strong'}<strong
      ><Self nodes={node.children} {onmarker} {open} /></strong
    >{:else if node.kind === 'em'}<em><Self nodes={node.children} {onmarker} {open} /></em>{:else if node.kind === 'code'}<code
      >{node.text}</code
    >{:else if node.kind === 'link'}<a href={node.href} rel="noopener noreferrer" target="_blank"
      ><Self nodes={node.children} {onmarker} {open} /></a
    >{:else if node.kind === 'cn'}<sup class="marker cn"
      ><button
        id="cn-ref-{node.i}"
        aria-expanded={open === `cn-${node.i}`}
        aria-haspopup="dialog"
        onclick={(e) => onmarker?.(node, e.currentTarget)}>citation needed</button
      ></sup
    >{:else if node.kind === 'note'}<sup class="marker note"
      ><button
        id="note-ref-{node.n}"
        aria-label="Note {node.n}"
        aria-expanded={open === `note-${node.n}`}
        aria-haspopup="dialog"
        onclick={(e) => onmarker?.(node, e.currentTarget)}>{node.n}</button
      ></sup
    >{/if}{/each}

<style>
  sup {
    line-height: 0;
    margin-left: 1px;
  }
  .marker button {
    all: unset;
    cursor: pointer;
    font-size: 0.68rem;
    font-weight: 700;
    line-height: 1;
    padding: 1px 2px;
    border-radius: 4px;
    white-space: nowrap;
  }
  .marker button::before {
    content: '[';
  }
  .marker button::after {
    content: ']';
  }
  .cn button {
    color: var(--warn);
    letter-spacing: 0.02em;
  }
  .note button {
    color: var(--accent);
  }
  .marker button:hover,
  .marker button[aria-expanded='true'] {
    background: var(--accent-soft);
  }
  .cn button:hover,
  .cn button[aria-expanded='true'] {
    background: color-mix(in srgb, var(--warn) 16%, transparent);
  }
  .marker button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
</style>
