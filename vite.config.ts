import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit(),
		{
			name: 'build-date',
			transform(code, id) {
				if (id.endsWith('buildInfo.ts')) {
					return {
						code: code.replace('__BUILD_DATE__', new Date().toLocaleDateString('en-US', {
							year: 'numeric',
							month: 'long',
							day: 'numeric'
						}))
					};
				}
			}
		}
	],
});
