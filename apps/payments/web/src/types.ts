export interface BalanceData {
  evmAddress: string;
  available: string;
  reserved: string;
  total: string;
  creditLimit: string;
}

export interface PaymentConfig {
  chainId: string;
  evmChainId: number;
  rpcUrl: string;
  depositsContractAddress: string;
  channelsContractAddress: string;
  usdcContractAddress: string;
  emissionsContractAddress: string | null;
  antsTokenAddress: string | null;
  networkStatsUrl: string | null;
  evmAddress: string | null;
  onramp: OnrampConfig | null;
}

export interface MoonPayOnrampConfig {
  pk: string;
  baseUrl: string;
  currencyCode: string;
}

export interface OnrampConfig {
  moonpay?: MoonPayOnrampConfig;
}
