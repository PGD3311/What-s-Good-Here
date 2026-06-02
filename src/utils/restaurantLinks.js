// Shared builders for the external "action" links rendered on dish/restaurant
// surfaces (Dish, RestaurantDetail, DishListItem). Previously each surface
// hand-rolled these, and the directions fallback had already drifted — keep the
// URL shapes here so they can't diverge.
import { sanitizeUrl } from './sanitize'

const MAPS_DIR_BASE = 'https://www.google.com/maps/dir/?api=1&destination='

/**
 * Google Maps directions URL. Prefers exact coordinates; otherwise falls back
 * to an encoded address string. Callers pass their own fallback address (Dish
 * uses name + town, RestaurantDetail uses the raw address, DishListItem only
 * renders with coords so it passes none).
 *
 * @param {{ lat?: number|string, lng?: number|string, address?: string }} args
 */
export function buildDirectionsUrl({ lat, lng, address } = {}) {
  if (lat && lng) return MAPS_DIR_BASE + lat + ',' + lng
  return MAPS_DIR_BASE + encodeURIComponent(address || '')
}

/**
 * Order link for a restaurant: a Toast online-ordering deep link when there's a
 * toast_slug, otherwise the sanitized fallback order_url (sanitizeUrl returns
 * null for an invalid/unsafe URL, matching the prior inline behavior).
 *
 * @param {string|null|undefined} toastSlug
 * @param {string|null|undefined} orderUrl
 */
export function buildToastOrderUrl(toastSlug, orderUrl) {
  return toastSlug ? 'https://order.toasttab.com/online/' + toastSlug : sanitizeUrl(orderUrl)
}
