<script lang="ts">
	import { onMount } from 'svelte';
	import {
		dataStore,
		searchState,
		visualState,
		uiState,
		currentCount,
		isDataLoading
	} from '$lib/stores';
	import { TABLET_BREAKPOINT, CATEGORIES, STATE_BOUNDS } from '$lib/utils/constants';
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
	import type { ProjectFeatureCollection, Project } from '$lib/types';
	import ExpandLegend from '$lib/components/legend/ExpandLegend.svelte';
	import Credits from '$lib/components/credits/Credits.svelte';

	let map: maplibregl.Map;
	let innerWidth: number;
	let browser = false;
	let currentPopup: maplibregl.Popup | null = null;
	let pmtilesInstance: pmtiles.PMTiles;
	let geolocateControl: maplibregl.GeolocateControl | null = null;
	let searchResultsLayer = 'search-results-points';

	$: isTabletOrAbove = innerWidth > TABLET_BREAKPOINT;

	class ResetViewControl {
		onAdd(map: maplibregl.Map) {
			const btn = document.createElement('button');
			btn.className = 'maplibregl-ctrl-icon maplibregl-ctrl-geolocate';
			btn.innerHTML = '🔄';
			btn.addEventListener('click', () => {
				if (geolocateControl) {
					geolocateControl._watchState = 'OFF';
					geolocateControl._geolocateButton.classList.remove('maplibregl-ctrl-geolocate-active');
					geolocateControl._geolocateButton.classList.remove('maplibregl-ctrl-geolocate-background');
					geolocateControl._geolocateButton.classList.remove('maplibregl-ctrl-geolocate-background-error');
					geolocateControl._clearWatch();
				}

				map.flyTo({
					center: [-98.5795, isTabletOrAbove ? 39.8283 : 49],
					zoom: isTabletOrAbove ? 4 : 3
				});

				searchState.set({
					query: '',
					radius: 50,
					isSearching: false,
					results: []
				});

				visualState.set({
					colorMode: 'fundingSource',
					filters: new Set()
				});

				cleanupSearchLayers();

				if (map?.getLayer('projects-points')) {
					map.setFilter('projects-points', null);
					map.setLayoutProperty('projects-points', 'visibility', 'visible');
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

	function cleanupSearchLayers() {
		if (!map) return;

		if (map.getLayer(searchResultsLayer)) {
			map.off('click', searchResultsLayer, handleSearchResultClick);
			map.off('mouseenter', searchResultsLayer, handleSearchResultMouseEnter);
			map.off('mouseleave', searchResultsLayer, handleSearchResultMouseLeave);
			map.removeLayer(searchResultsLayer);
		}
		if (map.getSource(searchResultsLayer)) {
			map.removeSource(searchResultsLayer);
		}
		if (map.getLayer('search-radius-outline')) {
			map.removeLayer('search-radius-outline');
		}
		if (map.getLayer('search-radius-layer')) {
			map.removeLayer('search-radius-layer');
		}
		if (map.getSource('search-radius')) {
			map.removeSource('search-radius');
		}

		if (map.getLayer(LAYER_CONFIG.projectsPoints.id)) {
			map.setLayoutProperty(LAYER_CONFIG.projectsPoints.id, 'visibility', 'visible');
		}
	}

	function handleSearchResultClick(e: maplibregl.MapMouseEvent & { features?: any[] }) {
		if (!e.features?.length || !map) return;

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
	}

	function handleSearchResultMouseEnter() {
		if (map) map.getCanvas().style.cursor = 'pointer';
	}

	function handleSearchResultMouseLeave() {
		if (map) map.getCanvas().style.cursor = '';
	}

	async function loadGeoJSONData() {
		try {
			dataStore.update(state => ({ ...state, isLoading: true }));
			const response = await fetch(`${DO_SPACES_URL}/${GEOJSON_PATH}/projects.geojson.br?v=${Date.now()}`);
			if (!response.ok) throw new Error('Failed to load GeoJSON data');

			const buffer = await response.arrayBuffer();
			const decompressed = await new Response(buffer, {
				headers: { 'Content-Encoding': 'br' }
			}).text();

			let data;
			try {
				data = JSON.parse(decompressed) as ProjectFeatureCollection;
				// Log all available property keys from the first feature
				if (data.features.length > 0) {
					console.log('Available property keys:', 
						Object.keys(data.features[0].properties || {})
					);
				}
				// Log a sample of the raw data
				console.log('Sample GeoJSON feature properties:', 
					data.features.slice(0, 3).map(f => ({
						...f.properties,
						outlayed: f.properties?.['Outlayed Amount From IIJA Supplemental'],
						obligated: f.properties?.['Obligated Amount From IIJA Supplemental'],
						percent: f.properties?.['Percent IIJA Outlayed']
					}))
				);
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

			dataStore.update(state => ({
				...state,
				isLoading: false,
				collection: {
					collection: data,
					index
				}
			}));
		} catch (error) {
			console.error('Error loading GeoJSON data:', error);
			dataStore.update(state => ({ ...state, isLoading: false }));
		}
	}

	function updateMapFilters() {
		if (!map) return;

		const currentMode = $visualState.colorMode;
		const currentFilters = $visualState.filters;

		const expressions = getCurrentColorExpressions();
		
		map.setPaintProperty('projects-points', 'circle-color', expressions[currentMode]);
		if (map.getLayer(searchResultsLayer)) {
			map.setPaintProperty(searchResultsLayer, 'circle-color', expressions[currentMode]);
		}

		const filters: any[] = [];
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

			const hasOther = currentFilters.has('Other');
			const mainCategoryFilters = Array.from(currentFilters).filter(f => mainCategories.includes(f));
			
			if (hasOther) {
				if (mainCategoryFilters.length > 0) {
					filters.push([
						'any',
						['!in', filterField, ...mainCategories], // Other
						['in', filterField, ...mainCategoryFilters] // Selected main categories
					]);
				} else {
					filters.push(['!in', filterField, ...mainCategories]);
				}
			} else if (mainCategoryFilters.length > 0) {
				filters.push(['in', filterField, ...mainCategoryFilters]);
			}
		}

		const finalFilter = filters.length > 0 
			? (filters.length > 1 ? ['all', ...filters] : filters[0]) 
			: null;

		if (map.getLayoutProperty('projects-points', 'visibility') === 'visible') {
			map.setFilter('projects-points', finalFilter);
		}

		if (map.getLayer(searchResultsLayer)) {
			map.setFilter(searchResultsLayer, finalFilter);
		}
	}

	$: if (browser && map && $visualState) {
		updateMapFilters();
	}

	async function searchProjects() {
		searchState.update(state => ({ ...state, isSearching: true }));
		uiState.update(state => ({ ...state, creditsExpanded: false }));

		if (geolocateControl) {
			geolocateControl._watchState = 'OFF';
			geolocateControl._geolocateButton.classList.remove('maplibregl-ctrl-geolocate-active');
			geolocateControl._geolocateButton.classList.remove('maplibregl-ctrl-geolocate-background');
			geolocateControl._geolocateButton.classList.remove('maplibregl-ctrl-geolocate-background-error');
			geolocateControl._clearWatch();
		}

		try {
			let lat: number;
			let lon: number;

			const latLonRe = /^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/;
			if (latLonRe.test($searchState.query)) {
				[lat, lon] = $searchState.query
					.split(',')
					.map((coord: string) => parseFloat(coord.trim()));

				if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
					throw new Error('Invalid coordinates');
				}
			} else {
				const response = await fetch(
					`https://nominatim.openstreetmap.org/search?format=geojson&q=${encodeURIComponent($searchState.query)}&addressdetails=1&limit=1&countrycodes=us`
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
			const searchArea = turf.circle(searchCenter, $searchState.radius, { steps: 64, units: 'miles' });

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

			const $data = $dataStore;
			if ($data.collection.index) {
				const searchRadiusInKm = $searchState.radius * 1.60934;
				const latKm = 110.574;
				const lonKm = 111.32 * Math.cos((lat * Math.PI) / 180);

				const latDelta = searchRadiusInKm / latKm;
				const lonDelta = searchRadiusInKm / lonKm;

				const pointIndices = $data.collection.index.range(
					lon - lonDelta,
					lat - latDelta,
					lon + lonDelta,
					lat + latDelta
				);

				const nearbyFeatures = pointIndices
					.map((i: number) => $data.collection.collection.features[i])
					.filter((feature: Feature<Point>) => {
						const distance = turf.distance(
							turf.point(feature.geometry.coordinates),
							turf.point([lon, lat]),
							{ units: 'miles' }
						);
						return distance <= $searchState.radius;
					});

				const projects: Project[] = nearbyFeatures.map(featureToProject);

				searchState.update(state => ({ ...state, results: projects }));

				if (map?.getLayer(LAYER_CONFIG.projectsPoints.id)) {
					map.setLayoutProperty(LAYER_CONFIG.projectsPoints.id, 'visibility', 'none');
				}

				const searchResultsGeoJSON: GeoJSON.FeatureCollection<Point> = {
					type: 'FeatureCollection',
					features: nearbyFeatures
				};

				if (map) {
					map.addSource(searchResultsLayer, {
						type: 'geojson',
						data: searchResultsGeoJSON
					});

					const currentMode = $visualState.colorMode;
					const expressions = getCurrentColorExpressions();

					map.addLayer({
						id: searchResultsLayer,
						type: 'circle',
						source: searchResultsLayer,
						paint: {
							'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 3, 8, 5],
							'circle-color': expressions[currentMode],
							'circle-stroke-width': 2,
							'circle-stroke-color': '#ffffff',
							'circle-opacity': 0.7
						}
					});

					updateMapFilters();

					map.on('click', searchResultsLayer, handleSearchResultClick);
					map.on('mouseenter', searchResultsLayer, handleSearchResultMouseEnter);
					map.on('mouseleave', searchResultsLayer, handleSearchResultMouseLeave);

					const bounds = new maplibregl.LngLatBounds();
					const coords = searchArea.geometry.coordinates[0] as Array<[number, number]>;
					coords.forEach((coord) => bounds.extend(coord));

					map?.fitBounds(bounds, {
						padding: {
							top: isTabletOrAbove ? 50 : 425,
							bottom: 50,
							left: isTabletOrAbove ? 450 : 50,
							right: 50
						},
						duration: 1000
					});
				}
			}
		} catch (error) {
			console.error('Search error:', error);
			searchState.update(state => ({ ...state, results: [] }));
		} finally {
			searchState.update(state => ({ ...state, isSearching: false }));
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
	};

	onMount(async () => {
		browser = true;
		
		const urlParams = new URLSearchParams(window.location.search);
		const stateParam = urlParams.get('state')?.toLowerCase();
		const stateConfig = stateParam ? STATE_BOUNDS[stateParam] : undefined;

		try {
			await loadGeoJSONData();

			const protocol = new pmtiles.Protocol();
			maplibregl.addProtocol('pmtiles', protocol.tile);

			const pmtilesUrl = `${DO_SPACES_URL}/${PMTILES_PATH}/projects.pmtiles?v=${Date.now()}`;
			pmtilesInstance = new pmtiles.PMTiles(pmtilesUrl);
			protocol.add(pmtilesInstance);

			await new Promise((resolve) => setTimeout(resolve, 0));

			map = new maplibregl.Map({
				container: 'map-container',
				style: `${DO_SPACES_URL}/${STYLES_PATH}/map-style.json`,
				center: stateConfig?.center ?? [-98.5795, isTabletOrAbove ? 39.8283 : 49],
				zoom: stateConfig?.zoom ?? (isTabletOrAbove ? 4 : 3),
				minZoom: 2,
				attributionControl: false
			});

			map.scrollZoom.disable();
			map.scrollZoom.setWheelZoomRate(0);
			map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
			geolocateControl = new maplibregl.GeolocateControl({
				positionOptions: {
					enableHighAccuracy: true
				},
				trackUserLocation: false
			});
			
			geolocateControl.on('geolocate', (position) => {
				const lat = position.coords.latitude;
				const lon = position.coords.longitude;
				searchState.update(state => ({
					...state,
					query: `${lat.toFixed(4)}, ${lon.toFixed(4)}`
				}));
				searchProjects();
			});

			geolocateControl.on('error', () => {
				if (geolocateControl) {
					geolocateControl._watchState = 'OFF';
					geolocateControl._clearWatch();
				}
			});
			
			map.addControl(geolocateControl, 'top-right');
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
					if (!map.getLayer(LAYER_CONFIG.projectsPoints.id)) {
						map.addLayer(LAYER_CONFIG.projectsPoints);
					}
				} catch (error) {
					console.error('Error adding layers:', error);
				}

				map.on('click', LAYER_CONFIG.projectsPoints.id, (e) => {
					if (!e.features?.length) return;

					console.log('Raw feature from PMTiles:', e.features[0]);
					console.log('Raw feature properties:', e.features[0].properties);

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

				map.setPaintProperty(LAYER_CONFIG.projectsPoints.id, 'circle-radius', [
					'interpolate',
					['linear'],
					['zoom'],
					2,
					3,
					8,
					5
				]);

				map.on('mouseenter', LAYER_CONFIG.projectsPoints.id, () => {
					map.getCanvas().style.cursor = 'pointer';
				});

				map.on('mouseleave', LAYER_CONFIG.projectsPoints.id, () => {
					map.getCanvas().style.cursor = '';
				});

				if (!isTabletOrAbove) {
					map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
					const attrib = document.querySelector('.maplibregl-ctrl-attrib');
					attrib?.classList.remove('maplibregl-compact-show');
					attrib?.removeAttribute('open');
				}
			});

			return () => {
				if (map) {
					map.remove();
				}
			};
		} catch (error) {
			console.error('Error initializing map:', error);
		}
	});
</script>

<svelte:window bind:innerWidth />
<main class="absolute inset-0 flex flex-col overflow-hidden font-['Basis_Grotesque']">
	<div class="relative flex-1" class:blur-sm={$uiState.resultsExpanded}>
		<div id="map-container" class="relative h-full">
			<ExpandLegend />
			<Legend />
			<div class="floating-panel absolute left-[3%] top-4 z-10 w-[94%] p-4 md:left-4 md:w-[400px]">
				<SearchPanel onSearch={searchProjects} />
				<Credits />
			</div>
		</div>
	</div>

	{#if $uiState.resultsExpanded}
		<div 
			class="absolute inset-0 z-10 bg-black/5 backdrop-blur-[2px] transition-opacity duration-300"
			on:click={() => uiState.update(state => ({ ...state, resultsExpanded: false }))}
			on:keydown={(e) => {
				if (e.key === 'Enter' || e.key === 'Space') {
					e.preventDefault();
					uiState.update(state => ({ ...state, resultsExpanded: false }));
				}
			}}
			role="button"
			tabindex="0"
			aria-label="Close results table"
		></div>
	{/if}

	<div
		class="absolute bottom-0 left-0 right-0 z-20 border-t border-slate-200 bg-white shadow-lg transition-all duration-300"
		style="height: {$uiState.resultsExpanded ? '66vh' : '40px'}"
	>
		<div
			class="absolute inset-x-0 top-0 flex h-10 items-center justify-between border-b border-slate-200 bg-slate-50 px-4"
		>
			<button
				type="button"
				class="flex w-full cursor-pointer appearance-none items-center gap-2 border-0 bg-transparent p-0 text-left transition-colors hover:text-slate-700"
				on:click={() => uiState.update(state => ({ ...state, resultsExpanded: !state.resultsExpanded }))}
				on:keydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						uiState.update(state => ({ ...state, resultsExpanded: !state.resultsExpanded }));
					}
				}}
				aria-expanded={$uiState.resultsExpanded}
				aria-controls="results-table-container"
			>
				<svg
					class="h-4 w-4 transition-transform duration-300"
					style="transform: rotate({$uiState.resultsExpanded ? '0deg' : '180deg'})"
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
					{:else if $searchState.isSearching}
						(Searching...)
					{:else}
						({$currentCount} projects)
					{/if}
				</span>
			</button>
			{#if $uiState.resultsExpanded}
				<button
					type="button"
					on:click|stopPropagation={() => {
						if ($uiState.resultsExpanded) {
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

		{#if $uiState.resultsExpanded}
			<div id="results-table-container" class="absolute inset-0 top-10 overflow-hidden">
				<ResultsTable />
			</div>
		{/if}
	</div>
</main>

<div class="logo-container">
	<a href="https://grist.org" target="_blank" rel="noopener noreferrer">
		<img src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMyIgdmlld0JveD0iMCAwIDEwMCAxMDMiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxwYXRoIGQ9Ik04NS4xMSA2NFY4OC4zQzc5LjMxIDkxLjkgNzIuODEgOTQgNjcuMzEgOTRDMzkuOTEgOTQgMTUuMzEgNjQuMSAxNS4zMSAzM0MxNS4zMSAxOC40IDI0LjkxIDYuOSA0MS42MSA2LjlDNTIuMTEgNi45IDcyLjUxIDEzLjYgODcuNjEgMjkuOEM4OC4wNjg4IDMwLjM4IDg4LjY0MzkgMzAuODU3NiA4OS4yOTg0IDMxLjIwMjFDODkuOTUyOCAzMS41NDY1IDkwLjY3MjEgMzEuNzUwMiA5MS40MSAzMS44QzkzLjQxIDMxLjggOTQuNjEgMzAuNSA5NC42MSAyOC4yVjJIOTAuOTFWM0M5MC45MSA2LjYgODguODEgNy42IDgzLjYxIDZDNzMuMTcyNyAyLjUwNDA4IDYyLjIxNTcgMC44MTMxOTMgNTEuMjEgMUMxOC4zMSAxIDAuMjEwMDIyIDI2LjggMC4yMTAwMjIgNTJDMC4yMTAwMjIgODAuOCAyMi4xMSAxMDMgNTEuMjEgMTAzQzYzLjM1OCAxMDIuOTE0IDc1LjE4ODMgOTkuMTEgODUuMTEgOTIuMVYxMDJIOTkuNjFWNTBINDYuNjFWNjRIODUuMTFaIiBmaWxsPSIjM0MzODMwIi8+Cjwvc3ZnPg==" alt="Grist G logo" />
	</a>
</div>
