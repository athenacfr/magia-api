import { defineConfig, tanstackQuery } from "magia-api";

export default defineConfig({
  output: "src/magia.gen.ts",
  apis: {
    pokeapi: {
      type: "rest",
      schema: "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/openapi.yml",
      plugins: [tanstackQuery()],
    },
    rickandmorty: {
      type: "graphql",
      schema: "./schema.graphql",
      documents: "./src/graphql/**/*.graphql",
      plugins: [tanstackQuery()],
    },
  },
});
