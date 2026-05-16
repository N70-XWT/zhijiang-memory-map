import L, { type DivIcon, type LatLngTuple } from 'leaflet'
import type { MarkerOffset } from '@/lib/markerLayout'

export const CHINA_MAP_CENTER: LatLngTuple = [31.2, 118.6]
export const CHINA_MAP_ZOOM = 5
export const CHINA_MAP_MIN_ZOOM = 4
export const CHINA_MAP_MAX_ZOOM = 17

export const TILE_LAYER_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
export const TILE_LAYER_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
export const TILE_LAYER_MAX_NATIVE_ZOOM = 19
export const TILE_LAYER_KEEP_BUFFER = 3

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

type MarkerIconOptions = {
  thumbnail: string
  title: string
  isSelected: boolean
  offset?: MarkerOffset
}

const markerIconCache = new Map<string, DivIcon>()

export const createActivityMarkerIcon = ({
  thumbnail,
  title,
  isSelected,
  offset = { x: 0, y: 0 },
}: MarkerIconOptions): DivIcon => {
  const cacheKey = `${thumbnail}::${title}::${isSelected ? '1' : '0'}::${offset.x},${offset.y}`
  const cachedIcon = markerIconCache.get(cacheKey)
  if (cachedIcon) {
    return cachedIcon
  }

  const safeTitle = escapeHtml(title)
  const markerClass = isSelected ? 'activity-marker selected' : 'activity-marker'

  const createdIcon = L.divIcon({
    className: 'activity-marker-wrapper',
    html: `
      <div
        class="${markerClass}"
        aria-label="${safeTitle}"
        style="--activity-marker-offset-x: ${offset.x}px; --activity-marker-offset-y: ${offset.y}px;"
      >
        <img
          src="${thumbnail}"
          alt="${safeTitle}"
          width="56"
          height="56"
          loading="lazy"
          decoding="async"
          fetchpriority="low"
          onerror="this.style.display='none';this.parentNode.classList.add('is-fallback')"
        />
      </div>
    `,
    iconSize: [60, 60],
    iconAnchor: [30, 30],
  })

  markerIconCache.set(cacheKey, createdIcon)
  return createdIcon
}
