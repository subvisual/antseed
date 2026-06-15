import { Interface, JsonRpcProvider, getAddress } from 'ethers'

// Chain ABIs + the one anchor address (AntseedDeposits) per chain. We do NOT
// import @antseed/node — it pulls native modules (better-sqlite3, node-datachannel)
// that can't run in the browser. Everything reducible is read from the smart
// contracts: the USDC token address from AntseedDeposits.usdc(), and the funding
// limits from the deposits getters. Only the deposits address itself is hardcoded
// — it's the irreducible anchor every other read starts from. (It mirrors
// packages/node payments/chain-config.ts; Deposits is a stable, rarely-redeployed
// contract, so it's a safe anchor — the registry is reachable via deposits.registry()
// if we ever need to follow redeploys.)

export type ChainId = 'base-mainnet' | 'base-sepolia'

export interface ChainInfo {
  chainId: ChainId
  evmChainId: number
  rpcUrl: string
  /** Anchor: AntseedDeposits. The USDC address is read from it on-chain. */
  depositsAddress: string
  /** MoonPay currency code for USDC on this network (e.g. "usdc_base"). */
  moonpayCurrencyCode: string
}

const CHAINS: Record<ChainId, ChainInfo> = {
  'base-mainnet': {
    chainId: 'base-mainnet',
    evmChainId: 8453,
    rpcUrl: 'https://base.publicnode.com',
    depositsAddress: '0x0F7a3a8f4Da01637d1202bb5443fcF7F88F99fD2',
    moonpayCurrencyCode: 'usdc_base',
  },
  'base-sepolia': {
    chainId: 'base-sepolia',
    evmChainId: 84532,
    rpcUrl: 'https://sepolia.base.org',
    depositsAddress: '0x96f083A9801AFdcE7D764651954A1A9Fbd489FEA',
    // MoonPay sandbox delivers the testnet build of usdc_base when the widget
    // runs with a pk_test_ key; the same currency code drives it.
    moonpayCurrencyCode: 'usdc_base',
  },
}

/** USDC has 6 decimals on Base. */
export const USDC_DECIMALS = 6

/**
 * Resolve the active chain from `VITE_ANTSEED_CHAIN`. Defaults to base-sepolia
 * — production must opt in to mainnet (real money) explicitly.
 */
export function activeChain(): ChainInfo {
  const id = import.meta.env['VITE_ANTSEED_CHAIN'] as ChainId | undefined
  return id && id in CHAINS ? CHAINS[id] : CHAINS['base-sepolia']
}

/** Read-only provider for the active chain. */
export function makeProvider(): JsonRpcProvider {
  return new JsonRpcProvider(activeChain().rpcUrl)
}

export const ERC20_IFACE = new Interface([
  'function balanceOf(address owner) view returns (uint256)',
])

// AntseedDeposits getters. `usdc` is public on the contract (see
// packages/contracts/AntseedDeposits.sol), so we read the token address from it
// rather than copy it. (The per-buyer credit-limit getters live here too; they'll
// come back to bound the amount once the deposit step lands — for now MoonPay's $20
// floor is the only bound, since we deliver straight to the address.)
export const DEPOSITS_IFACE = new Interface([
  'function usdc() view returns (address)',
])

// The USDC address is immutable per deposits contract, so cache it per chain after
// the first read instead of querying it on every balance poll.
let cachedUsdc: { chainId: ChainId; address: string } | null = null

/** Resolve the USDC token address from AntseedDeposits.usdc() (cached per chain). */
export async function resolveUsdcAddress(provider: JsonRpcProvider): Promise<string> {
  const chain = activeChain()
  if (cachedUsdc?.chainId === chain.chainId) return cachedUsdc.address
  const data = DEPOSITS_IFACE.encodeFunctionData('usdc', [])
  const raw = await provider.call({ to: chain.depositsAddress, data })
  const address = DEPOSITS_IFACE.decodeFunctionResult('usdc', raw)[0] as string
  cachedUsdc = { chainId: chain.chainId, address }
  return address
}

/** Read an address's on-chain USDC balance (USDC token resolved from the contract). */
export async function readUsdcBalance(
  provider: JsonRpcProvider,
  owner: string,
): Promise<bigint> {
  const usdc = await resolveUsdcAddress(provider)
  const data = ERC20_IFACE.encodeFunctionData('balanceOf', [getAddress(owner)])
  const raw = await provider.call({ to: usdc, data })
  return ERC20_IFACE.decodeFunctionResult('balanceOf', raw)[0] as bigint
}

/** EIP-7702 delegation designator in `eth_getCode`: `0xef0100 || <impl>`. */
const DELEGATION_PREFIX = '0xef0100'

/**
 * Whether the account has been EIP-7702-delegated — i.e. auto-deposit's one-time
 * wallet upgrade is live, so funds delivered here flow into the network on their
 * own. Pre-first-deposit the EOA has no code, so this reads false.
 */
export async function readDelegated(provider: JsonRpcProvider, owner: string): Promise<boolean> {
  const code = await provider.getCode(getAddress(owner))
  return code.toLowerCase().startsWith(DELEGATION_PREFIX)
}
