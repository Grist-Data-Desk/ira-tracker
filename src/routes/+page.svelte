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
  import type { Point, Feature, GeoJsonProperties } from 'geojson';
  import '../app.css';
  import { ProjectPopup } from '$lib/utils/popup';
  import SearchPanel from '$lib/components/search/SearchPanel.svelte';
  import ResultsTable from '$lib/components/search/ResultsTable.svelte';
  import Legend from '$lib/components/legend/Legend.svelte';
  import { SOURCE_CONFIG, LAYER_CONFIG, DO_SPACES_URL, PMTILES_PATH, GEOJSON_PATH, STYLES_PATH, getCurrentColorExpressions } from '$lib/utils/config';
  import { get } from 'svelte/store';
  import type { ProjectFeatureCollection, IndexedFeatureCollection } from '$lib/types';
  import { writable } from 'svelte/store';
  import { orderBy } from 'lodash-es';

  class ResetViewControl {
    onAdd(map: maplibregl.Map) {
      const btn = document.createElement('button');
      btn.className = 'maplibregl-ctrl-icon maplibregl-ctrl-geolocate';
      btn.innerHTML = '🔄';
      btn.addEventListener('click', () => {
        // Reset map view
        map.flyTo({
          center: [-98.5795, 39.8283],
          zoom: isTabletOrAbove ? 4 : 3
        });

        // Clear search inputs and reset hasSearched
        searchQuery.set('');
        searchResults.set([]);
        hasSearched.set(false);

        // Reset legend state
        selectedColorMode.set('fundingSource');
        activeFilters.update(filters => {
          Object.keys(filters).forEach(key => {
            filters[key].clear();
          });
          return filters;
        });

        // Don't set currentTableCount here - let the reactive statement handle it

        // Remove search-related layers
        if (map?.getLayer('search-radius-outline')) {
          map.removeLayer('search-radius-outline');
        }
        if (map?.getLayer('search-radius-layer')) {
          map.removeLayer('search-radius-layer');
        }
        if (map?.getSource('search-radius')) {
          map.removeSource('search-radius');
        }

        // Show all points in PMTiles layer
        if (map?.getLayer('projects-points')) {
          map.setFilter('projects-points', null);
        }

        // Clear existing popup if any
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
  let innerHeight: number;
  let browser = false;
  let currentPopup: maplibregl.Popup | null = null;

  let pmtilesInstance: pmtiles.PMTiles;

  $: isTabletOrAbove = innerWidth > TABLET_BREAKPOINT;

  function cleanupSearchLayers() {
    if (!map) return;
    
    // Remove search-related layers
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
        // Set initial count immediately when data is parsed
        currentTableCount.set(data.features.length);
      } catch (e) {
        console.error('Failed to parse JSON:', e);
        throw new Error('Failed to parse decompressed data as JSON');
      }
      
      // Create spatial index from just the coordinates
      const points = data.features.map((f: Feature<Point>) => ({
        lon: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
        idx: data.features.indexOf(f)
      }));
      
      type PointType = typeof points[0];
      
      const { default: KDBush } = await import('kdbush');
      const index = new KDBush(
        points.length,
        64,
        Float64Array,
        (p: PointType) => p.lon,
        (p: PointType) => p.lat
      );

      // Add all points to the index
      points.forEach(point => {
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

  // Function to update map filters based on active filters and current search state
  function updateMapFilters() {
    if (!map) return;
    
    const currentMode = $selectedColorMode;
    const currentFilters = $activeFilters[currentMode];
    
    const expressions = getCurrentColorExpressions();
    map.setPaintProperty(
      'projects-points',
      'circle-color',
      expressions[currentMode]
    );
    
    const filters: any[] = [];
    
    // Add search filter if we have searched
    if ($hasSearched && map.getSource('search-radius')) {
      filters.push([
        'in',
        'UID',
        ...Array.from($searchResults.map(p => p.uid))
      ]);
    }
    
    // Add legend filter if we have active filters
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

      // If "Other" is selected, we need to show all points that aren't in the main categories
      if (currentFilters.has('Other')) {
        const selectedMainCategories = Array.from(currentFilters).filter(f => f !== 'Other');
        
        if (selectedMainCategories.length > 0) {
          // Show both "Other" points and specifically selected categories
          filters.push([
            'any',
            ['!in', filterField, ...mainCategories],
            ['in', filterField, ...selectedMainCategories]
          ]);
        } else {
          // Only show "Other" points (not in main categories)
          filters.push(['!in', filterField, ...mainCategories]);
        }
      } else {
        // Just filter for the selected categories
        filters.push([
          'in',
          filterField,
          ...Array.from(currentFilters)
        ]);
      }
    }
    
    // Combine filters if we have multiple
    const finalFilter = filters.length > 0 
      ? filters.length > 1 
        ? ['all', ...filters]
        : filters[0]
      : undefined;
    
    map.setFilter('projects-points', finalFilter);
  }

  $: {
    if (browser && map) {
      updateMapFilters();
    }
  }

  async function searchProjects() {
    isSearching.set(true);
    hasSearched.set(true);

    try {
      let lat: number;
      let lon: number;

      // Check if input is lat,lon coordinates
      const latLonRe = /^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/;
      if (latLonRe.test(get(searchQuery))) {
        [lat, lon] = get(searchQuery).split(',').map((coord: string) => parseFloat(coord.trim()));
        
        // Validate coordinates
        if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
          throw new Error('Invalid coordinates');
        }
      } else {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=geojson&q=${encodeURIComponent(get(searchQuery))}&addressdetails=1&limit=1&countrycodes=us`);
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

      // Clean up any existing search layers before adding new ones
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
        // Calculate a bounding box that fully encompasses the search radius
        const searchRadiusInKm = $searchRadius * 1.60934; // Convert miles to km
        const latKm = 110.574; // Approximate km per degree of latitude
        const lonKm = 111.320 * Math.cos(lat * Math.PI / 180); // Approximate km per degree of longitude at this latitude
        
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

        const projects = nearbyFeatures.map((feature: Feature<Point>) => {
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
        });
        
        searchResults.set(projects);
        currentTableCount.set(projects.length);

        updateMapFilters();

        const bounds = new maplibregl.LngLatBounds();
        const coords = searchArea.geometry.coordinates[0] as Array<[number, number]>;
        coords.forEach(coord => bounds.extend(coord));

        map?.fitBounds(bounds, {
          padding: { 
            top: 50, 
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

  // Add this reactive statement to keep track of filtered results
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

  // Update count whenever filtered results change
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

      await new Promise(resolve => setTimeout(resolve, 0));

      map = new maplibregl.Map({
          container: 'map-container',
          style: `${DO_SPACES_URL}/${STYLES_PATH}/map-style.json`,
          // style: 'styles/map-style-local.json',
          center: [-98.5795, 39.8283],
          zoom: isTabletOrAbove ? 4 : 3,
          minZoom: 2
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
              
              // Group features by exact coordinates to handle overlapping points
              const featuresByLocation = e.features.reduce((acc: { [key: string]: any[] }, feature: any) => {
                if (!feature.geometry || feature.geometry.type !== 'Point') return acc;
                const coords = (feature.geometry as { type: 'Point', coordinates: [number, number] }).coordinates;
                const key = `${coords[0]},${coords[1]}`;
                if (!acc[key]) acc[key] = [];
                acc[key].push(feature);
                return acc;
              }, {});

              const coordinates = (e.features[0].geometry as { type: 'Point', coordinates: [number, number] }).coordinates;
              const key = `${coordinates[0]},${coordinates[1]}`;
              const locationFeatures = featuresByLocation[key];

              const projects = locationFeatures.map(feature => {
                const props = feature.properties;
                return {
                    uid: props['UID'],
                    dataSource: props['Data Source'],
                    fundingSource: props['Funding Source'],
                    programId: props['Program ID'],
                    programName: props['Program Name'],
                    projectName: props['Project Name'],
                    projectDescription: props['Project Description'],
                    projectLocationType: props['Project Location Type'],
                    city: props.City,
                    county: props.County,
                    tribe: props.Tribe,
                    state: props.State,
                    congressionalDistrict: props['118th CD'],
                    fundingAmount: props['Funding Amount'],
                    link: props.Link,
                    agencyName: props['Agency Name'],
                    bureauName: props['Bureau Name'],
                    category: props.Category,
                    subcategory: props.Subcategory,
                    programType: props['Program Type'],
                    latitude: coordinates[1],
                    longitude: coordinates[0]
                };
              });

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
            2, 3,  // Size at low zoom
            8, 5   // Size at high zoom
          ]);

          map.on('mouseenter', LAYER_CONFIG.whProjectsPoints.id, () => {
              map.getCanvas().style.cursor = 'pointer';
          });

          map.on('mouseleave', LAYER_CONFIG.whProjectsPoints.id, () => {
              map.getCanvas().style.cursor = '';
          });
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

<svelte:window bind:innerWidth bind:innerHeight />
<main class="absolute inset-0 overflow-hidden font-['Basis_Grotesque'] flex flex-col">
  <div id="map-container" class="flex-1 relative">
    <div id="map-root"></div>
    <div class="absolute right-[calc(3%+48px)] top-4">
      <Legend />
    </div>
    <div class="absolute left-4 top-4 w-[400px] floating-panel z-10 p-4">
      <SearchPanel onSearch={searchProjects} />
    </div>
  </div>

  <!-- Updated Results Table Section -->
  <div class="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-200 transition-all duration-300 shadow-lg" 
       style="height: {$resultsExpanded ? '40vh' : '40px'}">
    <!-- Header/Toggle Bar -->
    <div class="absolute inset-x-0 top-0 h-10 bg-slate-50 border-b border-slate-200 flex items-center justify-between px-4 cursor-pointer">
      <div class="flex items-center gap-2" on:click={() => resultsExpanded.update(v => !v)}>
        <svg class="w-4 h-4 transition-transform duration-300" 
             style="transform: rotate({$resultsExpanded ? '0deg' : '180deg'})" 
             xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
        <span class="font-medium text-sm">Data table</span>
        <span class="text-sm text-slate-500">
          {#if $isDataLoading}
            (Loading...)
          {:else if $isSearching}
            (Searching...)
          {:else}
            ({$currentTableCount} projects)
          {/if}
        </span>
      </div>
      {#if $resultsExpanded}
        <button 
          on:click|stopPropagation={() => {
            if ($resultsExpanded) {
              const event = new CustomEvent('downloadcsv');
              window.dispatchEvent(event);
            }
          }}
          class="flex items-center gap-1.5 px-2 py-1 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded transition-colors"
        >
          <svg class="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
          </svg>
          Download CSV
        </button>
      {/if}
    </div>
    
    <!-- Results Table Container -->
    {#if $resultsExpanded}
      <div class="absolute inset-0 top-10 overflow-hidden">
        <ResultsTable />
      </div>
    {/if}
  </div>
</main>