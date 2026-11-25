/**
 * One Nominatim search result, passed through unchanged (and cached as-is).
 * Only the fields fndom reads are typed; Nominatim sends more.
 */
export interface NominatimPlaceDto {
  place_id: number;
  osm_id?: number;
  osm_type?: string;
  lat: string;
  lon: string;
  display_name: string;
  type?: string;
  boundingbox?: string[];
  /** Present because we request `addressdetails=1` (the trip flow needs `address.country`). */
  address?: { country?: string; country_code?: string; [part: string]: string | undefined };
  [field: string]: unknown;
}
