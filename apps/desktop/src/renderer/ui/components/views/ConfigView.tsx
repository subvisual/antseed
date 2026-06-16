import { useState, useEffect, useCallback } from 'react';
import QRCode from 'react-qr-code';
import { Button } from '@antseed/ui';
import { useUiSnapshot } from '../../hooks/useUiSnapshot';
import { useActions } from '../../hooks/useActions';
import { ChatCopyButton } from '../chat/ChatCopyButton';

type ConfigViewProps = {
  active: boolean;
};

type VoiceModelStatus = {
  available: boolean;
  activeModel: string;
  error: string | null;
  models: Array<{ id: string; label: string; size: string; installed: boolean; selected: boolean; bundled: boolean }>;
};

function isVoiceModelStatus(value: unknown): value is VoiceModelStatus {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : null;
  return Boolean(record && Array.isArray(record.models));
}

type AutoDepositStatus = {
  enabled: boolean;
  delegated: boolean;
  state: string;
  looseBaseUnits: string;
  strandedBaseUnits: string;
  creditLimitBaseUnits: string;
  lastDeposit: { txHash: string; amountBaseUnits: string; at: string } | null;
  lastError: string | null;
  address: string | null;
};

function isAutoDepositStatus(value: unknown): value is AutoDepositStatus {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : null;
  return Boolean(record && typeof record.state === 'string' && typeof record.enabled === 'boolean');
}

function formatUsdc(baseUnits: string): string {
  return (Number(baseUnits) / 1_000_000).toFixed(2);
}

function chainLabel(chainId: string): string {
  if (chainId === 'base-mainnet') return 'Base';
  if (chainId === 'base-sepolia') return 'Base Sepolia';
  return chainId;
}

function autoDepositSummary(s: AutoDepositStatus): string {
  switch (s.state) {
    case 'needs_attention': return `Needs attention: ${s.lastError ?? 'see logs'}`;
    case 'backoff': return 'Retrying…';
    case 'pending': return 'Depositing…';
    case 'stranded': return `${formatUsdc(s.strandedBaseUnits)} USDC waiting (credit limit reached; deposits resume as it grows)`;
    case 'idle': return s.delegated ? 'Active' : 'Active. Your wallet upgrades on the first deposit';
    default: return 'Active';
  }
}

