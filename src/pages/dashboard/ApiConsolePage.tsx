import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, CheckCircle2, Copy, KeyRound, Plus, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { createApiKey, listApiKeys, revokeApiKey, type ApiKey, type CreatedApiKey } from "@/lib/api_cases";
import { logout } from "@/lib/auth";
import { useNavigate } from "react-router-dom";

function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  return <div className="doc-code"><button onClick={() => void copy()} aria-label="Copy code"><Copy size={14} /> {copied ? "Copied" : "Copy"}</button><pre>{children}</pre></div>;
}

export default function ApiConsolePage() {
  const navigate = useNavigate();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [company, setCompany] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const serverExample = useMemo(() => `const response = await fetch("https://YOUR-BACKEND/tickets", {
  method: "POST",
  headers: {
    "X-ArgusCX-Key": "<your API key>",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    customer_name: "Customer name",
    subject: "Damaged item",
    message: "Describe the issue and requested resolution.",
    category: "order_refund"
  })
});

if (!response.ok) throw new Error(await response.text());
const { ticket } = await response.json();`, []);

  const loadKeys = async () => {
    setLoading(true);
    setError("");
    try { setKeys(await listApiKeys()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load keys."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void loadKeys(); }, []);

  const handleCreateKey = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setError("");
    try {
      const result = await createApiKey(company, 60);
      setCreated(result);
      setCompany("");
      await loadKeys();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create a key.");
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (keyId: string) => {
    try { await revokeApiKey(keyId); await loadKeys(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to revoke the key."); }
  };

  const copy = async (value: string) => { await navigator.clipboard.writeText(value); };
  const signOut = async () => { await logout().catch(() => undefined); navigate("/login"); };

  return <div className="api-console">
    <header className="api-console-header">
      <div><p className="label">Developer platform</p><h1>API control plane</h1><p>Create least-privilege server credentials, then integrate the workflow your company actually needs.</p></div>
      <button className="btn-ghost" onClick={() => void signOut()}>Sign out</button>
    </header>

    {error && <div className="api-notice api-notice-error" role="alert">{error}</div>}

    <div className="api-console-grid">
      <section className="glass-card api-card">
        <div className="api-card-heading"><div><KeyRound size={16} /><h2>Create a key</h2></div></div>
        <form className="api-create-form" onSubmit={handleCreateKey}>
          <label>Company name<input className="input" value={company} onChange={(e) => setCompany(e.target.value)} required placeholder="Acme Corp" /></label>
          <button className="btn-primary" type="submit" disabled={creating}><Plus size={14} /> {creating ? "Creating…" : "Create key"}</button>
        </form>
        {created && <div className="api-secret">
          <ShieldCheck size={16} />
          <div className="secret-grid"><code>{created.api_key}</code><button className="icon-button" onClick={() => void copy(created.api_key)} aria-label="Copy key"><Copy size={14} /></button></div>
          <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>Save this now — it won&apos;t be shown again.</p>
        </div>}
      </section>

      <section className="glass-card api-card">
        <div className="api-card-heading"><div><CheckCircle2 size={16} /><h2>Active keys</h2></div></div>
        {loading ? <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading keys…</p> : keys.length === 0 ? <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No API keys yet.</p> : <div className="api-key-list">{keys.map((key) => <div key={key.key_id} className="api-key-row">
          <div><strong>{key.company_name}</strong><span>{key.key_prefix} · {key.usage_count} calls</span></div>
          <button className="btn-ghost" onClick={() => void revoke(key.key_id)} disabled={!key.is_active}><Trash2 size={14} /> {key.is_active ? "Revoke" : "Revoked"}</button>
        </div>)}</div>}
      </section>
    </div>

    <section className="glass-card api-docs">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><BookOpen size={18} /><h2>Send your first ticket</h2></div>
      <p>Use your key with the <code>X-ArgusCX-Key</code> header from a server, never from the browser.</p>
      <div className="doc-block">
        <h3>Server-side request</h3>
        <CodeBlock>{serverExample}</CodeBlock>
      </div>
      <p className="doc-foot"><RotateCcw size={12} style={{ verticalAlign: "middle" }} /> Rotate a key any time by revoking it and creating a new one.</p>
      <Link to="/dashboard/verify-new" className="btn-ghost" style={{ marginTop: 12, display: "inline-flex" }}>Create a verification session instead <ArrowRight size={14} /></Link>
    </section>
  </div>;
}
