declare module 'kdbush' {
	export default class KDBush {
		constructor(
			numItems: number,
			nodeSize?: number,
			ArrayType?:
				| Float64ArrayConstructor
				| Int32ArrayConstructor
				| Int8ArrayConstructor
				| Uint8ArrayConstructor
				| Uint16ArrayConstructor
				| Uint32ArrayConstructor
				| Int16ArrayConstructor,
			getX?: (point: any) => number,
			getY?: (point: any) => number
		);

		add(x: number, y: number): void;
		finish(): void;

		range(minX: number, minY: number, maxX: number, maxY: number): number[];

		within(x: number, y: number, r: number): number[];
	}
}