export function ConfigView({ active }: ConfigViewProps) {
  const { configFormData, configSaving, devMode, configMessage } = useUiSnapshot();
  const actions = useActions();

  // Local form state — initialized from config, edited locally, saved on button click
  const [proxyPort, setProxyPort] = useState('8377');
  const [minRep, setMinRep] = useState('0');
  const [chainId, setChainId] = useState('base-mainnet');
  const [dirty, setDirty] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceModelStatus | null>(null);
  const [voiceInstalling, setVoiceInstalling] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const [autoDeposit, setAutoDeposit] = useState<AutoDepositStatus | null>(null);
  const [autoDepositBusy, setAutoDepositBusy] = useState(false);
  const [autoDepositMessage, setAutoDepositMessage] = useState<string | null>(null);

  // Sync from config on first load only
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (configFormData && !initialized) {
      setProxyPort(String(configFormData.proxyPort));
      setMinRep(String(configFormData.minRep));
      setChainId(configFormData.cryptoChainId || 'base-mainnet');
      setInitialized(true);
    }
  }, [configFormData, initialized]);

  const markDirty = useCallback(() => setDirty(true), []);

  const refreshVoiceStatus = useCallback(async () => {
    const result = await window.antseedDesktop?.voiceGetStatus?.();
    if (isVoiceModelStatus(result)) setVoiceStatus(result);
  }, []);

  useEffect(() => {
    if (active) void refreshVoiceStatus();
  }, [active, refreshVoiceStatus]);

  const refreshAutoDeposit = useCallback(async () => {
    const result = await window.antseedDesktop?.apiTryProxyRequest?.({
      port: parseInt(proxyPort, 10) || 8377,
      path: '/_antseed/auto-deposit',
      method: 'GET', headers: {}, body: '',
    });
    if (!result?.ok) return;
    try {
      const data = JSON.parse(result.body) as { autoDeposit?: unknown };
      if (isAutoDepositStatus(data.autoDeposit)) setAutoDeposit(data.autoDeposit);
    } catch { /* ignore transient poll/parse errors */ }
  }, [proxyPort]);

  useEffect(() => {
    if (!active) return;
    void refreshAutoDeposit();
    const timer = setInterval(() => void refreshAutoDeposit(), 5000);
    return () => clearInterval(timer);
  }, [active, refreshAutoDeposit]);

  async function handleVoiceModelChange(modelId: string) {
    setVoiceMessage(null);
    const result = await window.antseedDesktop?.voiceSetModel?.(modelId) as { ok?: boolean; error?: string; status?: unknown } | undefined;
    if (!result?.ok) {
      setVoiceMessage(result?.error || 'Could not switch voice model.');
      return;
    }
    if (isVoiceModelStatus(result.status)) setVoiceStatus(result.status);
  }

  async function handleInstallBaseModel() {
    setVoiceInstalling(true);
    setVoiceMessage('Downloading Base multilingual (~142 MB)…');
    try {
      const result = await window.antseedDesktop?.voiceInstallModel?.('base') as { ok?: boolean; error?: string; status?: unknown } | undefined;
      if (!result?.ok) throw new Error(result?.error || 'Install failed.');
      if (isVoiceModelStatus(result.status)) setVoiceStatus(result.status);
      setVoiceMessage('Base multilingual installed and selected.');
    } catch (error) {
      setVoiceMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setVoiceInstalling(false);
    }
  }

  async function toggleAutoDeposit() {
    const next = !(autoDeposit?.enabled ?? false);
    setAutoDepositBusy(true);
    setAutoDepositMessage(null);
    try {
      const result = await window.antseedDesktop?.apiTryProxyRequest?.({
        port: parseInt(proxyPort, 10) || 8377,
        path: '/_antseed/auto-deposit',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      if (!result?.ok) throw new Error(result?.error || `Request failed (${result?.status ?? 0})`);
      const data = JSON.parse(result.body) as { ok?: boolean; error?: string };
      if (!data.ok) throw new Error(data.error || 'Request rejected');
      await refreshAutoDeposit();
    } catch (error) {
      setAutoDepositMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setAutoDepositBusy(false);
    }
  }

  // Toggles that auto-save (no restart needed)
  function toggleDevMode() {
    if (!configFormData) return;
    void actions.saveConfig({ ...configFormData, devMode: !devMode });
  }

  // Save all config and restart the buyer runtime
  async function handleSaveAndRestart() {
    if (!configFormData) return;
    await actions.saveConfig({
      ...configFormData,
      proxyPort: parseInt(proxyPort, 10) || 8377,
      peerRefreshIntervalMs: configFormData.peerRefreshIntervalMs,
      minRep: parseInt(minRep, 10) || 0,
      cryptoChainId: chainId,
    });
    setDirty(false);
    // Restart buyer runtime to pick up new config
    try {
      await actions.stopConnect();
    } catch { /* may not be running */ }
    try {
      await actions.startConnect();
    } catch { /* will auto-start on next request */ }
  }

  return (
    <section className={`view${active ? ' active' : ''}`} role="tabpanel">
      <div className="page-header">
        <h2>Settings</h2>
      </div>

      <div className="settings-sections">
        <article className="panel settings-panel">
          <div className="panel-head">
            <h3>Buyer Settings</h3>
          </div>
          <div className="settings-stack">
            <label className="settings-item">
              <div className="settings-copy">
                <h4>Proxy Port</h4>
                <p>Local port for service routing and chat requests.</p>
              </div>
              <input
                type="number"
                className="form-input settings-control"
                value={proxyPort}
                onChange={(e) => { setProxyPort(e.target.value); markDirty(); }}
              />
            </label>
            <label className="settings-item">
              <div className="settings-copy">
                <h4>Minimum Peer Reputation</h4>
                <p>Peers below this score are excluded from routing.</p>
              </div>
              <input
                type="number"
                className="form-input settings-control"
                min="0"
                max="100"
                value={minRep}
                onChange={(e) => { setMinRep(e.target.value); markDirty(); }}
              />
            </label>
          </div>

        <div className="settings-footer" />

          <div className="panel-head">
            <h3>Payment Settings</h3>
          </div>
          <div className="settings-stack">
            <label className="settings-item">
              <div className="settings-copy">
                <h4>Chain Environment</h4>
                <p>Settlement chain for payments. Contract addresses are resolved automatically.</p>
              </div>
              <select
                className="form-input settings-control"
                value={chainId}
                onChange={(e) => { setChainId(e.target.value); markDirty(); }}
              >
                <option value="base-mainnet">Base Mainnet</option>
                <option value="base-sepolia">Base Sepolia (testnet)</option>
                <option value="base-local">Base Local (development)</option>
              </select>
            </label>
          </div>

          <div className="settings-footer">
          {dirty && (
            <Button
              className="settings-save-btn"
              onClick={() => void handleSaveAndRestart()}
              disabled={configSaving}
            >
              {configSaving ? 'Saving...' : 'Save & Restart'}
            </Button>
          )}
          </div>
        </article>

        <article className="panel settings-panel">
          <div className="panel-head">
            <h3>Funding</h3>
          </div>
          <div className="settings-stack">
            <div className="settings-item">
              <div className="settings-copy">
                <h4>Auto-deposit</h4>
                <p>Automatically move USDC sent to your wallet into the network so it can buy services. Gas is paid in USDC, no ETH needed. Your wallet is upgraded once (EIP-7702) on the first deposit.</p>
              </div>
              <button
                type="button"
                className={`settings-switch${autoDeposit?.enabled ? ' is-on' : ''}`}
                aria-pressed={autoDeposit?.enabled ?? false}
                onClick={() => void toggleAutoDeposit()}
                disabled={autoDepositBusy}
              >
                <span className="settings-switch-track">
                  <span className="settings-switch-thumb" />
                </span>
                <span className="settings-switch-label">{autoDeposit?.enabled ? 'On' : 'Off'}</span>
              </button>
            </div>
            {autoDeposit?.enabled ? (
              autoDeposit.state === 'needs_attention'
                ? <p className="settings-message error">{autoDepositSummary(autoDeposit)}</p>
                : <p className="settings-note">{autoDepositSummary(autoDeposit)}</p>
            ) : null}
            {autoDeposit?.enabled && autoDeposit.address ? (
              <div className="settings-receive">
                <p className="settings-note">
                  Send USDC on {chainLabel(chainId)} to this address to fund your wallet. Only send USDC on {chainLabel(chainId)}; other tokens or chains may be lost.
                </p>
                <div className="settings-receive-address">
                  <span>{autoDeposit.address}</span>
                  <ChatCopyButton
                    className="settings-copy-button"
                    text={autoDeposit.address}
                    ariaLabel="Copy wallet address"
                    tooltipLabel="Copy address"
                    copiedTooltipLabel="Copied!"
                  />
                </div>
                <div className="settings-receive-qr">
                  <QRCode value={autoDeposit.address} size={160} bgColor="#ffffff" fgColor="#000000" />
                </div>
              </div>
            ) : null}
            {autoDepositMessage ? <p className="settings-note">{autoDepositMessage}</p> : null}
          </div>
        </article>

        <article className="panel settings-panel">
          <div className="panel-head">
            <h3>Desktop Preferences</h3>
          </div>
          <div className="settings-stack">
            <div className="settings-item">
              <div className="settings-copy">
                <h4>Developer Mode</h4>
                <p>Shows Connection, Peers, and Logs in the sidebar.</p>
              </div>
              <button
                type="button"
                className={`settings-switch${devMode ? ' is-on' : ''}`}
                aria-pressed={devMode}
                onClick={toggleDevMode}
                disabled={configSaving}
              >
                <span className="settings-switch-track">
                  <span className="settings-switch-thumb" />
                </span>
                <span className="settings-switch-label">{devMode ? 'On' : 'Off'}</span>
              </button>
            </div>
          </div>
        </article>

        <article className="panel settings-panel">
          <div className="panel-head">
            <h3>Voice Transcription</h3>
          </div>
          <div className="settings-stack">
            <label className="settings-item">
              <div className="settings-copy">
                <h4>Local Whisper model</h4>
                <p>Voice messages are transcribed locally. Tiny is bundled; Base is more accurate and downloads to this device.</p>
              </div>
              <select
                className="form-input settings-control"
                value={voiceStatus?.activeModel || 'tiny'}
                onChange={(e) => void handleVoiceModelChange(e.target.value)}
                disabled={!voiceStatus}
              >
                {(voiceStatus?.models || []).map((model) => (
                  <option key={model.id} value={model.id} disabled={!model.installed}>
                    {model.label} {model.size}{model.installed ? '' : ' — not installed'}
                  </option>
                ))}
              </select>
            </label>
            <div className="settings-item">
              <div className="settings-copy">
                <h4>Better accuracy</h4>
                <p>Install Base multilingual for improved transcription quality. It is about 142 MB.</p>
              </div>
              <Button
                className="settings-save-btn"
                onClick={() => void handleInstallBaseModel()}
                disabled={voiceInstalling || voiceStatus?.models.some((model) => model.id === 'base' && model.installed)}
              >
                {voiceInstalling ? 'Installing…' : voiceStatus?.models.some((model) => model.id === 'base' && model.installed) ? 'Installed' : 'Install Base'}
              </Button>
            </div>
            {voiceMessage ? <p className="settings-note">{voiceMessage}</p> : null}
            {voiceStatus?.error ? <p className="settings-message error">{voiceStatus.error}</p> : null}
          </div>
        </article>

        {configMessage ? (
            <p className={`settings-message ${configMessage.type}`}>
              {configMessage.text}
            </p>
          ) : null}

      </div>
    </section>
  );
}
