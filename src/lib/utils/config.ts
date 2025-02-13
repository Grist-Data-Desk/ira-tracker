import type { SourceSpecification, AddLayerObject } from 'maplibre-gl';
import { COLORS } from '$lib/utils/constants';

export const DO_SPACES_URL = 'https://grist.nyc3.cdn.digitaloceanspaces.com';
export const PMTILES_PATH = 'ira-bil/data/pmtiles';
export const GEOJSON_PATH = 'ira-bil/data/geojson';
export const STYLES_PATH = 'ira-bil/styles';

const colorOrder = [
	COLORS.ORANGE,
	COLORS.COBALT,
	COLORS.TURQUOISE,
	COLORS.TEAL,
	COLORS.FUCHSIA,
	COLORS.RED,
	COLORS.GOLD
];

const CATEGORIES = {
	agency: [
		'Department of Transportation',
		'Department of Agriculture',
		'Environmental Protection Agency',
		'Department of Energy',
		'Department of Homeland Security',
		'Department of the Interior'
	],
	category: [
		'Transportation',
		'Clean Energy, Buildings, and Manufacturing',
		'Resilience',
		'Clean Water',
		'Environmental Remediation',
		'Broadband'
	],
	fundingSource: ['IRA', 'BIL']
};

export const SOURCE_CONFIG: Record<string, { id: string; config: SourceSpecification }> = {
	projects: {
		id: 'projects',
		config: {
			type: 'vector',
			url: `pmtiles://${DO_SPACES_URL}/${PMTILES_PATH}/projects.pmtiles`
		}
	},
	reservations: {
		id: 'reservations',
		config: {
			type: 'vector',
			url: `pmtiles://${DO_SPACES_URL}/${PMTILES_PATH}/reservations.pmtiles`
		}
	},
	reservationLabels: {
		id: 'reservation-labels',
		config: {
			type: 'vector',
			url: `pmtiles://${DO_SPACES_URL}/${PMTILES_PATH}/reservation-labels.pmtiles`
		}
	}
};

function createColorExpression(field: string, categories: string[]) {
	return [
		'match',
		['get', field],
		...categories.map((name, i) => [name, colorOrder[i]]).flat(),
		COLORS.EARTH
	] as any;
}

export function getCurrentColorExpressions() {
	return {
		agency: createColorExpression('Agency Name', CATEGORIES.agency),
		category: createColorExpression('Category', CATEGORIES.category),
		fundingSource: createColorExpression('Funding Source', CATEGORIES.fundingSource)
	};
}

export const LAYER_CONFIG: Record<string, AddLayerObject> = {
	projectsPoints: {
		id: 'projects-points',
		source: 'projects',
		type: 'circle',
		'source-layer': 'projects',
		minzoom: 0,
		maxzoom: 22,
		layout: {
			visibility: 'visible'
		},
		paint: {
			'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 22, 12],
			'circle-color': createColorExpression('Funding Source', CATEGORIES.fundingSource),
			'circle-stroke-width': 2,
			'circle-stroke-color': '#ffffff',
			'circle-opacity': 0.7
		}
	},
	reservationsPolygons: {
		id: 'reservations-polygons',
		source: 'reservations',
		type: 'fill',
		'source-layer': 'reservations',
		minzoom: 0,
		maxzoom: 22,
		layout: {
			visibility: 'visible'
		},
		paint: {
			'fill-color': COLORS.GREEN,
			'fill-opacity': 0.2
		}
	},
	reservationLabels: {
		id: 'reservation-labels',
		source: 'reservation-labels',
		type: 'symbol',
		'source-layer': 'reservation-labels',
		minzoom: 6,
		maxzoom: 22,
		layout: {
			'text-field': ['concat', ['get', 'reservation_name'], ' Reservation'],
			'text-font': ['Basis Grotesque Pro Italic'],
			'text-size': ['interpolate', ['linear'], ['zoom'], 6, 12, 12, 16],
			'text-max-width': 7,
			'text-letter-spacing': 0.1
		},
		paint: {
			'text-color': COLORS.GREEN,
			'text-halo-color': 'hsla(0, 0%, 100%, 0.85)',
			'text-halo-width': 1.5
		}
	}
};
