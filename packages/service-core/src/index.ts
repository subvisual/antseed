/**
 * Generic contract for Antseed host-driven service plugins.
 *
 * A service plugin runs a start/stop background lifecycle on the buyer's behalf
 * (e.g. the gasless auto-deposit funder). The host supplies consent and a
 * logger; capability-bearing hosts (e.g. a wallet-backed funding host) extend
 * {@link ServiceHost}. This is deliberately separate from the protocol plugin
 * system (provider/router in @antseed/node): those are installable third-party
 * packages that handle requests, whereas service plugins are bundled, trusted,
 * and driven by a host that may hold sensitive capabilities like a wallet key.
 */

/** Serializable, mechanism-agnostic status a client (e.g. the desktop) renders. */
export interface ServiceStatus {
  enabled: boolean;
  /** True when the service is paused on a deterministic failure; drives error styling. */
  attention: boolean;
  /** Human-readable status line. */
  summary: string;
  /** Optional address the user can fund; present => UI shows copy + QR. */
  receiveAddress?: string | null;
}

/** Baseline context every service gets. Specific services extend this with the
 * capabilities they need (e.g. a wallet key + chain). */
export interface ServiceHost {
  consent: { isEnabled(): boolean };
  onAttention?(message: string): void;
}

export interface Service {
  start(): void;
  stop(): void;
  getStatus(): ServiceStatus;
  /** Optional: trigger an immediate evaluation, e.g. right after consent is enabled. */
  poke?(): void | Promise<void>;
}

export interface AntseedServicePlugin<THost extends ServiceHost = ServiceHost> {
  /** Discriminates the family of service (e.g. "funding"). */
  kind: string;
  name: string;
  displayName: string;
  version: string;
  description: string;
  createService(host: THost): Service | null | Promise<Service | null>;
}
