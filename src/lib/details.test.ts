import { describe, expect, it, vi } from 'vitest'
import { createDetailsLoader } from './details'

const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))

describe('createDetailsLoader', () => {
  it('fetches each event once', async () => {
    const fetcher = vi.fn(() => ok({ sources: [] }))
    const load = createDetailsLoader('/base/', fetcher as unknown as typeof fetch)
    await Promise.all([load('2024-a'), load('2024-a')])
    await load('2024-a')
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledWith('/base/data/details/2024-a.json')
  })

  it('tries again after a failure', async () => {
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => Promise.resolve(new Response('', { status: 503 })))
      .mockImplementationOnce(() => ok({ sources: [{ url: 'u' }] }))
    const load = createDetailsLoader('/', fetcher as unknown as typeof fetch)
    await expect(load('x')).rejects.toThrow('HTTP 503')
    await expect(load('x')).resolves.toEqual({ sources: [{ url: 'u' }] })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
