export interface Era {
  id: string
  name: string
  start: number
  /** Omitted for the current era, which runs to now. */
  end?: number
  /** Hue (0-360) of the era's abstract artwork ink. */
  hue?: number
}

/** Editorial era bands, newest first. Boundaries are years. */
export const ERAS: Era[] = [
  { id: 'generative', hue: 173, name: 'Generative and agentic AI', start: 2022 },
  { id: 'transformers', hue: 268, name: 'Transformers and scale', start: 2017, end: 2022 },
  { id: 'deep-learning', hue: 235, name: 'Deep learning', start: 2012, end: 2017 },
  { id: 'statistical', hue: 145, name: 'Statistical machine learning', start: 1993, end: 2012 },
  { id: 'expert-systems', hue: 35, name: 'Expert systems and the second AI winter', start: 1980, end: 1993 },
  { id: 'symbolic', hue: 15, name: 'Symbolic AI and the first AI winter', start: 1956, end: 1980 },
  { id: 'foundations', hue: 45, name: 'Foundations', start: 1940, end: 1956 },
]
