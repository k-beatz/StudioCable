import type { LibraryDevice } from './core/library';

/**
 * All library device files, bundled at build time. The data lives outside
 * src/ in library/devices/<manufacturer>/<model>.json.
 */
const files = import.meta.glob<LibraryDevice>('../library/devices/**/*.json', { eager: true, import: 'default' });

export const LIBRARY: LibraryDevice[] = Object.values(files).sort((a, b) =>
  `${a.manufacturer} ${a.model}`.localeCompare(`${b.manufacturer} ${b.model}`, undefined, { numeric: true }),
);
