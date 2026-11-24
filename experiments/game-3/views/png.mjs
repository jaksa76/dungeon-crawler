// pngjs, installed with the repository's tools (cd tools && npm install).
import { createRequire } from 'node:module';
export const { PNG } = createRequire(new URL('../../../tools/package.json', import.meta.url))('pngjs');
