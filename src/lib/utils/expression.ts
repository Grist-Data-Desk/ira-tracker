import type { ExpressionSpecification } from 'maplibre-gl';

import { COLORS, COLOR_ORDER } from './constants';

/**
 * Create a Maplibre GL JS match expression for a given field and categories.
 *
 * @param field – The field to match against, one of 'Agency Name', 'Category',
 * or 'Funding Source'.
 * @param categories – The categories to match against.
 * @returns – A Maplibre GL JS match expression.
 */
export function createColorMatchExpression(
	field: 'Agency Name' | 'Category' | 'Funding Source',
	categories: string[]
): ExpressionSpecification {
	return [
		'match',
		['get', field],
		categories[0],
		COLOR_ORDER[0],
		...categories.slice(1).flatMap((name, i) => [name, COLOR_ORDER[i + 1]]),
		COLORS.EARTH
	];
}
