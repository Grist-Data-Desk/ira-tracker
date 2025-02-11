<script lang="ts">
  import { onMount } from 'svelte';
  import { slide } from 'svelte/transition';
  import { orderBy } from 'lodash-es';
  import type { Project } from '$lib/types';
  import { searchResults, isSearching, hasSearched, activeFilters, selectedColorMode, allPoints, isDataLoading, currentTableCount } from '$lib/stores';
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

  $: filteredResults = ($hasSearched ? $searchResults : $allPoints.collection?.features.map(feature => {
    const props = feature.properties || {};
    const coords = feature.geometry.coordinates as [number, number];
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
      link: props.Link || '',
      agencyName: props['Agency Name'] || '',
      bureauName: props['Bureau Name'] || '',
      category: props.Category || '',
      subcategory: props.Subcategory || '',
      programType: props['Program Type'] || '',
      latitude: coords[1],
      longitude: coords[0]
    };
  }) || []).filter(project => {
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
    const mainCategories = currentMode === 'agency' 
      ? CATEGORIES.agency 
      : currentMode === 'category' 
        ? CATEGORIES.category 
        : CATEGORIES.fundingSource;
        
    const isOther = !mainCategories.includes(fieldValue);
    
    return isInMainCategories || (currentFilters.has('Other') && isOther);
  });

  $: {
    if (filteredResults) {
      materialize(filteredResults);
      if (!$isDataLoading && ($hasSearched || $activeFilters[$selectedColorMode].size > 0)) {
        if ($hasSearched) {
          currentTableCount.set($searchResults.length);
        } else {
          currentTableCount.set(filteredResults.length);
        }
      }
    }
  }

  onMount(() => {
    if (filteredResults) {
      appendRows(0, n);
    }

    const handleDownload = () => downloadCurrentView();
    window.addEventListener('downloadcsv', handleDownload);

    return () => {
      window.removeEventListener('downloadcsv', handleDownload);
    };
  });

  function downloadCurrentView() {
    const headers = cols.map(col => col.label).join(',');
    
    const rows = filteredResults.map(row => {
      return cols.map(col => {
        let value = row[col.key as keyof Project];
        if (col.key === 'link') {
          return value || '';
        }
        if (col.format && value && col.key !== 'link') {
          value = col.format(value).replace(/<[^>]*>/g, ''); // Strip HTML tags
        }
        if (typeof value === 'string') {
          value = value.includes(',') ? `"${value.replace(/"/g, '""')}"` : value;
        }
        return value || '';
      }).join(',');
    }).join('\n');
    
    const csv = `${headers}\n${rows}`;
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'ira-bil-projects.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
</script>

<div class="h-full bg-slate-50/90 font-['Basis_Grotesque']">
  {#if $isDataLoading}
    <div class="absolute inset-0 flex items-center justify-center">
      <div class="flex items-center gap-3">
        <div class="animate-spin rounded-full h-6 w-6 border-2 border-emerald-500 border-t-transparent"></div>
        <p class="text-sm text-slate-500">Loading project data...</p>
      </div>
    </div>
  {:else if $isSearching}
    <div class="absolute inset-0 flex items-center justify-center">
      <div class="flex items-center gap-3">
        <div class="animate-spin rounded-full h-6 w-6 border-2 border-emerald-500 border-t-transparent"></div>
        <p class="text-sm text-slate-500">Searching for projects...</p>
      </div>
    </div>
  {:else}
    <div class="overflow-x-auto overflow-y-auto h-full"
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
