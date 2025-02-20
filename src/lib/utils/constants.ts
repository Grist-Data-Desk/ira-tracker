import maplibregl from 'maplibre-gl';

// Grist brand colors
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

// Initial viewport bounds for the map on mobile and desktop
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

// The breakpoint for switching between mobile and desktop views
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

// State bounds for zooming to specific states
export const STATE_BOUNDS: Record<string, { center: [number, number]; zoom: number }> = {
	// States
	al: { center: [-86.8073, 32.7990], zoom: 6.5 },
	ak: { center: [-153.3694, 63.5888], zoom: 4 },
	az: { center: [-111.6602, 34.2744], zoom: 6 },
	ar: { center: [-92.4426, 34.8938], zoom: 6.5 },
	ca: { center: [-119.4179, 37.1841], zoom: 5.5 },
	co: { center: [-105.7821, 39.5501], zoom: 6.5 },
	ct: { center: [-72.7273, 41.6219], zoom: 8 },
	de: { center: [-75.5277, 39.1453], zoom: 8 },
	fl: { center: [-82.4497, 28.6305], zoom: 6 },
	ga: { center: [-83.4428, 32.6415], zoom: 6.5 },
	hi: { center: [-157.5311, 21.0946], zoom: 7 },
	id: { center: [-114.6130, 44.3509], zoom: 6 },
	il: { center: [-89.1965, 40.0417], zoom: 6 },
	in: { center: [-86.2816, 39.8942], zoom: 6.5 },
	ia: { center: [-93.5000, 42.0751], zoom: 6.5 },
	ks: { center: [-98.3804, 38.4937], zoom: 6.5 },
	ky: { center: [-84.8700, 37.8393], zoom: 6.5 },
	la: { center: [-91.9623, 31.0689], zoom: 6.5 },
	me: { center: [-69.2428, 45.3695], zoom: 6.5 },
	md: { center: [-76.7909, 39.0550], zoom: 7 },
	ma: { center: [-71.8083, 42.2596], zoom: 7.5 },
	mi: { center: [-85.4102, 44.3467], zoom: 6 },
	mn: { center: [-94.3053, 46.2807], zoom: 6 },
	ms: { center: [-89.7309, 32.7364], zoom: 6.5 },
	mo: { center: [-92.4580, 38.3566], zoom: 6.5 },
	mt: { center: [-109.6333, 47.0527], zoom: 6 },
	ne: { center: [-99.7951, 41.5378], zoom: 6.5 },
	nv: { center: [-116.6312, 39.3289], zoom: 6 },
	nh: { center: [-71.5811, 43.6805], zoom: 7 },
	nj: { center: [-74.6728, 40.1907], zoom: 7 },
	nm: { center: [-106.1126, 34.4071], zoom: 6 },
	ny: { center: [-75.5268, 42.9538], zoom: 6 },
	nc: { center: [-79.3877, 35.5557], zoom: 6.5 },
	nd: { center: [-100.4659, 47.4501], zoom: 6.5 },
	oh: { center: [-82.7937, 40.2862], zoom: 6.5 },
	ok: { center: [-97.5137, 35.5889], zoom: 6.5 },
	or: { center: [-120.5583, 44.1419], zoom: 6 },
	pa: { center: [-77.7996, 40.8781], zoom: 6.5 },
	ri: { center: [-71.5562, 41.6762], zoom: 8.5 },
	sc: { center: [-80.9066, 33.9169], zoom: 6.5 },
	sd: { center: [-100.2263, 44.4443], zoom: 6.5 },
	tn: { center: [-86.3505, 35.8580], zoom: 6.5 },
	tx: { center: [-99.3312, 31.4757], zoom: 5.5 },
	ut: { center: [-111.6703, 39.3055], zoom: 6 },
	vt: { center: [-72.6658, 44.0687], zoom: 7 },
	va: { center: [-78.8537, 37.5215], zoom: 6.5 },
	wa: { center: [-120.4472, 47.3826], zoom: 6.5 },
	wv: { center: [-80.6227, 38.6409], zoom: 6.5 },
	wi: { center: [-89.9941, 44.6243], zoom: 6 },
	wy: { center: [-107.5512, 43.0760], zoom: 6.5 },

	// U.S. Territories
	pr: { center: [-66.4501, 18.2208], zoom: 8 },    // Puerto Rico
	gu: { center: [144.7937, 13.4443], zoom: 9.5 },  // Guam
	vi: { center: [-64.7460, 17.7289], zoom: 9.5 },  // U.S. Virgin Islands
	mp: { center: [145.6739, 15.0979], zoom: 9 },    // Northern Mariana Islands
	as: { center: [-170.7197, -14.2710], zoom: 9.5 } // American Samoa
};
