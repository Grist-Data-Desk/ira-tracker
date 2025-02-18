import { writable, derived } from 'svelte/store';
import type { Project, IndexedFeatureCollection } from './types';
import { CATEGORIES } from './utils/constants';

// Core data store
export const dataStore = writable<{
	isLoading: boolean;
	collection: IndexedFeatureCollection;
}>({
	isLoading: true,
	collection: {
		collection: {
			type: 'FeatureCollection',
			features: []
		},
		index: null
	}
});

// Search state
export const searchState = writable<{
	query: string;
	radius: number;
	isSearching: boolean;
	results: Project[];
}>({
	query: '',
	radius: 50,
	isSearching: false,
	results: []
});

// Visualization state
export type ColorMode = 'agency' | 'category' | 'fundingSource';

export const visualState = writable<{
	colorMode: ColorMode;
	filters: Set<string>;
}>({
	colorMode: 'fundingSource',
	filters: new Set()
});

// UI state
export const uiState = writable<{
	legendExpanded: boolean;
	creditsExpanded: boolean;
	resultsExpanded: boolean;
}>({
	legendExpanded: false,
	creditsExpanded: true,
	resultsExpanded: false
});

// Derived states
export const hasSearched = derived(
	searchState,
	$searchState => $searchState.results.length > 0
);

export const filteredResults = derived(
	[searchState, visualState, dataStore],
	([$searchState, $visualState, $dataStore]) => {
		const projects = $searchState.results.length > 0 
			? $searchState.results 
			: $dataStore.collection.collection.features.map(f => {
				const props = f.properties || {};
				const coords = f.geometry.coordinates;
				return {
					uid: props.UID || '',
					dataSource: props['Data Source'] || '',
					fundingSource: props['Funding Source'] || '',
					programId: props['Program ID'] || '',
					programName: props['Program Name'] || '',
					projectName: props['Project Name'] || '',
					projectDescription: props['Project Description'] || '',
					projectLocationType: props['Project Location Type'] || '',
					city: props.City || '',
					county: props.County || '',
					tribe: props.Tribe || '',
					state: props.State || '',
					congressionalDistrict: props['118th CD'] || '',
					fundingAmount: props['Funding Amount'] ? String(props['Funding Amount']) : '',
					outlayedAmountFromIIJASupplemental: props['Outlayed Amount From IIJA Supplemental'] ? String(props['Outlayed Amount From IIJA Supplemental']) : '',
					obligatedAmountFromIIJASupplemental: props['Obligated Amount From IIJA Supplemental'] ? String(props['Obligated Amount From IIJA Supplemental']) : '',
					percentIIJAOutlayed: props['Percent IIJA Outlayed'] ? String(props['Percent IIJA Outlayed']) : '',
					link: props.Link || '',
					agencyName: props['Agency Name'] || '',
					bureauName: props['Bureau Name'] || '',
					category: props.Category || '',
					subcategory: props.Subcategory || '',
					programType: props['Program Type'] || '',
					latitude: coords[1],
					longitude: coords[0]
				};
			});

		if ($visualState.filters.size === 0) return projects;

		let mainCategories: string[];
		let fieldGetter: (project: Project) => string;
		
		switch ($visualState.colorMode) {
			case 'agency':
				mainCategories = CATEGORIES.agency;
				fieldGetter = p => p.agencyName;
				break;
			case 'category':
				mainCategories = CATEGORIES.category;
				fieldGetter = p => p.category;
				break;
			case 'fundingSource':
				mainCategories = CATEGORIES.fundingSource;
				fieldGetter = p => p.fundingSource;
				break;
		}

		const hasOther = $visualState.filters.has('Other');
		const mainCategoryFilters = Array.from($visualState.filters).filter(f => mainCategories.includes(f));
		const otherFilters = Array.from($visualState.filters).filter(f => f !== 'Other' && !mainCategories.includes(f));

		return projects.filter(project => {
			const fieldValue = fieldGetter(project);
			
			const isOther = !mainCategories.includes(fieldValue);
			
			const matchesMainCategory = mainCategoryFilters.length > 0 ? mainCategoryFilters.includes(fieldValue) : false;
			const matchesOtherFilter = otherFilters.length > 0 ? otherFilters.includes(fieldValue) : false;
			
			return matchesMainCategory || matchesOtherFilter || (hasOther && isOther);
		});
	}
);

export const currentCount = derived(
	filteredResults,
	$filteredResults => $filteredResults.length
);

// Convenience exports for backward compatibility
export const searchQuery = derived(
	searchState,
	$state => $state.query
);

export const searchRadius = derived(
	searchState,
	$state => $state.radius
);

export const isSearching = derived(
	searchState,
	$state => $state.isSearching
);

export const isDataLoading = derived(
	dataStore,
	$state => $state.isLoading
);

export const allPoints = derived(
	dataStore,
	$state => $state.collection
);

export const selectedColorMode = derived(
	visualState,
	$state => $state.colorMode
);

export const activeFilters = derived(
	visualState,
	$state => ({
		[$state.colorMode]: $state.filters
	})
);
