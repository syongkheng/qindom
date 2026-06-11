export interface ITbMarketplaceSession {
  id:             string;
  username:       string;
  model_id:       string;
  title:          string;
  created_dt:     number;
  updated_dt?:    number | null;
  record_status:  string;
}
