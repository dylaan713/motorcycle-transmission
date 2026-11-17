import { defineConfig } from 'vite';

// The 3D chunk: three itself, the 3D view and the part geometry. load.ts is the app's static door
// into it and stays in the entry chunk, so the initial bundle never pulls in three.
const IN_3D_CHUNK = /node_modules[\\/]three[\\/]|src[\\/]geo[\\/]|src[\\/]view3d[\\/](?!load\.ts)/;

export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 800, // kB minified; npm run size enforces the real budgets, gzipped
    rolldownOptions: {
      output: {
        // only the matched modules: a shared one (tokens) must stay with the entry, or the entry would
        // import the 3D chunk statically to reach it
        codeSplitting: {
          groups: [{ name: 'view3d', test: (id) => IN_3D_CHUNK.test(id), includeDependenciesRecursively: false }],
        },
      },
    },
  },
});
