import { writable } from 'svelte/store';
import type { Project, IndexedFeatureCollection } from './types';

export type ColorMode = 'agency' | 'category' | 'fundingSource';

export const projects = writable<Project[]>([]);
export const searchResults = writable<Project[]>([]);
export const searchQuery = writable<string>('');
export const searchRadius = writable<number>(50);
export const selectedColorMode = writable<ColorMode>('fundingSource');
export const isSearching = writable<boolean>(false);
export const isDataLoading = writable<boolean>(true);
export const allPoints = writable<IndexedFeatureCollection>({
	collection: {
		type: 'FeatureCollection',
		features: []
	},
	index: null
});
export const hasSearched = writable(false);
export const activeFilters = writable<{ [key: string]: Set<string> }>({
	agency: new Set(),
	category: new Set(),
	fundingSource: new Set()
});
export const currentTableCount = writable(0);
export const legendOpen = writable(false);
