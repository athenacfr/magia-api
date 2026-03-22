import type { Manifest } from './types'
import { tanstackQuery } from './plugins/tanstack-query'

/**
 * Hand-crafted manifest for the spike. In production, this will be
 * auto-generated from the OpenAPI/GraphQL spec by the codegen engine.
 * The `plugins` array is set at compile time by defineConfig().
 */
export const petstoreManifest: Manifest = {
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
      updatePet: {
        method: 'PUT',
        path: '/pet',
        params: { body: 'body' },
      },
      deletePet: {
        method: 'DELETE',
        path: '/pet/{petId}',
        params: { petId: 'path' },
      },
      findPetsByStatus: {
        method: 'GET',
        path: '/pet/findByStatus',
        params: { status: 'query' },
      },
    },
  },
}
