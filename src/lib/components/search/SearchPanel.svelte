<script lang="ts">
	import {
		searchResults,
		searchQuery,
		searchRadius,
		isSearching,
		isDataLoading,
		activeFilters,
		selectedColorMode
	} from '$lib/stores';
	import { CATEGORIES } from '$lib/utils/constants';
	import { debounce } from 'lodash-es';

	export let onSearch: () => void;
	let isSpinning = false;
	let hasCharged = false;
	let previousAmount = 0;
	let searchInput: HTMLInputElement;
	let suggestions: Array<{
		place_name: string;
		text: string;
		coordinates: [number, number];
	}> = [];
	let isFetchingSuggestions = false;
	let showSuggestions = false;
	let suggestionsContainer: HTMLDivElement;

	const handleSearch = () => {
		previousAmount = totalAwardAmount;
		isSpinning = true;
		hasCharged = false;
		setTimeout(() => {
			isSpinning = false;
			hasCharged = true;
		}, 2000);
		onSearch();
	};

	function formatNumberForTicker(num: number): string {
		return num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	}

	$: filteredResults = $searchResults.filter((project) => {
		const currentMode = $selectedColorMode;
		const currentFilters = $activeFilters[currentMode];

		if (currentFilters.size === 0) return true;

		let fieldValue = '';
		switch (currentMode) {
			case 'agency':
				fieldValue = project.agencyName;
				break;
			case 'category':
				fieldValue = project.category;
				break;
			case 'fundingSource':
				fieldValue = project.fundingSource;
				break;
		}

		const isInMainCategories = currentFilters.has(fieldValue);

		const mainCategories =
			currentMode === 'agency'
				? CATEGORIES.agency
				: currentMode === 'category'
					? CATEGORIES.category
					: CATEGORIES.fundingSource;

		const isOther = !mainCategories.includes(fieldValue);

		return isInMainCategories || (currentFilters.has('Other') && isOther);
	});

	$: totalAwardAmount = filteredResults.reduce((sum, project) => {
		if (!project.fundingAmount) return sum;
		const amount =
			typeof project.fundingAmount === 'string'
				? parseFloat(project.fundingAmount.replace(/[$,]/g, ''))
				: typeof project.fundingAmount === 'number'
					? project.fundingAmount
					: 0;
		return sum + (isNaN(amount) ? 0 : amount);
	}, 0);

	function validateLatLon(input: string): boolean {
		const latLonRe = /^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/;

		if (!latLonRe.test(input)) {
			return false;
		}

		const [lat, lon] = input.split(',').map((coord) => parseFloat(coord.trim()));

		if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
			return false;
		}

		return true;
	}

	const fetchSuggestions = debounce(async (query: string) => {
		if (!query || query.length < 2 || validateLatLon(query)) {
			suggestions = [];
			showSuggestions = false;
			return;
		}

		isFetchingSuggestions = true;
		try {
			const response = await fetch(
				`https://nominatim.openstreetmap.org/search?format=geojson&q=${encodeURIComponent(query)}&addressdetails=1&limit=5&countrycodes=us`
			);
			const data = await response.json();

			if (data.features) {
				suggestions = data.features.map((feature: any) => ({
					place_name: feature.properties.display_name,
					text: feature.properties.display_name.split(',')[0],
					coordinates: feature.geometry.coordinates
				}));
				showSuggestions = true;
			}
		} catch (error) {
			console.error('Error fetching suggestions:', error);
			suggestions = [];
		} finally {
			isFetchingSuggestions = false;
		}
	}, 300);

	function onInput(event: Event) {
		const input = event.target as HTMLInputElement;
		$searchQuery = input.value;
		fetchSuggestions(input.value);
	}

	function onKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			showSuggestions = false;
			handleSearch();
		}
	}

	function onSuggestionKeyDown(event: KeyboardEvent, suggestion: (typeof suggestions)[0]) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			onSuggestionClick(suggestion);
		}
	}

	function onSuggestionClick(suggestion: (typeof suggestions)[0]) {
		$searchQuery = suggestion.place_name;
		showSuggestions = false;
		handleSearch();
	}

	function onInputFocus() {
		if (suggestions.length > 0) {
			showSuggestions = true;
		}
	}

	function onInputBlur(event: FocusEvent) {
		const relatedTarget = event.relatedTarget as HTMLElement;
		if (suggestionsContainer?.contains(relatedTarget)) {
			return;
		}

		setTimeout(() => {
			showSuggestions = false;
		}, 200);
	}
