<script lang="ts">
	import { visualState, uiState } from '$lib/stores';
	import type { Mode } from '$lib/types';
	import { COLORS, CATEGORIES, COLOR_ORDER } from '$lib/utils/constants';

	const legendItems = {
		agency: [
			...CATEGORIES.agency.map((name, i) => ({
				color: COLOR_ORDER[i],
				label: name
			})),
			{ color: COLORS.EARTH, label: 'Other' }
		],
		category: [
			...CATEGORIES.category.map((name, i) => ({
				color: COLOR_ORDER[i],
				label: name
			})),
			{ color: COLORS.EARTH, label: 'Other' }
		],
		fundingSource: [
			...CATEGORIES.fundingSource.map((name, i) => ({
				color: COLOR_ORDER[i],
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

	function handleModeChange(event: Event & { currentTarget: HTMLInputElement }) {
		visualState.set({
			mode: event.currentTarget.value as Mode,
			filters: new Set()
		});
	}

	function toggleFilter(label: string) {
		const updatedFilters = new Set($visualState.filters);

		if (updatedFilters.has(label)) {
			updatedFilters.delete(label);
		} else if (label === 'Other') {
			updatedFilters.add(label);
		} else if (CATEGORIES[$visualState.mode].includes(label)) {
			updatedFilters.delete('Other');
			updatedFilters.add(label);
		}

		visualState.update((state) => {
			state.filters = updatedFilters;

			return state;
		});
	}
</script>

<div
	class={[
		'floating-panel absolute z-[15] px-2 pb-2 pt-0.5 md:bottom-auto md:left-auto md:right-[calc(3%+48px)] md:top-4 md:block',
		$uiState.legendExpanded ? 'bottom-[calc(40px+0.5rem)] left-[calc(3%+5rem)]' : 'hidden'
	]}
>
	<div class="flex items-center gap-1 text-gray-500">
		<svg height="20" width="20" viewBox="0 0 20 20" fill="currentColor" class="h-3 w-3">
			<path
				fill-rule="evenodd"
				d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 01.628.74v2.288a2.25 2.25 0 01-.659 1.59l-4.682 4.683a2.25 2.25 0 00-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 018 18.25v-5.757a2.25 2.25 0 00-.659-1.591L2.659 6.22A2.25 2.25 0 012 4.629V2.34a.75.75 0 01.628-.74z"
				clip-rule="evenodd"
			/>
		</svg>
		<p class="font-basis text-xs leading-tight">Click categories below to filter the map</p>
	</div>
	<div
		class="relative mb-2 grid grid-cols-3 gap-x-px border border-solid border-gray-200 bg-gray-200"
	>
		<div
			class={[
				'absolute left-0 top-0 z-10 h-full w-1/3 bg-earth transition-transform duration-300',
				{
					'translate-x-0': $visualState.mode === 'agency',
					'translate-x-full': $visualState.mode === 'category',
					'translate-x-[200%]': $visualState.mode === 'fundingSource'
				}
			]}
		></div>
		{#each modes as mode}
			<div class="relative bg-white">
				<input
					type="radio"
					bind:group={$visualState.mode}
					id="{mode.value}-radio"
					value={mode.value}
					class="absolute opacity-0"
					onchange={handleModeChange}
				/>
				<label
					for="{mode.value}-radio"
					class={[
						'relative z-10 block cursor-pointer py-1.5 text-center font-poly text-xs transition-colors',
						$visualState.mode === mode.value ? 'text-white' : 'hover:bg-gray-100'
					]}
				>
					{mode.label}
				</label>
			</div>
		{/each}
	</div>
	<div class="space-y-0.5">
		{#each legendItems[$visualState.mode] as item}
			<button
				class={[
					'flex w-full items-center gap-2 rounded border border-gray-200 bg-slate-50/90 px-1.5 py-0.5 transition-colors hover:bg-gray-100',
					{ 'opacity-40': $visualState.filters.size > 0 && !$visualState.filters.has(item.label) }
				]}
				onclick={() => toggleFilter(item.label)}
			>
				<span class="h-2 w-2 rounded-full" style="background-color: {item.color}"></span>
				<span class="font-basis text-xs">{item.label}</span>
			</button>
		{/each}
	</div>
</div>
