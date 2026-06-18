import type { Command } from 'commander';
import chalk from 'chalk';
import { getGlobalOptions } from '../types.js';
import { loadConfig, saveConfig } from '../../../config/loader.js';
import { FUNDING_PLUGINS } from '../../../plugins/funding.js';

function availableNames(): string {
  return FUNDING_PLUGINS.map((plugin) => plugin.name).join(', ') || '(none)';
}

export function registerBuyerFundingCommands(buyerCmd: Command): void {
  buyerCmd
    .command('enable-funding <name>')
    .description(`Approve a funding plugin so it moves USDC into the network while the buyer proxy runs. Available: ${availableNames()}`)
    .action(async (name: string) => {
      const plugin = FUNDING_PLUGINS.find((candidate) => candidate.name === name);
      if (!plugin) {
        console.error(chalk.red(`Unknown funding plugin "${name}". Available: ${availableNames()}`));
        process.exit(1);
      }
      const globalOpts = getGlobalOptions(buyerCmd);
      const config = await loadConfig(globalOpts.config);
      config.buyer.funding = {
        ...(config.buyer.funding ?? {}),
        [name]: { enabled: true, approvedAt: new Date().toISOString() },
      };
      await saveConfig(globalOpts.config, config);

      console.log(chalk.green(`Funding "${name}" enabled.`));
      console.log(chalk.dim(plugin.description));
      console.log(chalk.dim('It runs only on networks that support it; otherwise it stays idle until you switch networks.'));
    });

  buyerCmd
    .command('disable-funding <name>')
    .description('Stop a funding plugin (consent only; any on-chain state, e.g. an EIP-7702 delegation, persists)')
    .action(async (name: string) => {
      const plugin = FUNDING_PLUGINS.find((candidate) => candidate.name === name);
      if (!plugin) {
        console.error(chalk.red(`Unknown funding plugin "${name}". Available: ${availableNames()}`));
        process.exit(1);
      }
      const globalOpts = getGlobalOptions(buyerCmd);
      const config = await loadConfig(globalOpts.config);
      config.buyer.funding = {
        ...(config.buyer.funding ?? {}),
        [name]: { enabled: false },
      };
      await saveConfig(globalOpts.config, config);

      console.log(chalk.green(`Funding "${name}" disabled.`));
    });
}
