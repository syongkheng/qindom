/** Saved layout without its (up to 1 MB) body. */
export interface HouseLayoutSummaryDto {
  /** The layout's uuid. */
  id: string;
  name: string;
  itemCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface HouseLayoutDto extends HouseLayoutSummaryDto {
  /** The planner's export JSON (`HouseLayoutData`), as last saved. */
  data: unknown;
}

export interface HouseLayoutListDto {
  layouts: HouseLayoutSummaryDto[];
}

export interface HouseShareSummaryDto {
  /** Unguessable random UUID; the public link is `/house/view/<token>`. */
  token: string;
  name: string;
  itemCount: number;
  createdAt: number;
}

export interface HouseShareListDto {
  shares: HouseShareSummaryDto[];
}

/** Public view of one share: never includes who made it. */
export interface HouseShareViewDto {
  name: string;
  createdAt: number;
  data: unknown;
}

export interface HouseDeletedDto {
  deleted: true;
}

/** What the server stores from the planner export. Only the envelope is checked; the client re-sanitises on load. */
export interface HouseLayoutData {
  version: number;
  plan?: string;
  items: unknown[];
  custom: unknown[];
  walls?: unknown[];
}

/** Validated `{ name, data }` body, shared by layouts and share links. `dataJson` is the stored string. */
export interface HouseLayoutBody {
  name: string;
  dataJson: string;
  itemCount: number;
}

/** Update needs at least one of name / data. */
export type HouseLayoutUpdateBody = Partial<HouseLayoutBody>;
