export interface ITb_suggestion_place {
  id: number;
  destination_tag: string;
  title: string;
  category: string | null;
  description: string | null;
  images_json: string | null; // JSON.stringify of string[] image URLs
  lat: number;
  lng: number;
  record_status: "A" | "D";
  created_dt: number;
}