</script>

<div class="relative col-span-1 space-y-4 overflow-visible rounded-lg border border-slate-200">
	<div class="absolute -right-[22px] -top-12 h-40 w-40 text-gold/30">
		<svg
			class:sun-spin={isSpinning}
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 100 100"
			fill="currentColor"
		>
			<circle cx="50" cy="50" r="15" />
			<g>
				{#each Array(12) as _, i}
					<rect x="49" y="14" width="2" height="16" transform="rotate({i * 30} 50 50)" />
				{/each}
			</g>
		</svg>
	</div>

	<div class="relative z-10">
		<h1 class="font-['PolySans'] text-3xl font-medium text-slate-800">
			Meet Your Local Infrastructure Projects.
		</h1>
		<p class="m-0 font-['Basis_Grotesque'] text-sm text-slate-600">
			Find federal investments from the <span class="text-gold">Inflation Reduction Act</span> and
			the <span class="text-cobalt">Bipartisan Infrastructure Law</span> in your area using the control
			panel below. You can search by ZIP code, city name, coordinates, or names of known locations.
		</p>
	</div>
	<div class="relative flex items-stretch gap-2">
		<div class="flex-[5]">
			<label
				class="mb-0.5 block font-['Basis_Grotesque'] text-sm font-medium text-slate-700"
				for="search">Location</label
			>
			<div class="relative">
				<input
					type="text"
					id="search"
					bind:this={searchInput}
					bind:value={$searchQuery}
					on:input={onInput}
					on:keydown={onKeyDown}
					on:focus={onInputFocus}
					on:blur={onInputBlur}
					class="search-input w-full rounded border border-slate-300 bg-white/50 p-1.5 font-['Basis_Grotesque'] transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
					placeholder="ZIP code or city"
					disabled={$isDataLoading}
				/>
				{#if isFetchingSuggestions}
					<div class="absolute right-2 top-1/2 -translate-y-1/2">
						<div class="loader"></div>
					</div>
				{/if}
				{#if showSuggestions && suggestions.length > 0}
					<div class="suggestions" bind:this={suggestionsContainer}>
						{#each suggestions as suggestion}
							<div
								class="suggestion"
								role="button"
								tabindex="0"
								on:mousedown={() => onSuggestionClick(suggestion)}
								on:keydown={(e) => onSuggestionKeyDown(e, suggestion)}
							>
								<div class="suggestion-main">{suggestion.text}</div>
								<div class="suggestion-secondary">
									{suggestion.place_name.split(',').slice(1).join(',')}
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<div class="w-20">
			<label
				class="mb-0.5 block font-['Basis_Grotesque'] text-sm font-medium text-slate-700"
				for="radius">Radius (mi)</label
			>
			<input
				type="number"
				id="radius"
				bind:value={$searchRadius}
				class="search-input w-full rounded border border-slate-300 bg-white/50 p-1.5 font-['Basis_Grotesque'] transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
				min="1"
				max="500"
				disabled={$isDataLoading}
			/>
		</div>

		<div class="flex flex-col justify-end">
			<button
				on:click={handleSearch}
				class="flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-emerald-600 bg-emerald-500 px-2 py-[0.375rem] font-['Basis_Grotesque'] text-white shadow-md transition-all hover:bg-emerald-600 hover:shadow-lg active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
				disabled={$isDataLoading || $isSearching}
			>
				<svg
					class="h-4 w-4"
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
					/>
				</svg>
				{#if $isDataLoading}
					Loading...
				{:else if $isSearching}
					Searching...
				{:else}
					Search
				{/if}
			</button>
		</div>
	</div>

	<div class="overflow-hidden">
		{#if $searchResults.length > 0 || true}
			<div
				class="transition-all duration-300 ease-in-out"
				style="transform: translateY({$searchResults.length > 0 ? '0' : '-100%'}); 
                  opacity: {$searchResults.length > 0 ? '1' : '0'}; 
                  margin-top: {$searchResults.length > 0 ? '0.25rem' : '-10rem'};"
			>
				<div class="font-['Basis_Grotesque']">
					<p class="m-0 text-xs text-slate-600 md:text-sm">
						Total funding across <span class="font-bold text-emerald-600"
							>{filteredResults.length} project{filteredResults.length === 1 ? '' : 's'}</span
						>
						in search radius
						{#if $activeFilters[$selectedColorMode].size > 0}
							(filtered by {$selectedColorMode === 'fundingSource'
								? 'funding source'
								: $selectedColorMode} to include {(() => {
								const items = Array.from($activeFilters[$selectedColorMode]);
								if (items.length === 1) return items[0];
								if (items.length === 2) return `${items[0]} and ${items[1]}`;
								return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
							})()})
						{/if}:
					</p>
					<p class="mb-1 mt-1 text-center font-['PolySans'] text-2xl font-medium text-emerald-600">
						<span class:charging={isSpinning} class:charged={hasCharged}>
							<span class="number-container">
								<span class="currency-symbol">$</span>
								{#each formatNumberForTicker(totalAwardAmount) as digit, i}
									{#if digit === ','}
										<span class="separator">,</span>
									{:else if digit === '.'}
										<span class="separator">.</span>
									{:else}
										<span class="digit-wrapper">
											<span
												class="digit-column"
												class:animating={isSpinning}
												style="transform: translateY(calc(-1em * {parseInt(digit)}))"
											>
												{#each Array(10) as _, num}
													<span class="digit-static">{num}</span>
												{/each}
											</span>
										</span>
									{/if}
								{/each}
							</span>
						</span>
					</p>
				</div>
			</div>
		{/if}
	</div>
</div>

<style lang="postcss">
	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(720deg);
		}
	}

	@keyframes charge {
		0% {
			width: 0%;
		}
		100% {
			width: 100%;
		}
	}

	.sun-spin {
		animation: spin 2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
	}

	.charging,
	.charged {
		position: relative;
		display: inline-block;
	}

	.charging::after,
	.charged::after {
		content: '';
		position: absolute;
		bottom: -4px;
		left: 0;
		height: 3px;
		@apply bg-cobalt/40;
		border-radius: 2px;
		width: 100%;
	}

	.charging::after {
		width: 0%;
		animation: charge 2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
	}

	.number-container {
		@apply inline-flex items-baseline font-['PolySans'];
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}

	.digit-wrapper {
		@apply relative inline-block overflow-hidden;
		width: 0.6em;
		height: 1em;
		vertical-align: baseline;
	}

	.digit-column.animating {
		transition:
			transform 2s cubic-bezier(0.16, 1, 0.3, 1),
			opacity 2s cubic-bezier(0.16, 1, 0.3, 1);
		opacity: 0.99;
	}

	.digit-column {
		position: absolute;
		left: 0;
		top: 0;
		display: flex;
		flex-direction: column;
		transform-origin: 50% 50%;
		line-height: 1;
		opacity: 1;
	}

	.digit-static {
		@apply inline-block text-center;
		height: 1em;
		width: 0.6em;
		line-height: 1;
	}

	.separator {
		@apply inline-block text-center;
		width: 0.25em;
		height: 1em;
		line-height: 1;
		vertical-align: baseline;
		position: relative;
		top: -0.12em;
	}

	.currency-symbol {
		@apply inline-block text-center;
		margin-right: 0.05em;
		height: 1em;
		line-height: 1;
		vertical-align: baseline;
		position: relative;
		top: -0.12em;
	}

	.suggestions {
		@apply absolute left-0 z-50 mt-1 max-h-[300px] overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg;
		width: 200%;
	}

	.suggestion {
		@apply cursor-pointer px-4 py-2.5 text-sm hover:bg-slate-50;
	}

	.suggestion:not(:last-child) {
		@apply border-b border-slate-100;
	}

	.suggestion-main {
		@apply truncate font-medium text-slate-800;
	}

	.suggestion-secondary {
		@apply mt-0.5 line-clamp-1 text-xs text-slate-500;
	}

	.loader {
		@apply h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-emerald-500;
	}
</style>
