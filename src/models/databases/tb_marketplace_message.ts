export interface ITbMarketplaceMessage {
  id:             string;
  session_id:     string;
  role:           string;
  content:        string;
  tokens_in:      number;
  tokens_out:     number;
  cost_cents:     number;
  created_dt:     number;
  record_status:  string;
}
