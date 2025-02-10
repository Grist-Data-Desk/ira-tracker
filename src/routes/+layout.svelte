
<script lang="ts">
	import 'maplibre-gl/dist/maplibre-gl.css';
	import '../app.css';
	let { children } = $props();
</script>

<div id="map-root">
	{@render children()}
</div>
