import type { Config } from 'tailwindcss';

export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			colors: {
				orange: '#F79945',
				turquoise: '#12A07F',
				fuchsia: '#AC00E8',
				cobalt: '#3977F3',
				earth: '#3C3830',
				red: '#F5515B',
				gold: '#FFB800',
				teal: '#00B4B4',
				smog: '#F0F0F0'
			}
		}
	},
	corePlugins: {
		preflight: false
	},
	plugins: []
} satisfies Config;
