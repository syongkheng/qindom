export interface ITB_WEDDING_GUEST {
  id?: number;
  name: string;              // VARCHAR 128
  guest_group: string;       // bride | groom | mutual
  rsvp: string;             // pending | accepted | declined
  plus_one: number;         // TINYINT 0|1
  dietary_notes: string | null;
  table_id: number | null;
  seat_number: number | null;
  created_by: string;
  created_dt: number;
  record_status: string;
}
