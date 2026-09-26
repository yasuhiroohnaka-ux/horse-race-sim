import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { fileURLToPath } from "node:url";

const workerDataFile = fileURLToPath(new URL("./lib/dataFile.worker.mjs", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/lib\/dataFile\.mjs$/, replacement: workerDataFile },
      { find: /^\.\/dataFile\.mjs$/, replacement: workerDataFile },
    ],
  },
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
