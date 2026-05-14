import { useState, useEffect, useCallback } from "react"
import { Save, Eye, EyeOff, Menu, RotateCcw, RefreshCw, CheckCircle, XCircle } from "lucide-react"
import { useStore } from "../store"
import type { ServerConfig } from "../types"

function Field({
  label, value, onChange, type = "text", placeholder, hint, mono,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  hint?: string
  mono?: boolean
}) {
  const [show, setShow] = useState(false)
  const isPass = type === "password"

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-text-2 uppercase tracking-wider">{label}</label>
      <div className="relative">
        <input
          type={isPass && !show ? "password" : "text"}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={[
            "w-full bg-bg-4 border border-border rounded-lg px-3 py-2.5 text-sm text-text",
            "placeholder:text-text-3 outline-none focus:border-border-2 transition-colors",
            mono ? "font-mono" : "",
            isPass ? "pr-9" : "",
          ].join(" ")}
        />
        {isPass && (
          <button
            type="button"
            onClick={() => setShow(v => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-3 hover:text-text-2 transition-colors"
          >
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>
      {hint && <p className="text-xs text-text-3">{hint}</p>}
    </div>
  )
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm text-text">{label}</p>
        {hint && <p className="text-xs text-text-3 mt-0.5">{hint}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={[
          "shrink-0 relative w-10 h-5.5 rounded-full transition-colors",
          checked ? "bg-accent" : "bg-bg-4 border border-border",
        ].join(" ")}
        style={{ minWidth: 40, height: 22 }}
      >
        <span
          className={[
            "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all",
            checked ? "left-[calc(100%-18px)]" : "left-0.5",
          ].join(" ")}
        />
      </button>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xs font-semibold text-text-3 uppercase tracking-widest">{title}</h2>
      <div className="bg-bg-3 border border-border rounded-xl p-4 space-y-4">
        {children}
      </div>
    </section>
  )
}

const BOOL_KEYS = new Set(["ENABLE_API", "ENABLE_TELEGRAM", "ENABLE_WHATSAPP", "API_ENABLE_AUTH"])

export function SettingsPage() {
  const { settings, setSettings, getClient, setSidebar } = useStore()

  // Client-side settings (localStorage)
  const [local, setLocal] = useState({ ...settings })

  // Server-side config (from .env)
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null)
  const [configLoading, setConfigLoading] = useState(false)
  const [configSaving, setConfigSaving] = useState(false)
  const [configError, setConfigError] = useState<string | null>(null)
  const [configSaved, setConfigSaved] = useState(false)
  const [clientSaved, setClientSaved] = useState(false)

  const client = getClient()

  const loadConfig = useCallback(async () => {
    setConfigLoading(true)
    setConfigError(null)
    try {
      const { config } = await client.getConfig()
      setServerConfig(config)
    } catch (e) {
      setConfigError(`Failed to load config: ${(e as Error).message}`)
    } finally {
      setConfigLoading(false)
    }
  }, [client])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  const updateClient = (key: keyof typeof local, val: string | boolean) =>
    setLocal(s => ({ ...s, [key]: val }))

  const saveClient = () => {
    setSettings(local)
    setClientSaved(true)
    setTimeout(() => setClientSaved(false), 2000)
  }

  const resetClient = () => setLocal({ ...settings })

  const updateServer = (key: string, val: string) => {
    setServerConfig(s => s ? { ...s, [key]: val } : s)
  }

  const saveServer = async () => {
    if (!serverConfig) return
    setConfigSaving(true)
    setConfigError(null)
    try {
      const updates: Record<string, string> = {}
      for (const [k, v] of Object.entries(serverConfig)) {
        if (k in serverConfig && v !== undefined) {
          updates[k] = String(v)
        }
      }
      await client.updateConfig(updates)
      setConfigSaved(true)
      setTimeout(() => setConfigSaved(false), 2000)
      await loadConfig()
    } catch (e) {
      setConfigError(`Failed to save config: ${(e as Error).message}`)
    } finally {
      setConfigSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => setSidebar(true)} className="lg:hidden p-2 rounded-lg text-text-2 hover:text-text hover:bg-bg-3 transition-colors">
            <Menu size={18} />
          </button>
          <span className="font-semibold text-text">Settings</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-6 max-w-2xl mx-auto w-full">
        <div className="space-y-6">

          {configError && (
            <div className="bg-red-900/20 border border-red-800/40 rounded-xl px-4 py-3 text-xs text-red-400">
              {configError}
            </div>
          )}

          {/* ── Channels ──────────────────────────────────────────────────── */}
          <Section title="Channels">
            <div className="space-y-2 text-xs text-text-2">
              <p>Edit these values and save to persist to <code className="text-accent">.env</code>. Restart required for changes to take effect.</p>
            </div>

            {configLoading ? (
              <div className="flex items-center gap-2 text-sm text-text-3 py-4">
                <RefreshCw size={14} className="animate-spin" />
                Loading config…
              </div>
            ) : serverConfig ? (
              <>
                {/* Telegram */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-text font-medium">Telegram</p>
                      {serverConfig.ENABLE_TELEGRAM === "true" ? (
                        <CheckCircle size={14} className="text-green-500 shrink-0" />
                      ) : (
                        <XCircle size={14} className="text-text-3 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-text-3 mt-0.5">Requires a bot token from @BotFather</p>
                  </div>
                  <Toggle
                    label=""
                    checked={serverConfig.ENABLE_TELEGRAM === "true"}
                    onChange={v => updateServer("ENABLE_TELEGRAM", v ? "true" : "false")}
                  />
                </div>
                {serverConfig.ENABLE_TELEGRAM === "true" && (
                  <Field
                    label="Bot Token"
                    value={serverConfig.TELEGRAM_BOT_TOKEN}
                    onChange={v => updateServer("TELEGRAM_BOT_TOKEN", v)}
                    type="password"
                    placeholder="TELEGRAM_BOT_TOKEN from .env"
                    mono
                  />
                )}

                <div className="border-t border-border/50" />

                {/* WhatsApp */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-text font-medium">WhatsApp</p>
                      {serverConfig.ENABLE_WHATSAPP === "true" ? (
                        <CheckCircle size={14} className="text-green-500 shrink-0" />
                      ) : (
                        <XCircle size={14} className="text-text-3 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-text-3 mt-0.5">QR-based auth via Baileys. Run setup to connect.</p>
                  </div>
                  <Toggle
                    label=""
                    checked={serverConfig.ENABLE_WHATSAPP === "true"}
                    onChange={v => updateServer("ENABLE_WHATSAPP", v ? "true" : "false")}
                  />
                </div>

                <div className="border-t border-border/50" />

                {/* API / Web UI */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-text font-medium">API / Web UI</p>
                      {serverConfig.ENABLE_API === "true" ? (
                        <CheckCircle size={14} className="text-green-500 shrink-0" />
                      ) : (
                        <XCircle size={14} className="text-text-3 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-text-3 mt-0.5">HTTP API and frontend on port {serverConfig.API_PORT}</p>
                  </div>
                  <Toggle
                    label=""
                    checked={serverConfig.ENABLE_API === "true"}
                    onChange={v => updateServer("ENABLE_API", v ? "true" : "false")}
                  />
                </div>
              </>
            ) : null}

            <div className="flex justify-end pt-2">
              <button
                onClick={saveServer}
                disabled={configLoading || configSaving || !serverConfig}
                className={[
                  "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  configSaved
                    ? "bg-green-600 text-white"
                    : "bg-accent text-bg hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed",
                ].join(" ")}
              >
                {configSaving ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                {configSaved ? "Saved to .env!" : "Save channel config"}
              </button>
            </div>
          </Section>

          {/* ── API Settings ────────────────────────────────────────────────── */}
          {serverConfig && (
            <Section title="API Settings">
              <Field
                label="Port"
                value={serverConfig.API_PORT}
                onChange={v => updateServer("API_PORT", v)}
                placeholder="3100"
                mono
              />
              <Field
                label="Hostname"
                value={serverConfig.API_HOSTNAME}
                onChange={v => updateServer("API_HOSTNAME", v)}
                placeholder="0.0.0.0"
                hint="0.0.0.0 for public, 127.0.0.1 for local-only"
                mono
              />
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-text">API Auth</p>
                  <p className="text-xs text-text-3 mt-0.5">Require Bearer token for API endpoints</p>
                </div>
                <Toggle
                  label=""
                  checked={serverConfig.API_ENABLE_AUTH === "true"}
                  onChange={v => updateServer("API_ENABLE_AUTH", v ? "true" : "false")}
                />
              </div>
              {serverConfig.API_ENABLE_AUTH === "true" && (
                <>
                  <Field
                    label="Admin Key"
                    value={serverConfig.API_ADMIN_KEY}
                    onChange={v => updateServer("API_ADMIN_KEY", v)}
                    type="password"
                    placeholder="API_ADMIN_KEY"
                    mono
                  />
                  <Field
                    label="Chat Key"
                    value={serverConfig.API_CHAT_KEY}
                    onChange={v => updateServer("API_CHAT_KEY", v)}
                    type="password"
                    placeholder="API_CHAT_KEY (defaults to Admin Key)"
                    mono
                  />
                </>
              )}
              <Field
                label="CORS Origin"
                value={serverConfig.API_CORS_ORIGIN}
                onChange={v => updateServer("API_CORS_ORIGIN", v)}
                placeholder="*"
                hint="Allowed origin. Set to your frontend URL in production."
                mono
              />
              <div className="flex justify-end pt-2">
                <button
                  onClick={saveServer}
                  disabled={configSaving}
                  className={[
                    "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    configSaved
                      ? "bg-green-600 text-white"
                      : "bg-accent text-bg hover:bg-accent/90 disabled:opacity-40",
                  ].join(" ")}
                >
                  {configSaving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                  {configSaved ? "Saved!" : "Save"}
                </button>
              </div>
            </Section>
          )}

          {/* ── Misc ────────────────────────────────────────────────────────── */}
          {serverConfig && (
            <Section title="Other">
              <Field
                label="Pair Token"
                value={serverConfig.WHITELIST_PAIR_TOKEN}
                onChange={v => updateServer("WHITELIST_PAIR_TOKEN", v)}
                type="password"
                placeholder="WHITELIST_PAIR_TOKEN"
                hint="Users can self-whitelist via /pair <token> in chat"
                mono
              />
              <Field
                label="Heartbeat Interval (minutes)"
                value={serverConfig.HEARTBEAT_INTERVAL_MINUTES}
                onChange={v => updateServer("HEARTBEAT_INTERVAL_MINUTES", v)}
                placeholder="30"
                mono
              />
              <Field
                label="Log Level"
                value={serverConfig.LOG_LEVEL}
                onChange={v => updateServer("LOG_LEVEL", v)}
                placeholder="info"
                hint="trace, debug, info, warn, error, fatal"
                mono
              />
              <div className="flex justify-end pt-2">
                <button
                  onClick={saveServer}
                  disabled={configSaving}
                  className={[
                    "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    configSaved
                      ? "bg-green-600 text-white"
                      : "bg-accent text-bg hover:bg-accent/90 disabled:opacity-40",
                  ].join(" ")}
                >
                  {configSaving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                  {configSaved ? "Saved!" : "Save"}
                </button>
              </div>
            </Section>
          )}

          {/* ── Client Settings (localStorage) ────────────────────────────── */}
          <Section title="Client Settings">
            <Field
              label="API Base URL"
              value={local.apiBase}
              onChange={v => updateClient("apiBase", v)}
              placeholder="http://localhost:3100 (empty = same origin)"
              hint="Leave empty when the frontend is served by the RadClaw server."
            />
            <Field
              label="Chat API Key"
              value={local.apiChatKey}
              onChange={v => updateClient("apiChatKey", v)}
              type="password"
              placeholder="API_CHAT_KEY from .env"
              hint="Required when API_ENABLE_AUTH=true."
            />
            <Field
              label="Admin API Key"
              value={local.apiAdminKey}
              onChange={v => updateClient("apiAdminKey", v)}
              type="password"
              placeholder="API_ADMIN_KEY from .env"
            />
            <Field
              label="User ID"
              value={local.userID}
              onChange={v => updateClient("userID", v)}
              placeholder="web:user"
              hint="Sent with every chat request. Used for session routing."
              mono
            />
            <Toggle
              label="Streaming mode"
              checked={local.streamMode}
              onChange={v => updateClient("streamMode", v)}
              hint="Uses SSE for word-by-word rendering. Disable for full-reply mode."
            />
            <div className="flex items-center gap-2 pt-2">
              <button onClick={resetClient} className="p-2 rounded-lg text-text-2 hover:text-text hover:bg-bg-4 border border-border transition-colors" title="Reset">
                <RotateCcw size={14} />
              </button>
              <button
                onClick={saveClient}
                className={[
                  "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  clientSaved
                    ? "bg-green-600 text-white"
                    : "bg-accent text-bg hover:bg-accent/90",
                ].join(" ")}
              >
                <Save size={14} />
                {clientSaved ? "Saved!" : "Save client settings"}
              </button>
            </div>
          </Section>

        </div>
      </div>
    </div>
  )
}
