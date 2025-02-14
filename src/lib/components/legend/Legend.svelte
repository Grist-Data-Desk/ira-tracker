<script lang="ts">
	import { visualState, uiState } from '$lib/stores';
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

	const modes = [
		{ value: 'agency', label: 'Agency' },
		{ value: 'category', label: 'Category' },
		{ value: 'fundingSource', label: 'Funding' }
	];

	function handleModeChange(event: Event) {
		const target = event.target as HTMLInputElement;
		visualState.update(state => ({ 
			...state, 
			colorMode: target.value as typeof state.colorMode,
			filters: new Set()
		}));
	}

	function toggleFilter(label: string) {
		const newFilters = new Set($visualState.filters);
		
		if (newFilters.has(label)) {
			newFilters.delete(label);
		} else {
			if (newFilters.size === 0) {
				newFilters.add(label);
			} else {
				if (label === 'Other') {
					newFilters.add('Other');
				} else if (CATEGORIES[$visualState.colorMode].includes(label)) {
					newFilters.delete('Other');
					newFilters.add(label);
				} else {
					newFilters.add(label);
				}
			}
		}
		
		const updatedFilters = new Set(newFilters);
		visualState.update(state => ({
			...state,
			filters: updatedFilters
		}));
	}

	$: isItemActive = (label: string) => $visualState.filters.has(label);

	const longestLabel = Math.max(
		...Object.values(legendItems).flatMap((items) => items.map((item) => item.label.length))
	);

	const minPanelWidth = longestLabel * 6 + 20;
</script>

<div
	class={[
		'floating-panel absolute z-[15] bg-white px-2 pb-2 pt-0.5 shadow-lg md:bottom-auto md:left-auto md:right-[calc(3%+48px)] md:top-4 md:block',
		$uiState.legendExpanded ? 'bottom-[calc(40px+0.5rem)] left-[calc(3%+2.5rem)]' : 'hidden'
	]}
	style="min-width: {minPanelWidth}px"
>
	<div class="mb-0 flex items-center gap-1">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 20 20"
			fill="currentColor"
			class="h-3 w-3 text-gray-500"
		>
			<path
				fill-rule="evenodd"
				d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 01.628.74v2.288a2.25 2.25 0 01-.659 1.59l-4.682 4.683a2.25 2.25 0 00-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 018 18.25v-5.757a2.25 2.25 0 00-.659-1.591L2.659 6.22A2.25 2.25 0 012 4.629V2.34a.75.75 0 01.628-.74z"
				clip-rule="evenodd"
			/>
		</svg>
		<p class="font-['Basis_Grotesque'] text-xs leading-tight text-gray-500">
			Click categories below to filter the map
		</p>
	</div>
	<div class="mode-selector relative mb-2 grid grid-cols-3">
		<div
			class="mode-selector__background"
			class:agency={$visualState.colorMode === 'agency'}
			class:category={$visualState.colorMode === 'category'}
			class:funding={$visualState.colorMode === 'fundingSource'}
		></div>
		{#each modes as mode}
			<div class="mode-selector__radio-container relative">
				<input
					type="radio"
					bind:group={$visualState.colorMode}
					id="{mode.value}-radio"
					value={mode.value}
					class="mode-selector__radio-input absolute opacity-0"
					on:change={handleModeChange}
				/>
				<label
					for="{mode.value}-radio"
					class="mode-selector__radio-label relative z-10 block cursor-pointer py-1.5 text-center font-['PolySans'] text-xs"
					class:active={$visualState.colorMode === mode.value}
				>
					{mode.label}
				</label>
			</div>
		{/each}
	</div>
	<div class="space-y-0.5">
		{#each legendItems[$visualState.colorMode] as item}
			<button
				class="flex w-full items-center gap-2 rounded border border-gray-200 bg-slate-50/90 px-1.5 py-0.5 transition-colors hover:bg-gray-100"
				class:opacity-40={$visualState.filters.size > 0 && !isItemActive(item.label)}
				on:click={() => toggleFilter(item.label)}
			>
				<div class="h-2 w-2 rounded-full" style="background-color: {item.color}"></div>
				<span class="text-left font-['Basis_Grotesque'] text-xs">{item.label}</span>
			</button>
		{/each}
	</div>
</div>

<style lang="postcss">
	.mode-selector {
		background-color: white;
	}

	.mode-selector__background {
		position: absolute;
		top: 0;
		left: 0;
		width: 33.333333%;
		height: 100%;
		background-color: theme(colors.earth);
		transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		z-index: 1;
	}

	.mode-selector__background.agency {
		transform: translateX(0);
	}

	.mode-selector__background.category {
		transform: translateX(100%);
	}

	.mode-selector__background.funding {
		transform: translateX(200%);
	}

	.mode-selector__radio-label {
		transition-property: color, background-color;
		transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
		transition-duration: 150ms;
	}

	.mode-selector__radio-label:hover {
		color: theme(colors.earth);
		background-color: theme(colors.gray.100);
	}

	.mode-selector__radio-label.active {
		color: white;
		background-color: transparent;
	}

	.mode-selector__radio-container {
		position: relative;
		background-color: white;
		border: 1px solid theme(colors.gray.200);
	}

	.mode-selector__radio-container:not(:last-child) {
		border-right: none;
	}
</style>
