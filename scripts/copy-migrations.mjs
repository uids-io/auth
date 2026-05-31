import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const srcDir = join(root, '..', 'src', 'db', 'migrations');
const destDir = join(root, '..', 'dist', 'db', 'migrations');

mkdirSync(destDir, { recursive: true });
for (const file of readdirSync(srcDir)) {
  if (file.endsWith('.sql')) {
    cpSync(join(srcDir, file), join(destDir, file));
  }
}
