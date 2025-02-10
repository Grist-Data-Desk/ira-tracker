<script lang="ts">
  import { projects, searchResults, searchQuery, searchRadius, isSearching, isDataLoading, hasSearched, filterResultsByLegend, activeFilters, selectedColorMode } from '$lib/stores';
  import { CATEGORIES } from '$lib/utils/constants';
  import { onMount, tick } from 'svelte';
  import { debounce } from 'lodash-es';

  export let onSearch: () => void;
  let isSpinning = false;
  let hasCharged = false;
  let previousAmount = 0;
  let searchOpen = false;
  let innerWidth: number;
  let searchInput: HTMLInputElement;
  let suggestions: Array<{
    place_name: string;
    text: string;
    coordinates: [number, number];
  }> = [];
  let isFetchingSuggestions = false;
  let showSuggestions = false;

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
    return num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  // Filter results based on legend selection if toggle is on
  $: filteredResults = $filterResultsByLegend 
    ? $searchResults.filter(project => {
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
        
        // Check if the value is in the main categories
        const isInMainCategories = currentFilters.has(fieldValue);
        
        // If "Other" is selected, also include items not in the main category list
        const mainCategories = currentMode === 'agency' 
          ? CATEGORIES.agency 
          : currentMode === 'category' 
            ? CATEGORIES.category 
            : CATEGORIES.fundingSource;
            
        const isOther = !mainCategories.includes(fieldValue);
        
        return isInMainCategories || (currentFilters.has('Other') && isOther);
      })
    : $searchResults;

  $: totalAwardAmount = filteredResults.reduce((sum, project) => {
    if (!project.fundingAmount) return sum;
    const amount = typeof project.fundingAmount === 'string' 
      ? parseFloat(project.fundingAmount.replace(/[$,]/g, ''))
      : typeof project.fundingAmount === 'number' 
        ? project.fundingAmount 
        : 0;
    return sum + (isNaN(amount) ? 0 : amount);
  }, 0);

  $: formattedTotalAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(totalAwardAmount);

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

  function onSuggestionClick(suggestion: typeof suggestions[0]) {
    $searchQuery = suggestion.place_name;
    showSuggestions = false;
    handleSearch();
  }

  function onInputFocus() {
    if (suggestions.length > 0) {
      showSuggestions = true;
    }
  }

  function onInputBlur() {
    // Delay hiding suggestions to allow for click events
    setTimeout(() => {
      showSuggestions = false;
    }, 200);
  }
</script>

<style>
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

  .charging, .charged {
    position: relative;
    display: inline-block;
  }

  .charging::after, .charged::after {
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
    @apply inline-block relative overflow-hidden;
    width: 0.6em;
    height: 1em;
    vertical-align: baseline;
  }

  .digit-column.animating {
    transition: transform 2s cubic-bezier(0.16, 1, 0.3, 1), opacity 2s cubic-bezier(0.16, 1, 0.3, 1);
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
    @apply absolute left-0 mt-1 bg-white rounded-md shadow-lg border border-slate-200 max-h-[300px] overflow-y-auto z-50;
    width: 200%;
  }

  .suggestion {
    @apply px-4 py-2.5 hover:bg-slate-50 cursor-pointer text-sm;
  }

  .suggestion:not(:last-child) {
    @apply border-b border-slate-100;
  }

  .suggestion-main {
    @apply font-medium text-slate-800 truncate;
  }

  .suggestion-secondary {
    @apply text-xs text-slate-500 mt-0.5 line-clamp-1;
  }

  .loader {
    @apply w-4 h-4 border-2 border-slate-200 border-t-emerald-500 rounded-full animate-spin;
  }
</style>

<div 
  class="col-span-1 space-y-3 bg-slate-50/90 p-4 rounded-lg border border-slate-200 relative overflow-visible"
