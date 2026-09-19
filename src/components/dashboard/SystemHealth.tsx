import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Readiness = { ready: boolean; database: string };

export default function SystemHealth() {
  const [health, setHealth] = useState<Readiness | null>(null);
  useEffect(() => {
    const load = () => void supabase.functions.invoke<Readiness>("arguscx-readiness")
      .then(({ data }) => setHealth(data ?? null))
      .catch(() => setHealth(null));
    load(); const timer = window.setInterval(load, 30000); return () => window.clearInterval(timer);
  }, []);
  const unavailable = !health || !health.ready;
  const label = unavailable ? "Database unavailable" : "Database connected";
  return <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 8 }} title={health ? `database: ${health.database}` : label}>
    <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: unavailable ? "var(--danger)" : "var(--success)", boxShadow: "0 0 8px rgba(103,214,163,0.4)" }} />
    <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>{label}</span>
  </div>;
}
