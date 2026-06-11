export interface ITbMarketplaceModelConfig {
  model_id:              string;
  display_name:          string;
  provider:              string;
  provider_color:        string;
  input_price_display:   string;
  output_price_display:  string;
  input_price_usd_mtok:  number;
  output_price_usd_mtok: number;
  input_cents_per_k:     number;
  output_cents_per_k:    number;
  context_window:        string;
  max_output_tokens:     string;
  badge?:                string | null;
  tags:                  string;   // JSON string[]
  is_active:             number;   // TINYINT — 0 or 1
  is_public:             number;   // TINYINT — 1 = accessible via public trial key
  sort_order:            number;
  created_dt:            number;
  updated_dt?:           number | null;
  created_by:            string;
  record_status:         string;
}
