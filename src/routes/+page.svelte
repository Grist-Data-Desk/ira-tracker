<script lang="ts">
	import { onMount } from 'svelte';
	import {
		searchResults,
		searchQuery,
		searchRadius,
		allPoints,
		selectedColorMode,
		isSearching,
		isDataLoading,
		hasSearched,
		activeFilters,
		currentTableCount
	} from '$lib/stores';
	import { TABLET_BREAKPOINT, CATEGORIES } from '$lib/utils/constants';
	import maplibregl from 'maplibre-gl';
	import * as pmtiles from 'pmtiles';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import * as turf from '@turf/turf';
	import type { Point, Feature } from 'geojson';
	import '../app.css';
	import { ProjectPopup } from '$lib/utils/popup';
	import SearchPanel from '$lib/components/search/SearchPanel.svelte';
	import ResultsTable from '$lib/components/search/ResultsTable.svelte';
	import Legend from '$lib/components/legend/Legend.svelte';
	import {
		SOURCE_CONFIG,
		LAYER_CONFIG,
		DO_SPACES_URL,
		PMTILES_PATH,
		GEOJSON_PATH,
		STYLES_PATH,
		getCurrentColorExpressions
	} from '$lib/utils/config';
	import { get } from 'svelte/store';
	import type { ProjectFeatureCollection, Project } from '$lib/types';
	import { writable } from 'svelte/store';
	import ExpandLegend from '$lib/components/legend/ExpandLegend.svelte';

	class ResetViewControl {
		onAdd(map: maplibregl.Map) {
			const btn = document.createElement('button');
			btn.className = 'maplibregl-ctrl-icon maplibregl-ctrl-geolocate';
			btn.innerHTML = '🔄';
			btn.addEventListener('click', () => {
				map.flyTo({
					center: [-98.5795, 39.8283],
					zoom: isTabletOrAbove ? 4 : 3
				});

				searchQuery.set('');
				searchResults.set([]);
				hasSearched.set(false);

				selectedColorMode.set('fundingSource');
				activeFilters.update((filters) => {
					Object.keys(filters).forEach((key) => {
						filters[key].clear();
					});
					return filters;
				});

				if (map?.getLayer('search-radius-outline')) {
					map.removeLayer('search-radius-outline');
				}
				if (map?.getLayer('search-radius-layer')) {
					map.removeLayer('search-radius-layer');
				}
				if (map?.getSource('search-radius')) {
					map.removeSource('search-radius');
				}

				if (map?.getLayer('projects-points')) {
					map.setFilter('projects-points', null);
				}

				if (currentPopup) {
					currentPopup.remove();
					currentPopup = null;
				}
			});
			const container = document.createElement('div');
			container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
			container.appendChild(btn);
			return container;
		}
		onRemove() {}
	}

	let map: maplibregl.Map;
	let innerWidth: number;
	let browser = false;
	let currentPopup: maplibregl.Popup | null = null;
	let pmtilesInstance: pmtiles.PMTiles;

	$: isTabletOrAbove = innerWidth > TABLET_BREAKPOINT;

	function cleanupSearchLayers() {
		if (!map) return;

		if (map.getLayer('search-radius-outline')) {
			map.removeLayer('search-radius-outline');
		}
		if (map.getLayer('search-radius-layer')) {
			map.removeLayer('search-radius-layer');
		}
		if (map.getSource('search-radius')) {
			map.removeSource('search-radius');
		}
	}

	async function loadGeoJSONData() {
		try {
			isDataLoading.set(true);
			const response = await fetch(`${DO_SPACES_URL}/${GEOJSON_PATH}/projects.geojson.br`);
			if (!response.ok) throw new Error('Failed to load GeoJSON data');

			const buffer = await response.arrayBuffer();
			const decompressed = await new Response(buffer, {
				headers: { 'Content-Encoding': 'br' }
			}).text();

			let data;
			try {
				data = JSON.parse(decompressed) as ProjectFeatureCollection;
				currentTableCount.set(data.features.length);
			} catch (e) {
				console.error('Failed to parse JSON:', e);
				throw new Error('Failed to parse decompressed data as JSON');
			}

			const points = data.features.map((f: Feature<Point>) => ({
				lon: f.geometry.coordinates[0],
				lat: f.geometry.coordinates[1],
				idx: data.features.indexOf(f)
			}));

			type PointType = (typeof points)[0];

			const { default: KDBush } = await import('kdbush');
			const index = new KDBush(
				points.length,
				64,
				Float64Array,
				(p: PointType) => p.lon,
				(p: PointType) => p.lat
			);

			points.forEach((point) => {
				index.add(point.lon, point.lat);
			});

			index.finish();

			allPoints.set({
				collection: data,
				index
			});
		} catch (error) {
			console.error('Error loading GeoJSON data:', error);
		} finally {
			isDataLoading.set(false);
		}
	}

	function updateMapFilters() {
		if (!map) return;

		const currentMode = $selectedColorMode;
		const currentFilters = $activeFilters[currentMode];

		const expressions = getCurrentColorExpressions();
		map.setPaintProperty('projects-points', 'circle-color', expressions[currentMode]);

		const filters: any[] = [];

		if ($hasSearched && map.getSource('search-radius')) {
			filters.push(['in', 'UID', ...Array.from($searchResults.map((p) => p.uid))]);
		}

		if (currentFilters.size > 0) {
			let filterField;
			let mainCategories: string[];
			switch (currentMode) {
				case 'agency':
					filterField = 'Agency Name';
					mainCategories = CATEGORIES.agency;
					break;
				case 'category':
					filterField = 'Category';
					mainCategories = CATEGORIES.category;
					break;
				case 'fundingSource':
					filterField = 'Funding Source';
					mainCategories = CATEGORIES.fundingSource;
					break;
			}

			if (currentFilters.has('Other')) {
				const selectedMainCategories = Array.from(currentFilters).filter((f) => f !== 'Other');

				if (selectedMainCategories.length > 0) {
					filters.push([
						'any',
						['!in', filterField, ...mainCategories],
						['in', filterField, ...selectedMainCategories]
					]);
				} else {
					filters.push(['!in', filterField, ...mainCategories]);
				}
			} else {
				filters.push(['in', filterField, ...Array.from(currentFilters)]);
			}
		}

		const finalFilter =
			filters.length > 0 ? (filters.length > 1 ? ['all', ...filters] : filters[0]) : undefined;

		map.setFilter('projects-points', finalFilter);
	}

	$: {
		if (browser && map) {
			updateMapFilters();
		}
	}

	const featureToProject = (feature: Feature<Point>): Project => {
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
	};

	async function searchProjects() {
		isSearching.set(true);
		hasSearched.set(true);

		try {
			let lat: number;
			let lon: number;

			const latLonRe = /^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/;
			if (latLonRe.test(get(searchQuery))) {
				[lat, lon] = get(searchQuery)
					.split(',')
					.map((coord: string) => parseFloat(coord.trim()));

				if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
					throw new Error('Invalid coordinates');
				}
			} else {
				const response = await fetch(
					`https://nominatim.openstreetmap.org/search?format=geojson&q=${encodeURIComponent(get(searchQuery))}&addressdetails=1&limit=1&countrycodes=us`
				);
				const data = await response.json();

				if (!data.features || data.features.length === 0) {
					throw new Error('Location not found');
				}

				const feature = data.features[0];
				[lon, lat] = feature.geometry.coordinates;
			}

			if (currentPopup) {
				currentPopup.remove();
				currentPopup = null;
			}

			cleanupSearchLayers();

			const searchCenter = turf.point([lon, lat]);
			const searchArea = turf.circle(searchCenter, $searchRadius, { steps: 64, units: 'miles' });

			map?.addSource('search-radius', {
				type: 'geojson',
				data: searchArea
			});

			map?.addLayer({
				id: 'search-radius-layer',
				type: 'fill',
				source: 'search-radius',
				paint: {
					'fill-color': '#3c3830',
					'fill-opacity': 0.1
				}
			});

			map?.addLayer({
				id: 'search-radius-outline',
				type: 'line',
				source: 'search-radius',
				paint: {
					'line-color': '#3c3830',
					'line-width': 2,
					'line-dasharray': [4, 2]
				}
			});

			const $points = get(allPoints);
			if ($points.index) {
				const searchRadiusInKm = $searchRadius * 1.60934;
				const latKm = 110.574;
				const lonKm = 111.32 * Math.cos((lat * Math.PI) / 180);

				const latDelta = searchRadiusInKm / latKm;
				const lonDelta = searchRadiusInKm / lonKm;

				const pointIndices = $points.index.range(
					lon - lonDelta,
					lat - latDelta,
					lon + lonDelta,
					lat + latDelta
				);

				const nearbyFeatures = pointIndices
					.map((i: number) => $points.collection.features[i])
					.filter((feature: Feature<Point>) => {
						const distance = turf.distance(
							turf.point(feature.geometry.coordinates),
							turf.point([lon, lat]),
							{ units: 'miles' }
						);
						return distance <= $searchRadius;
					});

				const projects: Project[] = nearbyFeatures.map(featureToProject);

				searchResults.set(projects);
				currentTableCount.set(projects.length);

				updateMapFilters();

				const bounds = new maplibregl.LngLatBounds();
				const coords = searchArea.geometry.coordinates[0] as Array<[number, number]>;
				coords.forEach((coord) => bounds.extend(coord));

				map?.fitBounds(bounds, {
					padding: {
						top: isTabletOrAbove ? 50 : 400,
						bottom: 50,
						left: isTabletOrAbove ? 450 : 50,
						right: 50
					},
					duration: 1000
				});
			}
		} catch (error) {
			console.error('Search error:', error);
			searchResults.set([]);
			currentTableCount.set($allPoints.collection?.features.length ?? 0);
		} finally {
			isSearching.set(false);
		}
	}

	const resultsExpanded = writable(false);

	$: filteredResults = (
		$hasSearched ? $searchResults : $allPoints.collection?.features.map(featureToProject) || []
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

	$: currentTableCount.set(filteredResults.length);

	onMount(async () => {
		browser = true;
		try {
			await loadGeoJSONData();

			const protocol = new pmtiles.Protocol();
			maplibregl.addProtocol('pmtiles', protocol.tile);

			const pmtilesUrl = `${DO_SPACES_URL}/${PMTILES_PATH}/projects.pmtiles`;
			pmtilesInstance = new pmtiles.PMTiles(pmtilesUrl);
			protocol.add(pmtilesInstance);

			await new Promise((resolve) => setTimeout(resolve, 0));

			map = new maplibregl.Map({
				container: 'map-container',
				style: `${DO_SPACES_URL}/${STYLES_PATH}/map-style.json`,
				// style: 'styles/map-style-local.json',
				center: [-98.5795, 39.8283],
				zoom: isTabletOrAbove ? 4 : 3,
				minZoom: 2,
				attributionControl: false
			});

			map.scrollZoom.disable();
			map.scrollZoom.setWheelZoomRate(0);
			map.addControl(new maplibregl.NavigationControl(), 'top-right');
			map.addControl(
				new maplibregl.GeolocateControl({
					positionOptions: {
						enableHighAccuracy: true
					},
					trackUserLocation: true
				}),
				'top-right'
			);
			map.addControl(new ResetViewControl(), 'top-right');

			map.on('load', () => {
				Object.values(SOURCE_CONFIG).forEach(({ id, config }) => {
					try {
						if (!map.getSource(id)) {
							const source: maplibregl.VectorSourceSpecification = {
								type: 'vector',
								url: `pmtiles://${DO_SPACES_URL}/${PMTILES_PATH}/${id}.pmtiles`
							};
							map.addSource(id, source);
						}
					} catch (error) {
						console.error(`Error adding source ${id}:`, error);
					}
				});

				try {
					if (!map.getLayer(LAYER_CONFIG.reservationsPolygons.id)) {
						map.addLayer(LAYER_CONFIG.reservationsPolygons);
					}
					if (!map.getLayer(LAYER_CONFIG.reservationLabels.id)) {
						map.addLayer(LAYER_CONFIG.reservationLabels);
					}
					if (!map.getLayer(LAYER_CONFIG.whProjectsPoints.id)) {
						map.addLayer(LAYER_CONFIG.whProjectsPoints);
					}
				} catch (error) {
					console.error('Error adding layers:', error);
				}

				map.on('click', LAYER_CONFIG.whProjectsPoints.id, (e) => {
					if (!e.features?.length) return;

					const featuresByLocation = e.features.reduce(
						(acc: { [key: string]: any[] }, feature: any) => {
							if (!feature.geometry || feature.geometry.type !== 'Point') return acc;
							const coords = (feature.geometry as { type: 'Point'; coordinates: [number, number] })
								.coordinates;
							const key = `${coords[0]},${coords[1]}`;
							if (!acc[key]) acc[key] = [];
							acc[key].push(feature);
							return acc;
						},
						{}
					);

					const coordinates = (
						e.features[0].geometry as { type: 'Point'; coordinates: [number, number] }
					).coordinates;
					const key = `${coordinates[0]},${coordinates[1]}`;
					const locationFeatures = featuresByLocation[key];

					const projects: Project[] = locationFeatures.map(featureToProject);

					if (currentPopup) {
						currentPopup.remove();
					}

					const projectPopup = new ProjectPopup(map, projects);
					currentPopup = projectPopup.showPopup(
						new maplibregl.LngLat(coordinates[0], coordinates[1]),
						projects
					);
				});

				map.setPaintProperty(LAYER_CONFIG.whProjectsPoints.id, 'circle-radius', [
					'interpolate',
					['linear'],
					['zoom'],
					2,
					3,
					8,
					5
				]);

				map.on('mouseenter', LAYER_CONFIG.whProjectsPoints.id, () => {
					map.getCanvas().style.cursor = 'pointer';
				});

				map.on('mouseleave', LAYER_CONFIG.whProjectsPoints.id, () => {
					map.getCanvas().style.cursor = '';
				});

				if (!isTabletOrAbove) {
					map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
					const attrib = document.querySelector('.maplibregl-ctrl-attrib');
					attrib?.classList.remove('maplibregl-compact-show');
					attrib?.removeAttribute('open');
				}
			});

			const unsubscribe = activeFilters.subscribe(() => {
				if (map) {
					updateMapFilters();
				}
			});

			return () => {
				unsubscribe();
				if (map) {
					map.remove();
				}
			};
		} catch (error) {
			console.error('Error initializing map:', error);
			return () => {};
		}
	});
</script>

<svelte:window bind:innerWidth />
<main class="absolute inset-0 flex flex-col overflow-hidden font-['Basis_Grotesque']">
	<div id="map-container" class="relative">
		<ExpandLegend />
		<Legend />
		<div class="floating-panel absolute left-[3%] top-4 z-10 w-[94%] p-4 md:left-4 md:w-[400px]">
			<SearchPanel onSearch={searchProjects} />
		</div>
	</div>

	<div
		class="absolute bottom-0 left-0 right-0 z-20 border-t border-slate-200 bg-white shadow-lg transition-all duration-300"
		style="height: {$resultsExpanded ? '33vh' : '40px'}"
	>
		<div
			class="absolute inset-x-0 top-0 flex h-10 items-center justify-between border-b border-slate-200 bg-slate-50 px-4"
		>
			<button
				type="button"
				class="flex w-full cursor-pointer appearance-none items-center gap-2 border-0 bg-transparent p-0 text-left transition-colors hover:text-slate-700"
				on:click={() => resultsExpanded.update((v) => !v)}
				on:keydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						resultsExpanded.update((v) => !v);
					}
				}}
				aria-expanded={$resultsExpanded}
				aria-controls="results-table-container"
			>
				<svg
					class="h-4 w-4 transition-transform duration-300"
					style="transform: rotate({$resultsExpanded ? '0deg' : '180deg'})"
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M19 9l-7 7-7-7"
					/>
				</svg>
				<span class="text-sm font-medium">Data table</span>
				<span class="text-sm text-slate-500">
					{#if $isDataLoading}
						(Loading...)
					{:else if $isSearching}
						(Searching...)
					{:else}
						({$currentTableCount} projects)
					{/if}
				</span>
			</button>
			{#if $resultsExpanded}
				<button
					type="button"
					on:click|stopPropagation={() => {
						if ($resultsExpanded) {
							const event = new CustomEvent('downloadcsv');
							window.dispatchEvent(event);
						}
					}}
					class="flex h-8 items-center gap-1.5 whitespace-nowrap rounded border px-2 text-xs text-slate-600 transition-colors hover:bg-slate-200/70 hover:text-slate-900"
				>
					<svg
						class="h-3.5 w-3.5 flex-shrink-0"
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						aria-hidden="true"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
						/>
					</svg>
					Download CSV
				</button>
			{/if}
		</div>

		{#if $resultsExpanded}
			<div id="results-table-container" class="absolute inset-0 top-10 overflow-hidden">
				<ResultsTable />
			</div>
		{/if}
	</div>
</main>
