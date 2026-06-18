export { GaslessDepositsClient, type GaslessDepositsConfig, type GaslessDepositResult } from './gasless-deposits-client.js';
export { isDelegationCode, delegationTarget, encodeCirclePaymasterData } from './codec.js';
export { AutoDepositManager, planDeposit, isDeterministicError } from './manager.js';
export type {
  AutoDepositState, AutoDepositStatus, AutoDepositReader, AutoDepositExecutor,
  AutoDepositManagerConfig, AutoDepositConsentView, DepositPlan,
} from './manager.js';
export {
  createAutoDepositManager,
  createAutoDepositFundingService,
  gaslessConfigFromChain,
  toFundingStatus,
} from './factory.js';
export { AUTO_DEPOSIT_CHAINS, type AutoDepositChainConfig } from './chains.js';
export type {
  AntseedFundingPlugin,
  FundingHost,
  FundingService,
  FundingStatus,
  FundingChainContext,
} from './funding-plugin.js';
export { autoDepositPlugin } from './plugin.js';
