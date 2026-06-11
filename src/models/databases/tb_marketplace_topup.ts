export interface ITbMarketplaceTopup {
  id?:            number;
  username:       string;
  amount_cents:   number;
  payment_method: string;
  ref_id:         string;
  created_dt:     number;
  record_status:  string;
}
