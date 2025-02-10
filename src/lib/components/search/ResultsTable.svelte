<script lang="ts">
  import { onMount } from 'svelte';
  import { slide } from 'svelte/transition';
  import { orderBy } from 'lodash-es';
  import type { Project } from '$lib/types';
  import { searchResults, isSearching, hasSearched, filterResultsByLegend, activeFilters, selectedColorMode } from '$lib/stores';
  import { COLORS, CATEGORIES } from '$lib/utils/constants';

  const ROW_HEIGHT = 33;
  const ROWS = 7;

  let root: HTMLDivElement;
  let array: Project[] = [];
  let iterator: IterableIterator<Project>;
  let n: number;
  let sort = { col: '', desc: true };
  
  const cols = [
    { key: 'projectName', label: 'Project Name' },
    { key: 'agencyName', label: 'Agency' },
    { key: 'fundingSource', label: 'Funding Source' },
    { 
      key: 'fundingAmount', 
      label: 'Amount',
      format: (value: unknown) => {
        if (!value) return '';
        const amount = typeof value === 'string' 
          ? parseFloat(value.replace(/[^0-9.-]/g, ''))
          : typeof value === 'number' 
            ? value 
            : 0;
        if (isNaN(amount)) return '';
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }).format(amount);
      }
    },
    { key: 'category', label: 'Program Category' },
    { key: 'subcategory', label: 'Program Subcategory' },
    { key: 'projectLocationType', label: 'Grantee Type' },
    { key: 'congressionalDistrict', label: 'Congressional District' },
    { 
      key: 'link', 
      label: 'Link',
      format: (value: unknown) => {
        if (!value) return '';
        return `<a href="${value}" target="_blank" class="text-emerald-600 hover:text-emerald-700 hover:underline">View details</a>`;
      }
    }
  ];

  function minlengthof(length: number) {
    length = Math.floor(length);
    return Math.min(filteredResults.length, length);
  }

  function materialize(data: Project[]) {
    array = [];
    iterator = data[Symbol.iterator]();
    n = minlengthof(ROWS * 2);
    appendRows(0, n);
    root?.scrollTo(root.scrollLeft, 0);
  }

  function appendRows(start: number, end: number) {
    for (; start < end; start++) {
      const { done, value } = iterator.next();
      if (done) break;
      array = [...array, value];
    }
  }

  function resort(col: string) {
    return function handleResort() {
      sort = {
        col,
        desc: sort.col === col ? !sort.desc : true
      };
      const d = orderBy(filteredResults, col, [sort.desc ? 'desc' : 'asc']);
      materialize(d);
    };
  }

  function onScroll() {
    if (root.scrollHeight - root.scrollTop < ROWS * ROW_HEIGHT * 1.5 && n < minlengthof(n + 1)) {
      appendRows(n, (n = minlengthof(n + ROWS)));
    }
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

  $: if (filteredResults) {
    materialize(filteredResults);
  }

  onMount(() => {
    if (filteredResults) {
      appendRows(0, n);
    }
  });
</script>

<div class="overflow-hidden relative {$searchResults.length > 0 ? 'h-[calc(100vh-400px)] sm:h-[calc(100vh-350px)]' : ''} bg-slate-50/90 rounded-lg border border-slate-200 font-['Basis_Grotesque']" 
     transition:slide>
  {#if $isSearching}
    <div class="flex items-center justify-center h-32">
      <div class="flex items-center gap-3">
        <div class="animate-spin rounded-full h-6 w-6 border-2 border-emerald-500 border-t-transparent"></div>
        <p class="text-sm text-slate-500">Searching for projects...</p>
      </div>
    </div>
  {:else if $searchResults.length > 0}
    <div class="overflow-x-auto overflow-y-auto absolute inset-0"
         bind:this={root} 
         on:scroll={onScroll}>
      <table class="min-w-full table-auto border-collapse">
        <thead class="sticky top-0 z-10">
          <tr>
            {#each cols as { key, label }}
              <th class="bg-slate-100/95 backdrop-blur-sm border-slate-200 shadow-sm border-b p-2 text-left text-xs font-['PolySans'] font-medium hover:cursor-pointer hover:bg-slate-200/95 transition-colors relative group first:rounded-tl-lg last:rounded-tr-lg"
                  class:sort-desc={sort.col === key && sort.desc}
                  class:sort-asc={sort.col === key && !sort.desc}
                  on:click={resort(key)}>
                <span class="text-slate-700 flex items-center gap-1">
                  {label}
                  <svg class="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                  </svg>
                </span>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each array as row, i}
            <tr class="hover:bg-emerald-50 transition-colors {i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}">
              {#each cols as { key, format }}
                <td class="border-slate-200 border-b p-2 text-xs whitespace-normal text-slate-600">
                  {#if key === 'link' && row[key]}
                    {@html format ? format(row[key as keyof Project]) : row[key as keyof Project] ?? ''}
                  {:else}
                    {format ? format(row[key as keyof Project]) : row[key as keyof Project] ?? ''}
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <div class="flex flex-col items-center justify-center h-32 gap-3">
      <div class="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
        <svg class="w-6 h-6 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <div class="text-center">
        {#if !$hasSearched}
          <p class="text-sm text-slate-400">Try searching for projects using the control panel above</p>
        {:else}
          <p class="text-sm text-slate-500">No projects found</p>
          <p class="text-xs text-slate-400">Try another location or increasing your search radius</p>
        {/if}
      </div>
    </div>
  {/if}
</div>

<div class="border-slate-200 border-t border-opacity-25 pt-2 mt-4 text-[11px] font-['Basis_Grotesque'] text-slate-500">
  <p><strong>Note</strong> Project locations are approximate. Some projects are mapped to agency headquarters or county/city centroids, which may result in overlapping points on the map.</p>
  <p><strong>Sources</strong> Biden White House / EPA / DOI / BIA / Jack Conness / Grist analysis</p>
  <p><strong>Development</strong> Clayton Aldern / Grist</p>
</div>

<style lang="postcss">
  .sort-desc::after,
  .sort-asc::after {
    @apply absolute right-2 text-emerald-500;
  }

  .sort-desc::after {
    content: '▾';
  }

  .sort-asc::after {
    content: '▴';
  }
</style>
