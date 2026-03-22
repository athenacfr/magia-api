import { createMagia } from 'magia-api'
import { manifest } from './magia.gen'

export const magia = createMagia({
  apis: {
    petstore: {
      baseUrl: 'https://petstore3.swagger.io/api/v3',
    },
  },
}, manifest)
