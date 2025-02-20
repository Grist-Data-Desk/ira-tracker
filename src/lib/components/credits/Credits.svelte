<script lang="ts">
	import { uiState, dataStore } from '$lib/stores';
	import type { Project } from '$lib/types';
	import { BUILD_DATE } from '$lib/buildInfo';

	function toggleCredits() {
		uiState.update(state => ({ ...state, creditsExpanded: !state.creditsExpanded }));
	}

	function downloadData() {
		const cols = [
			{ key: 'projectName' as keyof Project, label: 'Project Name' },
			{ key: 'agencyName' as keyof Project, label: 'Agency' },
			{ key: 'bureauName' as keyof Project, label: 'Bureau' },
			{ key: 'dataSource' as keyof Project, label: 'Data Source' },
			{ key: 'fundingSource' as keyof Project, label: 'Funding Source' },
			{ key: 'fundingAmount' as keyof Project, label: 'Announced Funding' },
			{ key: 'outlayedAmountFromIIJASupplemental' as keyof Project, label: 'Funding Received' },
			{ key: 'percentIIJAOutlayed' as keyof Project, label: 'Percent Received' },
			{ key: 'category' as keyof Project, label: 'Program Category' },
			{ key: 'subcategory' as keyof Project, label: 'Program Subcategory' },
			{ key: 'projectLocationType' as keyof Project, label: 'Grantee Type' },
			{ key: 'state' as keyof Project, label: 'State' },
			{ key: 'congressionalDistrict' as keyof Project, label: 'Congressional District' },
			{ key: 'link' as keyof Project, label: 'Link' }
		];

		const headers = cols.map((col) => col.label).join(',');
		const rows = $dataStore.collection.collection.features
			.map((feature) => {
				const props = feature.properties || {};
				const coords = feature.geometry.coordinates;
				const row: Project = {
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
				return cols
					.map((col) => {
						let value = row[col.key];
						if (col.key === 'link') {
							return value || '';
						}
						if (typeof value === 'string') {
							value = value.replace(/[\r\n]+/g, ' ').trim();
							value = value.includes(',') ? `"${value.replace(/"/g, '""')}"` : value;
						}
						return value || '';
					})
					.join(',');
			})
			.filter(row => row.trim() !== '')
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
				<strong>Development</strong> Clayton Aldern / Parker Ziegler / Grist. See our <a href="https://github.com/Grist-Data-Desk/ira-tracker" target="_blank" class="text-emerald-600 hover:text-emerald-700 no-underline hover:underline">methods</a> and download our <button type="button" class="inline p-0 m-0 border-0 bg-transparent font-inherit text-[11px] leading-tight text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer" on:click={() => downloadData()}>data</button>. Last refreshed: {BUILD_DATE}.
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
