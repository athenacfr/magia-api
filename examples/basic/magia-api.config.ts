import { defineConfig, tanstackQuery } from 'magia-api'

export default defineConfig({
  apis: {
    petstore: {
      type: 'rest',
      schema: 'https://petstore3.swagger.io/api/v3/openapi.json',
      plugins: [tanstackQuery()],
    },
  },
})
