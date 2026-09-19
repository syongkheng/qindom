import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { GeocodeService } from "../geocode/Geocode.service.js";
import { SuggestionService } from "../suggestion/Suggestion.service.js";
import { ITB_PLACE_CACHE } from "../models/databases/tb_place_cache.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { toMessage } from "../utils/errorUtils.js";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const DEFAULT_RADIUS_M = 3000;
const CACHE_PRECISION = 3; // ~110m buckets — close-together lookups share a cache row

export interface PlaceSuggestion {
  id?: number; // present only for admin-curated rows — what the detail panel/admin edit link needs
  name: string;
  category: string;
  lat: number;
  lng: number;
  description?: string;
  images?: string[];
  source: "curated" | "overpass";
}

// Undocumented/best-effort — OSM tagging is community-curated and inconsistent.
// Maps raw `tourism`/`leisure`/`historic` tag values onto this app's existing
// suggestion category vocabulary (see tb_suggestion_activity seed data:
// attraction/entertainment/nature/dining/shopping/other). Expect to iterate
// on this after seeing real responses for a few destinations.
const OVERPASS_TAG_TO_CATEGORY: Record<string, string> = {
  attraction: "attraction",
  museum: "attraction",
  gallery: "attraction",
  artwork: "attraction",
  viewpoint: "nature",
  zoo: "nature",
  theme_park: "entertainment",
  park: "nature",
  garden: "nature",
};

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function mapCategory(tags: Record<string, string>): string {
  if (tags.tourism && OVERPASS_TAG_TO_CATEGORY[tags.tourism]) return OVERPASS_TAG_TO_CATEGORY[tags.tourism];
  if (tags.leisure && OVERPASS_TAG_TO_CATEGORY[tags.leisure]) return OVERPASS_TAG_TO_CATEGORY[tags.leisure];
  if (tags.historic) return "attraction";
  if (tags.tourism) return "attraction"; // any other tourism=* tag not explicitly mapped
  return "other";
}

function buildOverpassQuery(lat: number, lng: number, radiusM: number): string {
  const around = `around:${radiusM},${lat},${lng}`;
  const filters = [`["tourism"~"attraction|museum|viewpoint|gallery|zoo|theme_park|artwork"]`, `["leisure"~"park|garden"]`, `["historic"]`];
  const clauses = filters.flatMap((f) => [`node${f}(${around});`, `way${f}(${around});`]).join("\n  ");
  return `[out:json][timeout:15];\n(\n  ${clauses}\n);\nout center 60;`;
}

export class PlacesService {
  constructor(private readonly db: KnexSqlUtilities) {}

  // Resolves a free-text destination to coordinates via the existing
  // Geocode/Nominatim flow (no duplicate geocoding call), then looks up
  // nearby POIs. Returns [] (not an error) when the destination doesn't
  // geocode — the frontend shows an empty state, not an error toast.
  //
  // Merges in admin-curated places (tb_suggestion_place, matched by
  // destination_tag like activities) so an admin can attach a description
  // and images to a spot the live Overpass lookup can never provide —
  // curated entries win on exact-title collision (richer data), and aren't
  // affected by the Overpass response cache (so edits show up immediately).
  async findNearby(destination: string): Promise<PlaceSuggestion[]> {
    const [results, curated] = await Promise.all([
      new GeocodeService(this.db).search(destination),
      new SuggestionService(this.db).getPlacesByDestination(destination),
    ]);

    const curatedPlaces: PlaceSuggestion[] = curated.map((p) => ({
      id: p.id,
      name: p.title,
      category: p.category ?? "other",
      lat: Number(p.lat),
      lng: Number(p.lng),
      description: p.description ?? undefined,
      images: p.images_json ? (JSON.parse(p.images_json) as string[]) : undefined,
      source: "curated",
    }));

    const first = results[0] as { lat?: string; lon?: string } | undefined;
    if (!first?.lat || !first?.lon) return curatedPlaces;

    const overpassPlaces = await this.findNearbyByCoordinates(Number(first.lat), Number(first.lon));
    const curatedTitles = new Set(curatedPlaces.map((p) => p.name.toLowerCase()));
    const dedupedOverpass = overpassPlaces.filter((p) => !curatedTitles.has(p.name.toLowerCase()));

    return [...curatedPlaces, ...dedupedOverpass];
  }

