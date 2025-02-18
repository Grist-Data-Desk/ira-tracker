import type { Feature, Point, FeatureCollection } from 'geojson';
import type KDBush from 'kdbush';

export interface Project {
	uid: string;
	dataSource: string;
	fundingSource: string;
	programId: string;
	programName: string;
	projectName: string;
	projectDescription: string;
	projectLocationType: string;
	city: string;
	county: string;
	tribe: string;
	state: string;
	congressionalDistrict: string;
	fundingAmount: string;
	outlayedAmountFromIIJASupplemental: string;
	obligatedAmountFromIIJASupplemental: string;
	percentIIJAOutlayed: string;
	link: string;
	agencyName: string;
	bureauName: string;
	category: string;
	subcategory: string;
	programType: string;
	latitude: number;
	longitude: number;
}

export interface ProjectFeature extends Feature<Point> {
	coordinates: [number, number];
}

export interface ProjectFeatureCollection extends FeatureCollection<Point> {
	type: 'FeatureCollection';
	features: Feature<Point>[];
}

export interface IndexedFeatureCollection {
	collection: ProjectFeatureCollection;
	index: KDBush | null;
}
