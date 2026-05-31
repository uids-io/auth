import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/express/index.ts'],
  format: ['esm'],
  dts: false,
  sourcemap: true,
  clean: true,
  target: 'node20',
  outDir: 'dist',
  splitting: false,
});
