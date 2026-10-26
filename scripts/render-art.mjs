import { readdir, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const sourceDirectory = resolve('art');
const outputDirectory = resolve('public/images');
await mkdir(outputDirectory, { recursive: true });

const sources = (await readdir(sourceDirectory)).filter((file) => file.endsWith('.svg'));

await Promise.all(
  sources.map(async (source) => {
    const name = source.replace(/\.svg$/, '');
    const input = resolve(sourceDirectory, source);
    await Promise.all([
      sharp(input, { density: 144 })
        .resize(1200, 1200)
        .webp({ quality: 84, effort: 5 })
        .toFile(resolve(outputDirectory, `${name}-1200.webp`)),
      sharp(input, { density: 144 })
        .resize(720, 720)
        .webp({ quality: 82, effort: 5 })
        .toFile(resolve(outputDirectory, `${name}-720.webp`)),
    ]);
  }),
);

console.log(`Rendered ${sources.length} scene stills at 720px and 1200px.`);
