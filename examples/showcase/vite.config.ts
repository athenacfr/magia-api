import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { magiaApi } from "magia-api/vite";

export default defineConfig({
  plugins: [magiaApi(), tailwindcss(), react()],
});
