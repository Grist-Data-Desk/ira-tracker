
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		allowedHosts: ['9bd7aa5d-2de5-4570-aca4-eaadd13270e5-00-2iaijfp0jacj0.spock.replit.dev']
	}
});
