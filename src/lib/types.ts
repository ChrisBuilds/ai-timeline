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

export interface TimelineEvent {
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

export interface TimelineData {
  generated: string
  events: TimelineEvent[]
  removed: RemovedEvent[]
}
