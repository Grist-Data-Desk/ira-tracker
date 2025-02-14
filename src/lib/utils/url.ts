/**
 * Validates if a given string is a valid HTTP/HTTPS URL
 */
export function isValidUrl(url: string | null | undefined): boolean {
	if (!url) return false;
	try {
		const urlObj = new URL(url);
		return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
	} catch {
		return false;
	}
} 