export interface ITB_TRAVEL_ITINERARY_BOOKING {
  id?: number;
  itinerary_id: number;
  category?: string;
  item: string;
  location?: string;
  link?: string;
  payment?: string;
  start_date?: string;
  end_date?: string;
  nights?: number;
  price?: number;
  booked?: number;           // tinyint 0/1
  free_cancellation?: string;
  breakfast?: number;        // tinyint 0/1
  deposit?: string;
  pax_breakdown?: string;    // JSON string
  sort_order?: number;
  created_dt: number;
  record_status: string;
}
