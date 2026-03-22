import type { Manifest } from './types'

/**
 * Hand-crafted manifest for the spike. In production, this will be
 * auto-generated from the OpenAPI/GraphQL spec by the codegen engine.
 */
export const petstoreManifest: Manifest = {
  petstore: {
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
}
