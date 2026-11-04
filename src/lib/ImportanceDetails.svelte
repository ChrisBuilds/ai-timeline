<script lang="ts">
  import type { Importance, TimelineEvent, DimensionName } from './types'
  import { legacyScore, scoreRange } from '../../scripts/importance.mjs'
  let { importance, event, byId, onselect }: {
    importance: Importance
    event: TimelineEvent
    byId: Map<string, TimelineEvent>
    onselect: (id: string) => void
  } = $props()
  const labels: Record<DimensionName, string> = {
    influence: 'Downstream influence · 35%', adoption: 'Adoption and practical reach · 30%',
    capability: 'Capability or conceptual advance · 25%', society: 'Societal and institutional reach · 10%',
  }
  function comparisonTarget(id: string) {
    return byId.get(id) ?? [...byId.values()].find((e) => e.aliases?.includes(id))
  }
  let evidenceOpen = $state(false)
  const current = $derived(importance.assessments?.find((a) => a.id === importance.current))
  const history = $derived([...(importance.assessments ?? [])].sort((a, b) => b.assessed_at.localeCompare(a.assessed_at) || b.id.localeCompare(a.id)))
</script>

<section class="importance" aria-label="Historical significance">
  <h3>Historical significance</h3>
  {#if event.score_basis === 'v2-lower-bound'}
    <p><strong>No accepted point score.</strong> Provisional range: {event.score_range?.join('–')}/100. Placement uses its lower bound.</p>
  {:else}
  <p><strong>{event.score}/100</strong> · {event.score_status === 'provisional' ? 'Retained score while reassessment is provisional' : event.score_status === 'legacy' ? 'Legacy assessment' : 'Accepted assessment'}</p>
  {/if}
  {#if current}<p>Assessed {current.assessed_at} · Review by {current.review_after}</p>{/if}
  <details class="assessment-evidence" ontoggle={(e) => { evidenceOpen = e.currentTarget.open }}>
    <summary>Assessment evidence and history</summary>
  {#if evidenceOpen}
  {#each history as assessment (assessment.id)}
    {@const range = scoreRange(assessment)}
    <details open={assessment.id === importance.current}>
      <summary>{assessment.assessed_at} · {assessment.rubric_version} · {assessment.status}{assessment.id === importance.current ? ' · Current' : ''}</summary>
      <p>{assessment.rationale}</p>
      <p>{assessment.override !== undefined ? `Override: ${assessment.override}/100` : range[0] === range[1] ? `Rubric score: ${range[0]}/100` : `Possible score: ${range[0]}–${range[1]}/100; unknown dimensions remain unrated.`}</p>
      {#if assessment.override_reason}<p>{assessment.override_reason} Review by {assessment.override_review_after}.</p>{/if}
      <dl>
        {#each Object.entries(assessment.dimensions) as [name, dimension]}
          <dt>{labels[name as DimensionName]}: {dimension.rating === null ? 'Unknown' : `${dimension.rating}/5`}</dt>
          <dd>
            <span class="confidence">{dimension.confidence} confidence</span>
            <p>{dimension.rationale}</p>
            {#each dimension.evidence as url, i}
              <a href={url} target="_blank" rel="noopener noreferrer">Evidence {i + 1}</a>{' '}
            {/each}
          </dd>
        {/each}
      </dl>
      {#if assessment.overview_reason}<p><strong>Overview milestone.</strong> {assessment.overview_reason}</p>{/if}
      <h4>Comparisons</h4>
      {#each assessment.comparisons as comparison}
        {@const target = comparisonTarget(comparison.id)}
        <p><button class="comparison" disabled={!target} onclick={() => { if (target) onselect(target.id) }}>{target?.title ?? `${comparison.id} (no longer on the timeline)`}</button><br />{comparison.rationale}</p>
      {/each}
      {#if assessment.questions.length}
        <h4>Open questions</h4>
        <ul>{#each assessment.questions as question}<li>{question}</li>{/each}</ul>
      {/if}
      <p>Review by {assessment.review_after}. {assessment.reviewer}.</p>
      <ul>{#each assessment.review_triggers as trigger}<li>{trigger}</li>{/each}</ul>
    </details>
  {/each}
  {#if importance.rubric}
  <details>
    <summary>Original assessment · v1 · {legacyScore(importance)}/100</summary>
    <p>Original assessment date unknown.{importance.legacy ? ` Preserved on ${importance.legacy.migrated_at}.` : ''}</p>
    <p>Capability {importance.rubric.capability}/5 · Adoption {importance.rubric.adoption}/5 · Impact {importance.rubric.impact}/5 · Culture {importance.rubric.culture}/5</p>
    <p>Original formula: half the average plus half the maximum, scaled from 1–5 to 0–100.</p>
    {#if importance.override !== undefined}<p>Original override: {importance.override}. {importance.override_reason}</p>{/if}
  </details>
  {/if}
  {/if}
  </details>
</section>

<style>
  .importance { border-top: 1px solid var(--line); margin-top: 24px; padding-top: 8px; font-size: 0.85rem; line-height: 1.55; }
  h3 { font-size: 1rem; }
  h4 { margin-bottom: 8px; }
  details { margin: 12px 0; }
  summary { cursor: pointer; font-weight: 600; }
  dt { margin-top: 16px; font-weight: 600; }
  dd { margin: 4px 0 0; }
  dd p { margin: 4px 0; }
  .confidence { color: var(--muted); font-size: 0.78rem; }
  a, .comparison { color: var(--context-accent); overflow-wrap: anywhere; }
  .comparison { border: 0; background: none; padding: 0; font: inherit; text-align: left; text-decoration: underline; cursor: pointer; }
  .comparison:disabled { color: var(--muted); text-decoration: none; cursor: default; }
  ul { padding-left: 20px; }
</style>
