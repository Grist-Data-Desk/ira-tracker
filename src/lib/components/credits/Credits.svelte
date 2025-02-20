<script lang="ts">
	import { uiState } from '$lib/stores';

	function toggleCredits() {
		uiState.update(state => ({ ...state, creditsExpanded: !state.creditsExpanded }));
	}
</script>

<div class="relative">
	{#if $uiState.creditsExpanded}
		<div class="text-[11px] leading-tight text-slate-500">
			<p class="mb-0.5">
				<strong>Note</strong> Project locations are approximate. Some projects are mapped to agency headquarters
				or county/city centroids, which may result in overlapping points on the map. Others may be jittered in source data.
			</p>
			<p class="mb-0.5">
				<strong>Sources</strong> Biden White House / USAspending / EPA / DOI / DOE / BIA / NOAA / USBR / Grist analysis
			</p>
			<p class="mb-0">
				<strong>Development</strong> Clayton Aldern / Parker Ziegler / Grist. See our <a href="https://github.com/Grist-Data-Desk/ira-tracker" target="_blank">methods</a>.
			</p>
		</div>
	{/if}
</div>
<div class="absolute -bottom-12 left-0">
	<div class="maplibregl-ctrl maplibregl-ctrl-group">
		<button
			type="button"
			class="flex h-[29px] w-[29px] items-center justify-center bg-white transition-colors hover:bg-slate-50"
			on:click={toggleCredits}
			aria-label={$uiState.creditsExpanded ? 'Collapse credits' : 'Expand credits'}
		>
			<svg
				class="h-4 w-4 text-slate-600 transition-transform duration-200"
				style="transform: rotate({$uiState.creditsExpanded ? '180deg' : '0deg'})"
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
			</svg>
		</button>
	</div>
</div>

<style>
	button:hover svg {
		@apply text-slate-600;
	}
</style> 
