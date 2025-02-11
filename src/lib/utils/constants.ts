import maplibregl from 'maplibre-gl';

// Grist brand colors.
export const COLORS = {
	ORANGE: '#F79945',
	TURQUOISE: '#12A07F',
	FUCHSIA: '#AC00E8',
	COBALT: '#3977F3',
	EARTH: '#3C3830',
	RED: '#F5515B',
	GOLD: '#FFB800',
	TEAL: '#00B4B4',
	GRAY: '#808080',
	GREEN: '#00c04b',
	PALE_GREEN: '#e8f5e9',
	BLUE: '#0077cc',
	PURPLE: '#9c27b0'
} as const;

// Initial viewport bounds for the map on mobile and desktop.
export const INITIAL_BOUNDS = {
	mobile: new maplibregl.LngLatBounds(
		new maplibregl.LngLat(-114.96386766075805, 46.334723352416034),
		new maplibregl.LngLat(-113.58509482116912, 48.00177103564428)
	),
	desktop: new maplibregl.LngLatBounds(
		new maplibregl.LngLat(-115.92088740560425, 46.9482176374018),
		new maplibregl.LngLat(-113.43039937148656, 47.96212201020842)
	)
};

// The breakpoint for switching between mobile and desktop views.
export const TABLET_BREAKPOINT = 640;

// Hard-coded categories
export const CATEGORIES = {
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
