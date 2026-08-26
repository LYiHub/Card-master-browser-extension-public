import { writeCardMediaAccentCatalog } from './card-media-accents.mjs';

console.log(
  (await writeCardMediaAccentCatalog())
    ? 'Generated card media accent catalog.'
    : 'Card media accent catalog is current.',
);
