import type { SourceSpecification, AddLayerObject, ExpressionSpecification } from 'maplibre-gl';
import type { Mode } from '$lib/types';
import { COLORS, CATEGORIES } from '$lib/utils/constants';
import { createColorMatchExpression } from '$lib/utils/expression';

export const DO_SPACES_URL = 'https://grist.nyc3.cdn.digitaloceanspaces.com';
export const PMTILES_PATH = 'ira-bil/data/pmtiles';
export const GEOJSON_PATH = 'ira-bil/data/geojson';
export const STYLES_PATH = 'ira-bil/styles';

export const SOURCE_CONFIG: Record<string, { id: string; config: SourceSpecification }> = {
	projects: {
		id: 'projects',
		config: {
			type: 'vector',
			url: `pmtiles://${DO_SPACES_URL}/${PMTILES_PATH}/projects.pmtiles?v=${Date.now()}`
		}
	},
	reservations: {
		id: 'reservations',
		config: {
			type: 'vector',
			url: `pmtiles://${DO_SPACES_URL}/${PMTILES_PATH}/reservations.pmtiles?v=${Date.now()}`
		}
	},
	reservationLabels: {
		id: 'reservation-labels',
		config: {
			type: 'vector',
			url: `pmtiles://${DO_SPACES_URL}/${PMTILES_PATH}/reservation-labels.pmtiles?v=${Date.now()}`
		}
	}
};

export const DEFAULT_COLOR_EXPRESSIONS: Record<Mode, ExpressionSpecification> = {
	agency: createColorMatchExpression('Agency Name', CATEGORIES.agency),
	category: createColorMatchExpression('Category', CATEGORIES.category),
	fundingSource: createColorMatchExpression('Funding Source', CATEGORIES.fundingSource)
};

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
			'circle-color': DEFAULT_COLOR_EXPRESSIONS.fundingSource,
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
