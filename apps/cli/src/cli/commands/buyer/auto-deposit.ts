import type { Command } from 'commander';
import chalk from 'chalk';
import { resolveChainConfig } from '@antseed/node';
import { getGlobalOptions } from '../types.js';
import { loadConfig, saveConfig } from '../../../config/loader.js';

export function registerBuyerAutoDepositCommands(buyerCmd: Command): void {
  buyerCmd
    .command('enable-auto-deposit')
    .description('Approve gasless auto-deposit: sweep wallet USDC into the deposits contract automatically, paying gas in USDC (upgrades your wallet via EIP-7702 on the first deposit)')
    .action(async () => {
      const globalOpts = getGlobalOptions(buyerCmd);
      const config = await loadConfig(globalOpts.config);
      const chain = resolveChainConfig(config.payments.crypto ?? {});
      if (!chain.autoDeposit) {
        console.error(chalk.red(`Gasless auto-deposit is not available on chain "${chain.chainId}".`));
        process.exit(1);
      }

      config.buyer.autoDeposit = { enabled: true, approvedAt: new Date().toISOString() };
      await saveConfig(globalOpts.config, config);

      console.log(chalk.green('Auto-deposit enabled.'));
      console.log(chalk.dim('USDC sent to your wallet will be deposited automatically while the buyer proxy runs.'));
      console.log(chalk.dim('Gas is paid in USDC; no ETH needed. Your wallet is upgraded once (EIP-7702) on the first deposit.'));
    });

  buyerCmd
    .command('disable-auto-deposit')
    .description('Stop gasless auto-deposit (your wallet stays EIP-7702-upgraded; this does not revoke the delegation)')
    .action(async () => {
      const globalOpts = getGlobalOptions(buyerCmd);
      const config = await loadConfig(globalOpts.config);
      config.buyer.autoDeposit = { enabled: false };
      await saveConfig(globalOpts.config, config);
      console.log(chalk.green('Auto-deposit disabled.'));
      console.log(chalk.dim('Your wallet remains upgraded (EIP-7702 delegation persists on-chain); only the auto-deposit loop is stopped.'));
    });
}
