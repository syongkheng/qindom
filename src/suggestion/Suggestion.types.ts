export interface PackingSuggestionDto {
  id: number;
  tripType: string;
  label: string;
  /** i18n key fndom translates instead of `label` when present. */
  labelKey: string | null;
  category: string | null;
}

export interface NoteSuggestionDto {
  id: number;
  country: string;
  title: string;
  url: string;
  category: string | null;
  mandatory: boolean;
  /** "Apply within N days of arrival" (e.g. visa). */
  minDaysBeforeArrival: number | null;
  /** "Submit at most N hours before landing" (e.g. arrival card). */
  maxAdvanceHours: number | null;
  notes: string | null;
}

export interface SuggestionDeletedDto {
  deleted: true;
}

export interface PackingSuggestionBody {
  tripType: string;
  label: string;
  labelKey: string | null;
  category: string | null;
}

export interface NoteSuggestionBody {
  country: string;
  title: string;
  url: string;
  category: string | null;
  mandatory: boolean;
  minDaysBeforeArrival: number | null;
  maxAdvanceHours: number | null;
  notes: string | null;
}