  async findNearbyByCoordinates(lat: number, lng: number, radiusM = DEFAULT_RADIUS_M): Promise<PlaceSuggestion[]> {
    const latRounded = Number(lat.toFixed(CACHE_PRECISION));
    const lngRounded = Number(lng.toFixed(CACHE_PRECISION));

    const cached = await this.getCached(latRounded, lngRounded, radiusM);
    if (cached !== null) return cached;

    const results = await this.fetchOverpass(lat, lng, radiusM);
    await this.storeCache(latRounded, lngRounded, radiusM, results);
    return results;
  }

  private async getCached(latRounded: number, lngRounded: number, radiusM: number): Promise<PlaceSuggestion[] | null> {
    try {
      const rows = await this.db.find<ITB_PLACE_CACHE>(
        "tb_place_cache",
        { lat_rounded: latRounded, lng_rounded: lngRounded, radius_m: radiusM } as any,
        { limit: 1, orderBy: "created_dt", orderDirection: "desc" },
      );
      if (!rows.length) return null;
      LoggingUtilities.service.info("PlacesService.getCached", `Cache hit for (${latRounded}, ${lngRounded})`);
      return JSON.parse(rows[0].results_json) as PlaceSuggestion[];
    } catch (error) {
      LoggingUtilities.service.warn("PlacesService.getCached", `Cache read failed: ${toMessage(error)}`);
      return null;
    }
  }

  private async storeCache(latRounded: number, lngRounded: number, radiusM: number, results: PlaceSuggestion[]): Promise<void> {
    try {
      await this.db.insert<Partial<ITB_PLACE_CACHE>, ITB_PLACE_CACHE>("tb_place_cache", {
        lat_rounded: latRounded,
        lng_rounded: lngRounded,
        radius_m: radiusM,
        results_json: JSON.stringify(results),
        created_dt: Date.now(),
      });
    } catch (error) {
      LoggingUtilities.service.error("PlacesService.storeCache", `Cache write failed: ${toMessage(error)}`);
    }
  }

  private async fetchOverpass(lat: number, lng: number, radiusM: number): Promise<PlaceSuggestion[]> {
    const query = buildOverpassQuery(lat, lng, radiusM);
    LoggingUtilities.service.info("PlacesService.fetchOverpass", `[EXT-POST] ${OVERPASS_URL} around (${lat}, ${lng})`);

    let response: Response;
    try {
      response = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "User-Agent": "Awense/1.0 (contact@awense.com)",
        },
        body: `data=${encodeURIComponent(query)}`,
      });
    } catch (error) {
      LoggingUtilities.service.error("PlacesService.fetchOverpass", `Fetch failed: ${toMessage(error)}`);
      throw new Exceptions.ExternalRequest("Overpass API");
    }

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      LoggingUtilities.service.error(
        "PlacesService.fetchOverpass",
        `Overpass HTTP ${response.status}: ${bodyText.slice(0, 300)}`,
      );
      throw new Exceptions.ExternalRequest("Overpass API");
    }

    const body = (await response.json()) as { elements?: OverpassElement[] };
    const seen = new Set<string>();
    const places: PlaceSuggestion[] = [];

    for (const el of body.elements ?? []) {
      const name = el.tags?.name;
      if (!name) continue; // unnamed elements are useless as recommendation chips
      const placeLat = el.lat ?? el.center?.lat;
      const placeLng = el.lon ?? el.center?.lon;
      if (placeLat == null || placeLng == null) continue;
      const key = `${name}:${placeLat.toFixed(4)}:${placeLng.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      places.push({
        name,
        category: mapCategory(el.tags ?? {}),
        lat: placeLat,
        lng: placeLng,
        description: el.tags?.description,
        source: "overpass",
      });
    }

    return places;
  }
}
