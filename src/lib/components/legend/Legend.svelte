<script lang="ts">
  import { selectedColorMode, activeFilters } from '$lib/stores';
  import type { ColorMode } from '$lib/stores';
  import { COLORS, CATEGORIES } from '$lib/utils/constants';

  const colorOrder = [
    COLORS.ORANGE,
    COLORS.COBALT,
    COLORS.TURQUOISE,
    COLORS.TEAL,
    COLORS.FUCHSIA,
    COLORS.RED,
    COLORS.GOLD
  ];

  const legendItems = {
    agency: [
      ...CATEGORIES.agency.map((name, i) => ({
        color: colorOrder[i],
        label: name
      })),
      { color: COLORS.EARTH, label: 'Other' }
    ],
    category: [
      ...CATEGORIES.category.map((name, i) => ({
        color: colorOrder[i],
        label: name
      })),
      { color: COLORS.EARTH, label: 'Other' }
    ],
    fundingSource: [
      ...CATEGORIES.fundingSource.map((name, i) => ({
        color: colorOrder[i],
        label: name
      })),
      { color: COLORS.EARTH, label: 'Other' }
    ]
  };

  const modes: { value: ColorMode; label: string }[] = [
    { value: 'agency', label: 'Agency' },
    { value: 'category', label: 'Category' },
    { value: 'fundingSource', label: 'Funding' }
  ];

  function handleModeChange(mode: ColorMode) {
    selectedColorMode.set(mode);
    // Clear all filters when changing modes
    activeFilters.update(filters => {
      Object.keys(filters).forEach(key => {
        filters[key].clear();
      });
      return filters;
    });
  }

  function toggleFilter(label: string) {
    activeFilters.update(filters => {
      const currentMode = $selectedColorMode;
      const currentFilters = filters[currentMode];
      
      if (currentFilters.has(label)) {
        currentFilters.delete(label);
      } else {
        // If this is the first selection, clear other filters first
        if (currentFilters.size === 0) {
          currentFilters.add(label);
        } else {
          currentFilters.add(label);
        }
      }
      
      return filters;
    });
  }

  $: isItemActive = (label: string) => $activeFilters[$selectedColorMode].has(label);
</script>

<div class="floating-panel pt-0.5 px-2 pb-2 w-[280px] bg-white shadow-lg z-[15] relative">
  <div class="mb-0 flex items-center gap-1">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3 h-3 text-gray-500">
      <path fill-rule="evenodd" d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 01.628.74v2.288a2.25 2.25 0 01-.659 1.59l-4.682 4.683a2.25 2.25 0 00-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 018 18.25v-5.757a2.25 2.25 0 00-.659-1.591L2.659 6.22A2.25 2.25 0 012 4.629V2.34a.75.75 0 01.628-.74z" clip-rule="evenodd" />
    </svg>
    <p class="text-xs font-['Basis_Grotesque'] text-gray-500 leading-tight">Click categories below to filter the map</p>
  </div>
  <div class="grid grid-cols-3 gap-1 mb-0.5">
    {#each modes as mode}
      <button
        class="text-xs font-['Basis_Grotesque'] px-2 py-0.5 rounded transition-colors ring-1 ring-gray-200 {$selectedColorMode === mode.value ? 'bg-earth text-white ring-0' : 'bg-slate-50/90 hover:bg-earth hover:bg-opacity-10'}"
        on:click={() => handleModeChange(mode.value)}
      >
        {mode.label}
      </button>
    {/each}
  </div>
  <div class="space-y-0.5">
    {#each legendItems[$selectedColorMode] as item}
      <button
        class="flex items-center gap-2 w-full bg-slate-50/90 hover:bg-earth hover:bg-opacity-10 rounded px-1.5 py-0.5 transition-colors ring-1 ring-gray-200"
        class:opacity-40={$activeFilters[$selectedColorMode].size > 0 && !isItemActive(item.label)}
        on:click={() => toggleFilter(item.label)}
      >
        <div class="h-2 w-2 rounded-full" style="background-color: {item.color}"></div>
        <span class="text-xs font-['Basis_Grotesque'] text-left">{item.label}</span>
      </button>
    {/each}
  </div>
</div> 
