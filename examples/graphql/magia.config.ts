import { defineConfig, tanstackQuery } from "magia-api";

export default defineConfig({
  output: "src/magia.gen.ts",
  apis: {
    github: {
      type: "graphql",
      schema: "https://docs.github.com/public/fpt/schema.docs.graphql",
      documents: "./src/graphql/**/*.graphql",
      plugins: [tanstackQuery()],
    },
  },
});
