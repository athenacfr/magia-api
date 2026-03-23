import { createMagia } from "magia-api";
import { manifest } from "../magia.gen";

export const magia = createMagia({
  manifest,
  apis: {
    petstore: {
      baseUrl: import.meta.env.VITE_PETSTORE_URL,
    },
    github: {
      baseUrl: "https://api.github.com/graphql",
      fetchOptions: {
        headers: () => ({
          Authorization: `Bearer ${import.meta.env.VITE_GITHUB_TOKEN}`,
        }),
      },
    },
  },
});
