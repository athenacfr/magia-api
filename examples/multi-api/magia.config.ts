import { defineConfig, tanstackQuery } from "magia-api";

export default defineConfig({
  output: "src/magia.gen.ts",
  apis: {
    petstore: {
      type: "rest",
      schema: "https://petstore3.swagger.io/api/v3/openapi.json",
      plugins: [tanstackQuery()],
    },
    github: {
      type: "graphql",
      schema: "https://docs.github.com/public/fpt/schema.docs.graphql",
      documents: "./src/graphql/**/*.graphql",
      plugins: [tanstackQuery()],
    },
  },
});
