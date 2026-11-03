// Mirrors schema/event.schema.json. Keep the two in sync.

export type Category =
  | 'research'
  | 'model release'
  | 'product'
  | 'company and funding'
  | 'policy and regulation'
  | 'safety and security incident'
  | 'hardware and compute'
  | 'benchmark milestone'
  | 'open source'
  | 'culture and society'
  | 'misinformation'

export interface Source {
  url: string
  title: string
  publisher: string
  accessed: string
  archived_url?: string
}

export interface Artifact {
  type: 'paper' | 'repo' | 'model card' | 'video' | 'dataset' | 'post' | 'image'
  url: string
  title: string
}

export interface Related {
  id: string
  relation: 'builds_on' | 'responds_to' | 'supersedes'
  source?: string
}

/** One event in full, as written in events/ and in data/events.json. */
export interface EventRecord {
  id: string
  title: string
  date: string
  end_date?: string
  summary: string
  description?: string
  category: Category
  tags?: string[]
  organizations?: string[]
  people?: string[]
  sources: Source[]
  artifacts?: Artifact[]
  related?: Related[]
  importance: {
    rubric: { capability: number; adoption: number; impact: number; culture: number }
    override?: number
    override_reason?: string
  }
  aliases?: string[]
  disputed?: { issue: number; reason: string }
  developing?: { since: string; recheck: string; issue?: number }
  submitted_by?: string
  issue?: number
  /** Computed at build time by scripts/importance.mjs. */
  score: number
  tier: 1 | 2 | 3 | 4
}

export interface RemovedEvent {
  id: string
  reason: 'duplicate' | 'hoax' | 'unverified' | 'out-of-scope'
  duplicate_of?: string
  note?: string
  issue?: number
  removed_at?: string
}

/** Fields only the detail panel shows, in data/details/<id>.json. Mirrors scripts/split-event.mjs. */
export type DetailField = 'description' | 'sources' | 'artifacts' | 'importance' | 'submitted_by' | 'issue'

export type EventDetails = Pick<EventRecord, DetailField>

/** An event as the timeline loads it from data/index.json: everything but its details. */
export type TimelineEvent = Omit<EventRecord, DetailField | 'related'> & {
  related?: Omit<Related, 'source'>[]
}

/** data/index.json */
export interface TimelineData {
  generated: string
  events: TimelineEvent[]
  removed: RemovedEvent[]
}
