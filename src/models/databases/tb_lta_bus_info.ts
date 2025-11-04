export interface ITB_LTA_BUS_INFO {
  id?: number;
  service_no: string;
  operator: string;
  direction: string;
  stop_sequence: string;
  busstop_code: string;
  distance: string;
  wd_first_bus: string;
  wd_last_bus: string;
  sat_first_bus: string;
  sat_last_bus: string;
  sun_first_bus: string;
  sun_last_bus: string;
  created_dt: number;
  created_by: string;
}
