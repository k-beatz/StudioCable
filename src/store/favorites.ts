import { create } from 'zustand';
import type { DeviceTemplate } from '../core/model';

/**
 * Favourite parts, remembered on this device (not in the project file):
 * library devices, quick devices, setups and own devices (stored as a
 * template copy, so a custom device can be reused in any project).
 */

export type Favorite =
  | { key: string; kind: 'library'; id: string }
  | { key: string; kind: 'preset'; id: string }
  | { key: string; kind: 'setup'; id: string }
  | { key: string; kind: 'template'; name: string; template: DeviceTemplate };

const STORAGE_KEY = 'studiocable.favorites';

export const favoriteKey = (kind: Favorite['kind'], id: string) => `${kind}:${id}`;

interface FavoritesState {
  favorites: Favorite[];
  isFavorite: (key: string) => boolean;
  /** Adds the favourite, or removes it if it is already there. */
  toggle: (fav: Favorite) => void;
  remove: (key: string) => void;
}

function load(): Favorite[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((f) => f && typeof f.key === 'string' && typeof f.kind === 'string') : [];
  } catch {
    return [];
  }
}

function save(favorites: Favorite[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  } catch {
    // Not critical.
  }
}

export const useFavorites = create<FavoritesState>((set, get) => ({
  favorites: load(),
  isFavorite: (key) => get().favorites.some((f) => f.key === key),
  toggle: (fav) => {
    const { favorites } = get();
    const next = favorites.some((f) => f.key === fav.key) ? favorites.filter((f) => f.key !== fav.key) : [...favorites, fav];
    set({ favorites: next });
    save(next);
  },
  remove: (key) => {
    const next = get().favorites.filter((f) => f.key !== key);
    set({ favorites: next });
    save(next);
  },
}));
