export interface ITbMarketplaceApiKey {
  id?:            number;
  username:       string;
  api_key:        string;
  label:          string;
  is_public:      number;
  created_dt:     number;
  updated_dt?:    number | null;
  record_status:  string;
}
