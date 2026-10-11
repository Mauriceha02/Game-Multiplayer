import { rm } from 'node:fs/promises';
await rm(new URL('../public/app/', import.meta.url), { recursive: true, force: true });
