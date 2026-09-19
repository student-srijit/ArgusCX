import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Database, Mail, Pencil, ShieldCheck, Sparkles } from "lucide-react";
import { fetchMe, type MeResponse } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

type Readiness = { ready: boolean; database: string };

export default function ProfilePage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchMe()
      .then((data) => { if (active) setMe(data); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load your profile."); })
      .finally(() => { if (active) setLoading(false); });
    void supabase.functions.invoke<Readiness>("arguscx-readiness").then(({ data }) => { if (active) setReadiness(data ?? null); }).catch(() => { if (active) setReadiness(null); });
    return () => { active = false; };
  }, []);

  if (loading) return <p style={{ color: "var(--text-secondary)" }}>Loading profile…</p>;

  return (
    <section style={{ maxWidth: 760, paddingBottom: 48 }}>
      <p className="label">Workspace</p>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>Profile</h1>
      <p style={{ color: "var(--text-secondary)" }}>Your authenticated identity and workspace configuration.</p>

      {error && <div className="api-notice api-notice-error" role="alert" style={{ marginTop: 18 }}>{error}</div>}

      {me && (
        <div style={{ display: "grid", gap: 16, marginTop: 22 }}>
          <div className="glass-card" style={{ padding: 22, display: "flex", gap: 16, alignItems: "flex-start" }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Mail size={18} color="var(--accent)" />
            </div>
            <div>
              <p className="label">Signed in as</p>
              <h2 style={{ fontSize: 18, margin: "4px 0" }}>{me.email}</h2>
              <p style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{me.sub}</p>
            </div>
          </div>

          <div className="glass-card" style={{ padding: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <Building2 size={18} color="var(--accent)" style={{ marginTop: 2 }} />
                <div>
                  <p className="label">Company</p>
                  {me.onboarding_complete ? (
                    <>
                      <h2 style={{ fontSize: 18, margin: "4px 0" }}>{me.company_name}</h2>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginTop: 10, fontSize: 13 }}>
                        <div><span style={{ color: "var(--text-muted)" }}>Industry</span><div>{me.industry ?? "—"}</div></div>
                        <div><span style={{ color: "var(--text-muted)" }}>Company size</span><div>{me.company_size ?? "—"}</div></div>
                        <div><span style={{ color: "var(--text-muted)" }}>Primary use case</span><div>{me.use_case ?? "—"}</div></div>
                      </div>
                    </>
                  ) : (
                    <p style={{ color: "var(--text-muted)", marginTop: 6 }}>Onboarding has not been completed yet.</p>
                  )}
                </div>
              </div>
              <Link to="/onboarding?edit=true" className="btn-ghost" style={{ fontSize: 12, flexShrink: 0 }}><Pencil size={13} /> Edit</Link>
            </div>
          </div>

          <div className="glass-card" style={{ padding: 22, display: "flex", gap: 16, alignItems: "flex-start" }}>
            <Database size={18} color={readiness?.ready ? "var(--success)" : "var(--danger)"} style={{ marginTop: 2 }} />
            <div>
              <p className="label">Infrastructure readiness</p>
              <h2 style={{ fontSize: 16, margin: "4px 0", color: readiness?.ready ? "var(--success)" : "var(--danger)" }}>
                {readiness ? (readiness.ready ? "Database connected" : "Database unavailable") : "Checking…"}
              </h2>
              {readiness && <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{readiness.database}</p>}
            </div>
          </div>

          <div className="glass-card" style={{ padding: 22, display: "flex", gap: 16, alignItems: "flex-start" }}>
            <ShieldCheck size={18} color="var(--accent)" style={{ marginTop: 2 }} />
            <div>
              <p className="label">Access</p>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0" }}>Single-admin workspace — sign-in is limited to the configured workspace owner via Firebase Google or password credentials.</p>
            </div>
          </div>

          <Link to="/dashboard/api" className="glass-card" style={{ padding: 22, display: "flex", gap: 16, alignItems: "center", textDecoration: "none" }}>
            <Sparkles size={18} color="var(--accent)" />
            <div><h2 style={{ fontSize: 15, margin: 0, color: "var(--text-primary)" }}>Manage API credentials</h2><p style={{ fontSize: 12, color: "var(--text-muted)", margin: "2px 0 0" }}>Create or revoke server-side keys for integrations.</p></div>
          </Link>
        </div>
      )}
    </section>
  );
}
