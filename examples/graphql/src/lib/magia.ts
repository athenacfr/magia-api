import { createMagia } from "magia-api";
import { manifest } from "../magia.gen";

function getToken() {
  return localStorage.getItem("github_token") ?? "";
}

export const magia = createMagia({
  manifest,
  apis: {
    github: {
      baseUrl: "https://api.github.com/graphql",
      fetchOptions: {
        headers: () => ({
          Authorization: `Bearer ${getToken()}`,
        }),
      },
    },
  },
});
