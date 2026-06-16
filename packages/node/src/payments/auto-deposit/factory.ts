import { getAddress, type Hex } from 'viem';
import type { ChainConfig } from '../chain-config.js';
import { GaslessDepositsClient, type GaslessDepositsConfig } from './gasless-deposits-client.js';
import {
  AutoDepositManager,
  type AutoDepositConsentView,
  type AutoDepositManagerConfig,
  type AutoDepositReader,
  type AutoDepositExecutor,
} from './manager.js';

export function gaslessConfigFromChain(chain: ChainConfig): GaslessDepositsConfig | null {
  if (!chain.autoDeposit) return null;
  return {
    evmChainId: chain.evmChainId,
    rpcUrl: chain.rpcUrl,
    bundlerUrl: chain.autoDeposit.bundlerUrl,
    usdcAddress: getAddress(chain.usdcContractAddress),
    paymasterAddress: getAddress(chain.autoDeposit.paymasterAddress),
    depositsAddress: getAddress(chain.depositsContractAddress),
    delegateAddress: getAddress(chain.autoDeposit.delegateAddress),
    entryPointAddress: getAddress(chain.autoDeposit.entryPointAddress),
  };
}

/**
 * Build an {@link AutoDepositManager} wired to a gasless executor for the given
 * chain, or null when the chain is not gasless-capable. A single
 * {@link GaslessDepositsClient} serves as both the balance reader and the
 * deposit executor.
 */
export function createAutoDepositManager(opts: {
  chain: ChainConfig;
  privateKey: Hex;
  consent: AutoDepositConsentView;
  config?: AutoDepositManagerConfig;
  onAttention?: (message: string) => void;
}): AutoDepositManager | null {
  const gaslessConfig = gaslessConfigFromChain(opts.chain);
  if (!gaslessConfig) return null;

  const client = new GaslessDepositsClient(opts.privateKey, gaslessConfig);
  const reader: AutoDepositReader = {
    looseUsdc: () => client.usdcBalance(),
    totalDeposited: async () => {
      const { available, reserved } = await client.buyerBalance();
      return available + reserved;
    },
    creditLimit: () => client.creditLimit(),
    isDelegated: () => client.isDelegated(),
  };
  const executor: AutoDepositExecutor = {
    deposit: async (amount) => {
      const { txHash } = await client.deposit(amount);
      return { txHash };
    },
  };
  return new AutoDepositManager({ reader, executor, consent: opts.consent, config: opts.config, onAttention: opts.onAttention });
}
