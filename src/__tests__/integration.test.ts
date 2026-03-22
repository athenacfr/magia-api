import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMagia } from '../proxy'
import { tanstackQuery } from '../plugins/tanstack-query'
import type { Manifest, MagiaConfig } from '../types'

const manifest: Manifest = {
  petstore: {
    plugins: [tanstackQuery()],
    operations: {
      getPetById: {
        method: 'GET',
        path: '/pet/{petId}',
        params: { petId: 'path' },
      },
      listPets: {
        method: 'GET',
        path: '/pet/findByStatus',
        params: { status: 'query' },
      },
      createPet: {
        method: 'POST',
        path: '/pet',
        params: { body: 'body' },
      },
    },
  },
}

const config: MagiaConfig = {
  apis: {
    petstore: {
      baseUrl: 'https://petstore.example.com',
      fetchOptions: {
        headers: { 'X-Api-Key': 'test-key' },
      },
    },
  },
}

function mockFetch(data: unknown = {}, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve(data),
  })
}

describe('Integration: full DX flow', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('fetch dispatches with correct URL, method, headers', async () => {
    const fetch = mockFetch({ id: 1, name: 'Rex', status: 'available' })
    globalThis.fetch = fetch

    const magia = createMagia(config, manifest) as any

    const result = await magia.petstore.getPetById.fetch({ petId: 1 })

    expect(result).toEqual({ id: 1, name: 'Rex', status: 'available' })

    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://petstore.example.com/pet/1')
    expect(init.method).toBe('GET')
    expect(init.headers['X-Api-Key']).toBe('test-key')
  })

  it('queryOptions returns correct shape with queryFn that dispatches', async () => {
    const fetch = mockFetch({ id: 1, name: 'Rex' })
    globalThis.fetch = fetch

    const magia = createMagia(config, manifest) as any

    const opts = magia.petstore.getPetById.queryOptions({ petId: 1 })

    expect(opts).toHaveProperty('queryKey')
    expect(opts).toHaveProperty('queryFn')
    expect(opts.queryKey).toEqual(['magia', 'petstore', 'getPetById', { petId: 1 }])

    const result = await opts.queryFn({ signal: new AbortController().signal })
    expect(result).toEqual({ id: 1, name: 'Rex' })

    const [url] = fetch.mock.calls[0]
    expect(url).toBe('https://petstore.example.com/pet/1')
  })

  it('queryKey returns hierarchical key', () => {
    const magia = createMagia(config, manifest) as any

    expect(magia.petstore.getPetById.queryKey({ petId: 1 })).toEqual([
      'magia', 'petstore', 'getPetById', { petId: 1 },
    ])

    // Without input — for partial matching / invalidation
    expect(magia.petstore.getPetById.queryKey()).toEqual([
      'magia', 'petstore', 'getPetById',
    ])
  })

  it('mutationOptions wraps fetch in mutationFn', async () => {
    const fetch = mockFetch({ id: 2, name: 'Buddy' })
    globalThis.fetch = fetch

    const magia = createMagia(config, manifest) as any

    const opts = magia.petstore.createPet.mutationOptions()

    expect(opts).toHaveProperty('mutationFn')
    expect(opts).toHaveProperty('mutationKey')
    expect(opts.mutationKey).toEqual(['magia', 'petstore', 'createPet'])

    const result = await opts.mutationFn({ name: 'Buddy', status: 'available' })
    expect(result).toEqual({ id: 2, name: 'Buddy' })

    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://petstore.example.com/pet')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ name: 'Buddy', status: 'available' })
  })

  it('mutationKey returns correct tuple', () => {
    const magia = createMagia(config, manifest) as any

    expect(magia.petstore.createPet.mutationKey()).toEqual([
      'magia', 'petstore', 'createPet',
    ])
  })

  it('pathKey on API namespace returns correct tuple', () => {
    const magia = createMagia(config, manifest) as any
    expect(magia.petstore.pathKey()).toEqual(['magia', 'petstore'])
  })

  it('multiple operations coexist on the same API', async () => {
    const fetch = mockFetch([{ id: 1, name: 'Rex' }])
    globalThis.fetch = fetch

    const magia = createMagia(config, manifest) as any

    const result = await magia.petstore.listPets.fetch({ status: 'available' })
    expect(result).toEqual([{ id: 1, name: 'Rex' }])

    const opts = magia.petstore.listPets.queryOptions({ status: 'available' })
    expect(opts.queryKey).toEqual(['magia', 'petstore', 'listPets', { status: 'available' }])
  })

  it('onError callback fires on HTTP error', async () => {
    const fetch = mockFetch({}, 500)
    globalThis.fetch = fetch
    const onError = vi.fn()

    const magia = createMagia({ ...config, onError }, manifest) as any

    await expect(
      magia.petstore.getPetById.fetch({ petId: 1 }),
    ).rejects.toThrow('failed with 500')

    expect(onError).toHaveBeenCalledOnce()
  })
})
