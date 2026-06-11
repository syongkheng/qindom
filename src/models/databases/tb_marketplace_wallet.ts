export interface ITbMarketplaceWallet {
  id?:            number;
  username:       string;
  balance_cents:  number;
  currency:       string;
  created_dt:     number;
  updated_dt?:    number | null;
  record_status:  string;
}
