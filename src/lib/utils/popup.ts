import type { Project } from '../types';
import type { Popup } from 'maplibre-gl';
import maplibregl from 'maplibre-gl';
import { isValidUrl } from './url';

export class ProjectPopup {
	private map: maplibregl.Map;
	private popup: Popup | null = null;
	private features: Project[];
	private currentIndex: number = 0;

	constructor(map: maplibregl.Map, projects: Project[]) {
		this.map = map;
		this.features = projects;
	}

	showPopup(lngLat: maplibregl.LngLat, projects: Project[]): maplibregl.Popup {
		if (this.popup) {
			this.popup.remove();
		}

		this.features = projects;
		this.currentIndex = 0;

		const clickPoint = this.map.project(lngLat);
		const mapHeight = this.map.getContainer().offsetHeight;
		const anchor = clickPoint.y < mapHeight / 2 ? 'top' : 'bottom';

		this.popup = new maplibregl.Popup({
			closeButton: true,
			closeOnClick: true,
			maxWidth: '300px',
			anchor
		})
			.setLngLat(lngLat)
			.setHTML(this.createPopupContent(projects[0]))
			.addTo(this.map);

		setTimeout(() => {
			const popupContent = this.popup?.getElement()?.querySelector('.maplibregl-popup-content');
			if (popupContent) {
				const prevBtn = popupContent.querySelector('.prev-btn');
				const nextBtn = popupContent.querySelector('.next-btn');

				if (prevBtn) {
					prevBtn.addEventListener('click', () => this.showPrevious());
				}
				if (nextBtn) {
					nextBtn.addEventListener('click', () => this.showNext());
				}

				const contentDiv = popupContent.querySelector('div');
				if (contentDiv) {
					contentDiv.scrollTop = 0;
				}
			}
		}, 0);

		return this.popup;
	}

	private showPrevious() {
		if (this.currentIndex > 0) {
			this.currentIndex--;
			this.updatePopupContent();
		}
	}

	private showNext() {
		if (this.currentIndex < this.features.length - 1) {
			this.currentIndex++;
			this.updatePopupContent();
		}
	}

	private updatePopupContent() {
		if (this.popup) {
			this.popup.setHTML(this.createPopupContent(this.features[this.currentIndex]));

			setTimeout(() => {
				const popupContent = this.popup?.getElement()?.querySelector('.maplibregl-popup-content');
				if (popupContent) {
					const prevBtn = popupContent.querySelector('.prev-btn');
					const nextBtn = popupContent.querySelector('.next-btn');

					if (prevBtn) {
						prevBtn.addEventListener('click', () => this.showPrevious());
					}
					if (nextBtn) {
						nextBtn.addEventListener('click', () => this.showNext());
					}

					const contentDiv = popupContent.querySelector('div');
					if (contentDiv) {
						contentDiv.scrollTop = 0;
					}
				}
			}, 0);
		}
	}

	private createPopupContent(project: Project): string {
		const formatCurrency = (value: unknown) => {
			if (!value) return '';
			const amount =
				typeof value === 'string'
					? parseFloat(value.replace(/[^0-9.-]/g, ''))
					: typeof value === 'number'
						? value
						: 0;
			if (isNaN(amount)) return '';
			return new Intl.NumberFormat('en-US', {
				style: 'currency',
				currency: 'USD',
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			}).format(amount);
		};

		const formatLocation = (city?: string, county?: string, state?: string) => {
			const parts = [];
			if (city) parts.push(city);
			if (county) parts.push(`${county} County`);
			if (state) parts.push(state);
			return parts.join(', ');
		};

		const paginationControls =
			this.features.length > 1
				? `<div class="flex items-center justify-between mt-2 pt-1.5 border-t border-gray-200 text-[11px]">
          <button class="prev-btn px-1.5 py-0.5 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed" 
            ${this.currentIndex === 0 ? 'disabled' : ''}>
            ← Prev
          </button>
          <span class="text-gray-500">
            ${this.currentIndex + 1} of ${this.features.length}
          </span>
          <button class="next-btn px-1.5 py-0.5 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            ${this.currentIndex === this.features.length - 1 ? 'disabled' : ''}>
            Next →
          </button>
        </div>`
				: '';

		return `
      <div class="pt-1 px-3 pb-3" style="max-height: 400px; overflow-y: auto;">
        <h3 class="font-bold mb-1.5 text-sm">${project.projectName}</h3>
        <div class="text-[11px] space-y-0.5">
          ${
						project.projectDescription && String(project.projectDescription) !== '0'
							? `<p class="mb-1.5">${project.projectDescription}</p>`
							: ''
					}
          <p><strong>Agency:</strong> ${project.agencyName}</p>
          <p><strong>Bureau:</strong> ${project.bureauName}</p>
          <p><strong>Program:</strong> ${project.programName}</p>
          <p><strong>Category:</strong> ${project.category}</p>
          <p><strong>Funding Source:</strong> ${project.fundingSource}</p>
          <p><strong>Amount:</strong> ${formatCurrency(project.fundingAmount)}</p>
          <p><strong>Location:</strong> ${formatLocation(project.city, project.county, project.state)}</p>
          ${isValidUrl(project.link) ? `<p class="mt-1.5"><a href="${project.link}" target="_blank" class="text-blue-600 hover:underline">More Information →</a></p>` : ''}
        </div>
        ${paginationControls}
      </div>
    `;
	}
}
