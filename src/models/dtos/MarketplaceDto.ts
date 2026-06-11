export interface WalletDto {
  balance:   number;
  currency:  string;
  updatedAt: number | null;
}

export interface TopupDto {
  id:            number;
  amountCents:   number;
  paymentMethod: string;
  createdAt:     number;
}

export interface ApiKeyDto {
  apiKey:    string;
  label:     string;
  createdAt: number;
}

export interface SessionDto {
  sessionId:  string;
  modelId:    string;
  title:      string;
  createdAt:  number;
  updatedAt:  number | null;
}

export interface MessageDto {
  id:         string;
  sessionId:  string;
  role:       string;
  content:    string;
  tokensIn:   number;
  tokensOut:  number;
  createdAt:  number;
}

export interface ChatResultDto {
  sessionId:       string;
  reply:           string;
  tokensIn:        number;
  tokensOut:       number;
  costCents:       number;
  inputCostCents:  number;
  outputCostCents: number;
}

export interface ModelConfigPublicDto {
  modelId:              string;
  displayName:          string;
  provider:             string;
  providerColor:        string;
  inputPriceUsdMtok:    number;
  outputPriceUsdMtok:   number;
  contextWindow:        string;
  maxOutputTokens:      string;
  badge:                string | null;
  tags:                 string[];
  isActive:             boolean;
  sortOrder:            number;
}

export interface ModelConfigAdminDto extends ModelConfigPublicDto {
  createdAt:  number;
  updatedAt:  number | null;
  createdBy:  string;
}

export interface MarketplaceSettingsDto {
  exchangeRateUsdSgd: number;
  platformMarkupPct:  number;
}
