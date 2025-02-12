<script lang="ts">
	import { onMount } from 'svelte';
	import { orderBy } from 'lodash-es';
	import type { Project } from '$lib/types';
	import {
		searchResults,
		isSearching,
		hasSearched,
		activeFilters,
		selectedColorMode,
		allPoints,
		isDataLoading,
		currentTableCount
	} from '$lib/stores';
	import { CATEGORIES } from '$lib/utils/constants';

	const ROW_HEIGHT = 33;
	const ROWS = 7;

	let root: HTMLDivElement;
	let scrollContainer: HTMLDivElement;
	let array: Project[] = [];
	let iterator: IterableIterator<Project>;
	let n: number;
	let sort = { col: '', desc: true };
	let isHovering = false;

	const cols = [
		{ key: 'projectName', label: 'Project Name', width: '25%' },
		{ key: 'agencyName', label: 'Agency', width: '15%' },
		{ key: 'fundingSource', label: 'Funding Source', width: '10%' },
		{
			key: 'fundingAmount',
			label: 'Amount',
			width: '10%',
			format: (value: unknown) => {
				if (!value) return '';
				const amount =
					typeof value === 'string'
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
		{ key: 'category', label: 'Program Category', width: '10%' },
		{ key: 'subcategory', label: 'Program Subcategory', width: '10%' },
		{ key: 'projectLocationType', label: 'Grantee Type', width: '8%' },
		{ key: 'congressionalDistrict', label: 'Congressional District', width: '7%' },
		{
			key: 'link',
			label: 'Link',
			width: '5%',
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
		scrollContainer?.scrollTo(scrollContainer.scrollLeft, 0);
	}

	function appendRows(start: number, end: number) {
		const newRows = [];
		for (; start < end; start++) {
			const { done, value } = iterator.next();
			if (done) break;
			newRows.push(value);
		}
		array = [...array, ...newRows];
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
		const threshold = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight;
		if (threshold < ROW_HEIGHT * 2 && n < filteredResults.length) {
			const nextN = minlengthof(n + ROWS);
			if (nextN > n) {
				appendRows(n, nextN);
				n = nextN;
			}
		}
	}

	function handleWheel(event: WheelEvent) {
		if (!isHovering) return;
		
		const container = scrollContainer;
		const { deltaY, deltaX } = event;
		const isScrollingUp = deltaY < 0;
		const isScrollingDown = deltaY > 0;
		
		const isAtTop = container.scrollTop === 0;
		const isAtBottom = container.scrollHeight - container.scrollTop === container.clientHeight;
		
		// Only prevent default if scrolling would go beyond bounds
		if (
			(isScrollingUp && !isAtTop) || 
			(isScrollingDown && !isAtBottom) ||
			deltaX !== 0
		) {
			event.preventDefault();
			event.stopPropagation();
			
			// Manual scroll
			container.scrollTop += deltaY;
			container.scrollLeft += deltaX;
		}
	}

	$: filteredResults = (
		$hasSearched
			? $searchResults
			: $allPoints.collection?.features.map((feature) => {
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
				}) || []
	).filter((project) => {
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

		// Add wheel event listener with passive: false to allow preventDefault
		window.addEventListener('wheel', handleWheel, { passive: false });

		return () => {
			window.removeEventListener('downloadcsv', handleDownload);
			window.removeEventListener('wheel', handleWheel);
		};
	});

	function downloadCurrentView() {
		const headers = cols.map((col) => col.label).join(',');

		const rows = filteredResults
			.map((row) => {
				return cols
					.map((col) => {
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
					})
					.join(',');
			})
			.join('\n');

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

<div class="h-[600px] bg-slate-50/90 font-['Basis_Grotesque']">
	{#if $isDataLoading}
		<div class="absolute inset-0 flex items-center justify-center">
			<div class="flex items-center gap-3">
				<div
					class="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent"
				></div>
				<p class="text-sm text-slate-500">Loading project data...</p>
			</div>
		</div>
	{:else if $isSearching}
		<div class="absolute inset-0 flex items-center justify-center">
			<div class="flex items-center gap-3">
				<div
					class="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent"
				></div>
				<p class="text-sm text-slate-500">Searching for projects...</p>
			</div>
		</div>
	{:else}
		<div 
			class="h-full overflow-hidden"
			bind:this={root}
		>
			<div 
				class="h-full overflow-auto overscroll-contain"
				bind:this={scrollContainer}
				on:scroll={onScroll}
				on:mouseenter={() => (isHovering = true)}
				on:mouseleave={() => (isHovering = false)}
			>
				<table class="min-w-full table-auto border-collapse">
					<thead class="sticky top-0 z-10">
						<tr>
							{#each cols as { key, label, width }}
								<th
									class="group relative border-b border-slate-200 bg-slate-100/95 p-2 text-left font-['PolySans'] text-xs font-medium shadow-sm backdrop-blur-sm transition-colors first:rounded-tl-lg last:rounded-tr-lg hover:cursor-pointer hover:bg-slate-200/95"
									class:sort-desc={sort.col === key && sort.desc}
									class:sort-asc={sort.col === key && !sort.desc}
									style="width: {width}"
									on:click={resort(key)}
								>
									<span class="flex items-center gap-1 text-slate-700">
										{label}
										<svg
											class="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100"
											xmlns="http://www.w3.org/2000/svg"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M8 9l4-4 4 4m0 6l-4 4-4-4"
											/>
										</svg>
									</span>
								</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each array as row, i}
							<tr
								class="transition-colors hover:bg-emerald-50 {i % 2 === 0
									? 'bg-white'
									: 'bg-slate-50'}"
							>
								{#each cols as { key, format, width }}
									<td 
										class="whitespace-normal border-b border-slate-200 p-2 text-xs text-slate-600"
										style="width: {width}"
									>
										{#if key === 'link' && row[key]}
											{@html format
												? format(row[key as keyof Project])
												: (row[key as keyof Project] ?? '')}
										{:else}
											{format ? format(row[key as keyof Project]) : (row[key as keyof Project] ?? '')}
										{/if}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
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