>
  <div class="space-y-1 relative z-10">
    <h1 class="text-3xl font-['PolySans'] font-medium text-left text-slate-800 relative">
      Meet Your Local Infrastructure Projects.
    </h1>
    <p class="text-sm font-['Basis_Grotesque'] text-slate-600 text-left max-w-lg mx-auto">
      Find federal investments from the <span class="text-gold">Inflation Reduction Act</span> and the <span class="text-cobalt">Bipartisan Infrastructure Law</span> in your area using the control panel below. You can search by ZIP code, city name, coordinates, or names of known locations.
    </p>
  </div>
  <div class="flex items-stretch gap-4 relative">
    <div class="flex-1">
      <label class="block mb-0.5 text-sm font-['Basis_Grotesque'] text-slate-700 font-medium" for="search">Location</label>
      <div class="relative">
        <input 
          type="text" 
          id="search"
          bind:this={searchInput}
          bind:value={$searchQuery}
          on:input={onInput}
          on:focus={onInputFocus}
          on:blur={onInputBlur}
          class="search-input bg-white/50 border-slate-300 border p-1.5 w-full min-w-[100px] font-['Basis_Grotesque'] rounded focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
          placeholder="ZIP code or city"
          disabled={$isDataLoading}
        />
        {#if isFetchingSuggestions}
          <div class="absolute right-2 top-1/2 -translate-y-1/2">
            <div class="loader"></div>
          </div>
        {/if}
        {#if showSuggestions && suggestions.length > 0}
          <div class="suggestions">
            {#each suggestions as suggestion}
              <div 
                class="suggestion"
                role="button"
                tabindex="0"
                on:mousedown={() => onSuggestionClick(suggestion)}
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

    <div class="flex-1">
      <label class="block mb-0.5 text-sm font-['Basis_Grotesque'] text-slate-700 font-medium" for="radius">Radius (mi)</label>
      <input 
        type="number" 
        id="radius"
        bind:value={$searchRadius}
        class="search-input bg-white/50 border-slate-300 border p-1.5 w-full min-w-[100px] font-['Basis_Grotesque'] rounded focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
        min="1"
        max="500"
        disabled={$isDataLoading}
      />
    </div>

    <div class="flex flex-col justify-end">
      <button 
        on:click={handleSearch}
        class="bg-emerald-500 text-white px-4 py-[0.375rem] rounded-md hover:bg-emerald-600 transition-all font-['Basis_Grotesque'] disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg active:scale-[0.98] flex items-center gap-2 w-[110px] justify-center whitespace-nowrap"
        disabled={$isDataLoading || $isSearching}
      >
        <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
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

  <div class="flex items-center justify-between">
    <label class="flex items-center gap-3 cursor-pointer group">
      <div class="relative">
        <input
          type="checkbox"
          bind:checked={$filterResultsByLegend}
          class="sr-only peer"
        />
        <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 group-hover:bg-slate-300 peer-checked:group-hover:bg-emerald-600"></div>
      </div>
      <span class="text-sm font-['Basis_Grotesque'] text-slate-600 group-hover:text-slate-800 transition-colors">Filter results by color legend selection</span>
    </label>
  </div>

  <div class="overflow-hidden">
    {#if $searchResults.length > 0 || true}
      <div class="transition-all duration-300 ease-in-out" 
           style="transform: translateY({$searchResults.length > 0 ? '0' : '-100%'}); 
                  opacity: {$searchResults.length > 0 ? '1' : '0'}; 
                  margin-top: {$searchResults.length > 0 ? '0.25rem' : '-5rem'};">
        <div class="text-sm font-['Basis_Grotesque'] text-left bg-white/50 p-2.5 rounded-lg border border-slate-200">
          <p class="text-slate-600">
            Total funding across <span class="font-bold text-emerald-600">{filteredResults.length} project{filteredResults.length === 1 ? '' : 's'}</span> in search radius
            {#if $filterResultsByLegend && $activeFilters[$selectedColorMode].size > 0}
              (filtered by {$selectedColorMode === 'fundingSource' ? 'funding source' : $selectedColorMode} to include {
                (() => {
                  const items = Array.from($activeFilters[$selectedColorMode]);
                  if (items.length === 1) return items[0];
                  if (items.length === 2) return `${items[0]} and ${items[1]}`;
                  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
                })()
              })
            {/if}:
          </p>
          <p class="text-2xl font-['PolySans'] font-medium text-center text-emerald-600 mt-1 mb-1">
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
                      <span class="digit-column" class:animating={isSpinning} style="transform: translateY(calc(-1em * {parseInt(digit)}))">
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

  <div class="absolute inset-0 pointer-events-none">
    <div class="absolute -top-7 -right-4 w-40 h-40 text-gold/30">
      <svg class:sun-spin={isSpinning} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="currentColor">
        <circle cx="50" cy="50" r="15"/>
        <g>
          {#each Array(12) as _, i}
            <rect x="49" y="14" width="2" height="16" transform="rotate({i * 30} 50 50)"/>
          {/each}
        </g>
      </svg>
    </div>
  </div>
</div>
