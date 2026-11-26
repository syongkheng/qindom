/** Seeded from LTA DataMall; every data column is a nullable VARCHAR. */
export interface ITB_LTA_BUS_INFO {
  id?: number;
  service_no: string | null;
  operator: string | null;
  direction: string | null;
  stop_sequence: string | null;
  busstop_code: string | null;
  distance: string | null;
  wd_first_bus: string | null;
  wd_last_bus: string | null;
  sat_first_bus: string | null;
  sat_last_bus: string | null;
  sun_first_bus: string | null;
  sun_last_bus: string | null;
  created_dt: number;
  created_by: string;
}
