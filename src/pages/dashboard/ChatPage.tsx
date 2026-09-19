import { useRef, useState } from "react";
import { submitTicket, uploadEvidenceFile, type EvidenceFile, type TicketResponse } from "@/lib/api_tickets";

const AGENT_STEPS = [
  { key: "information_retrieval", label: "Info Retrieval", icon: "IR", desc: "Searching policies & FAQs" },
  { key: "data_investigation", label: "Data Investigation", icon: "DI", desc: "Fetching order & payment data" },
  { key: "evidence_verification", label: "Fraud Verification", icon: "EV", desc: "EXIF · compression · C2PA check" },
  { key: "resolution", label: "Resolution Engine", icon: "RE", desc: "Applying policy rules" },
  { key: "escalation", label: "Escalation / Resolve", icon: "ES", desc: "Building case file or resolving" },
];

type AgentStepStatus = "idle" | "running" | "done" | "skip";

function AgentPipelineUI({ stepStatuses }: { stepStatuses: AgentStepStatus[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {AGENT_STEPS.map((step, i) => {
        const status = stepStatuses[i] ?? "idle";
        let borderColor = "var(--border)", bg = "rgba(15,23,42,0.4)", iconBg = "rgba(15,23,42,0.6)", labelColor = "var(--text-muted)";
        if (status === "running") { borderColor = "var(--accent)"; bg = "rgba(14,165,233,0.08)"; iconBg = "rgba(14,165,233,0.15)"; labelColor = "var(--accent)"; }
        else if (status === "done") { borderColor = "rgba(16,185,129,0.4)"; bg = "rgba(16,185,129,0.05)"; iconBg = "rgba(16,185,129,0.12)"; labelColor = "#34d399"; }
        return (
          <div key={step.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 10, border: `1px solid ${borderColor}`, background: bg, transition: "all 0.35s ease" }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{step.icon}</div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: labelColor }}>{step.label}</p>
              <p style={{ fontSize: 11, color: "var(--text-muted)" }}>{step.desc}</p>
            </div>
            <div>
              {status === "running" && <div className="spinner" />}
              {status === "done" && <span className="badge badge-success" style={{ fontSize: 10 }}>Done</span>}
              {status === "idle" && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Waiting</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TicketResult({ result }: { result: TicketResponse }) {
  const { ticket } = result;
  const isEscalated = ticket.status === "escalated";
  const isFraud = ticket.status === "fraud_flagged";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="glass-card" style={{ padding: "20px 24px", border: `1px solid ${isFraud ? "rgba(239,68,68,0.4)" : "rgba(245,158,11,0.4)"}`, background: isFraud ? "rgba(239,68,68,0.05)" : "rgba(245,158,11,0.05)" }}>
        <p style={{ fontWeight: 800, fontSize: 16, color: "var(--text-primary)" }}>{isFraud ? "Fraud Signals Detected — Escalated" : "Escalated for Human Review"}</p>
        <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>Processed in {result.processing_time_ms}ms · Case #{ticket.id.slice(0, 8).toUpperCase()}</p>
        {ticket.resolution_message && <div style={{ background: "rgba(15,23,42,0.5)", borderRadius: 10, padding: "12px 16px", fontSize: 14, color: "var(--text-primary)", marginTop: 10, border: "1px solid var(--border)" }}>{ticket.resolution_message}</div>}
      </div>

      <div className="glass-card" style={{ padding: "16px 20px" }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Decision Scores</h3>
        <div style={{ display: "flex", gap: 20 }}>
          {[
            { label: "Confidence", value: ticket.confidence_score, color: "var(--accent)" },
            { label: "Risk Score", value: ticket.risk_score, color: ticket.risk_score > 0.6 ? "var(--danger)" : "var(--success)" },
            { label: "Fraud Score", value: ticket.fraud_analysis?.fraud_score ?? 0, color: (ticket.fraud_analysis?.fraud_score ?? 0) > 0.6 ? "var(--danger)" : "var(--success)" },
          ].map((s) => (
            <div key={s.label} style={{ flex: 1 }}>
              <p className="label">{s.label}</p>
              <p style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{Math.round(s.value * 100)}%</p>
              <div className="progress-bar" style={{ marginTop: 4 }}><div className="progress-fill" style={{ width: `${s.value * 100}%`, background: s.color }} /></div>
            </div>
          ))}
        </div>
      </div>

      {ticket.fraud_analysis && (
        <div className="glass-card" style={{ padding: "16px 20px" }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Evidence Verification</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {Object.entries(ticket.fraud_analysis.analysis_details).map(([k, v]) => (
              <div key={k} style={{ fontSize: 12, padding: "6px 10px", background: "rgba(15,23,42,0.5)", borderRadius: 8 }}>
                <span style={{ color: "var(--text-muted)", textTransform: "uppercase", fontSize: 10, fontWeight: 600 }}>{k.replace(/_/g, " ")}</span><br />
                <span style={{ color: v.startsWith("PASS") ? "var(--success)" : v.startsWith("FAIL") ? "var(--danger)" : v.startsWith("WARN") ? "var(--warning)" : "var(--text-secondary)" }}>{v}</span>
              </div>
            ))}
          </div>
          {ticket.fraud_analysis.manipulation_indicators.length > 0 && (
            <div style={{ marginTop: 10 }}><p className="label">Manipulation Indicators</p>{ticket.fraud_analysis.manipulation_indicators.map((ind) => <div key={ind} style={{ fontSize: 12, color: "var(--warning)", padding: "4px 0" }}>{ind}</div>)}</div>
          )}
        </div>
      )}

      <div className="glass-card" style={{ padding: "16px 20px" }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Agent Reasoning Chain</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ticket.agent_steps.map((step, i) => (
            <div key={i} style={{ display: "flex", gap: 10, fontSize: 12, padding: "8px 10px", background: "rgba(15,23,42,0.4)", borderRadius: 8 }}>
              <span style={{ color: "var(--accent)", fontWeight: 700, minWidth: 20 }}>{i + 1}.</span>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{step.agent_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>
                {" · "}<span style={{ color: "var(--text-muted)" }}>{step.duration_ms}ms · {Math.round(step.confidence * 100)}% conf</span>
                {step.reasoning && <p style={{ color: "var(--text-secondary)", marginTop: 3, lineHeight: 1.5 }}>{step.reasoning}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const [form, setForm] = useState({ customer_name: "", customer_email: "", subject: "", message: "", category: "order_refund", previous_fraud_flags: 0, previous_tickets: 0 });
  const [evidenceFiles, setEvidenceFiles] = useState<EvidenceFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [stepStatuses, setStepStatuses] = useState<AgentStepStatus[]>(AGENT_STEPS.map(() => "idle"));
  const [result, setResult] = useState<TicketResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function setField(k: string, v: string | number) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleFiles(files: File[]) {
    if (!files.length) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(files.map(uploadEvidenceFile));
      setEvidenceFiles((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setError(`File upload failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setUploading(false); }
  }

  async function animateSteps(durationsMs: number[]) {
    const steps: AgentStepStatus[] = AGENT_STEPS.map(() => "idle");
    for (let i = 0; i < steps.length; i++) {
      steps[i] = "running";
      setStepStatuses([...steps]);
      await new Promise((r) => setTimeout(r, durationsMs[i]));
      steps[i] = "done";
      setStepStatuses([...steps]);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.customer_name || !form.subject || !form.message) { setError("Name, subject and message are required."); return; }
    setError(null); setResult(null); setProcessing(true);
    setStepStatuses(AGENT_STEPS.map(() => "idle"));

    const [res] = await Promise.all([
      submitTicket({
        customer_name: form.customer_name,
        customer_email: form.customer_email || undefined,
        subject: form.subject,
        message: form.message,
        category: form.category,
        previous_fraud_flags: Number(form.previous_fraud_flags),
        previous_tickets: Number(form.previous_tickets),
        evidence_files: evidenceFiles,
      }).catch((err) => { setError(err instanceof Error ? err.message : String(err)); return null; }),
      animateSteps([500, 600, evidenceFiles.length ? 800 : 300, 500, 400]),
    ]);

    setProcessing(false);
    if (res) setResult(res);
  }

  function handleReset() {
    setResult(null);
    setForm({ customer_name: "", customer_email: "", subject: "", message: "", category: "order_refund", previous_fraud_flags: 0, previous_tickets: 0 });
    setEvidenceFiles([]);
    setStepStatuses(AGENT_STEPS.map(() => "idle"));
    setError(null);
  }

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)" }}>Submit Support Ticket</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 4 }}>Watch all 5 agents investigate your ticket in real time</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20, alignItems: "start" }}>
        {!result ? (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="glass-card" style={{ padding: "20px 24px" }}>
              <h2 style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Customer Details</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div><p className="label">Full Name *</p><input className="input" placeholder="Priya Sharma" value={form.customer_name} onChange={(e) => setField("customer_name", e.target.value)} /></div>
                <div><p className="label">Email</p><input className="input" type="email" placeholder="priya@example.com" value={form.customer_email} onChange={(e) => setField("customer_email", e.target.value)} /></div>
                <div>
                  <p className="label">Previous Fraud Flags</p>
                  <select className="select" value={form.previous_fraud_flags} onChange={(e) => setField("previous_fraud_flags", Number(e.target.value))}>
                    <option value={0}>0 — Clean account</option>
                    <option value={1}>1 — One flag</option>
                    <option value={2}>2 — Multiple flags</option>
                  </select>
                </div>
                <div>
                  <p className="label">Category</p>
                  <select className="select" value={form.category} onChange={(e) => setField("category", e.target.value)}>
                    <option value="order_refund">Order / Refund</option>
                    <option value="billing_payment">Billing / Payment</option>
                    <option value="technical">Technical Issue</option>
                    <option value="account">Account / Security</option>
                    <option value="general">General</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="glass-card" style={{ padding: "20px 24px" }}>
              <h2 style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Issue Details</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div><p className="label">Subject *</p><input className="input" placeholder="My earbuds arrived damaged" value={form.subject} onChange={(e) => setField("subject", e.target.value)} /></div>
                <div><p className="label">Message *</p><textarea className="textarea" placeholder="Describe your issue in detail..." value={form.message} onChange={(e) => setField("message", e.target.value)} style={{ minHeight: 120 }} /></div>
              </div>
            </div>

            <div className="glass-card" style={{ padding: "20px 24px" }}>
              <h2 style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Evidence Upload<span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400, marginLeft: 8 }}>optional — triggers live forensic analysis</span></h2>
              <div
                style={{ border: "2px dashed var(--border-accent)", borderRadius: 12, padding: 24, textAlign: "center", cursor: "pointer", background: "var(--accent-ultra)" }}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); void handleFiles(Array.from(e.dataTransfer.files)); }}
              >
                <input ref={fileRef} type="file" accept="image/*,.pdf" multiple hidden onChange={(e) => void handleFiles(Array.from(e.target.files ?? []))} />
                {uploading ? <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}><div className="spinner" /><span style={{ color: "var(--accent)" }}>Uploading...</span></div> : (
                  <>
                    <div className="upload-mark">UPLOAD</div>
                    <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>Click or drag & drop images</p>
                    <p style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 4 }}>EXIF · compression · C2PA analysis runs on your uploaded evidence</p>
                  </>
                )}
              </div>
              {evidenceFiles.length > 0 && (
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                  {evidenceFiles.map((f) => (
                    <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "6px 10px", background: "rgba(15,23,42,0.5)", borderRadius: 8 }}>
                      <span className="file-mark">FILE</span>
                      <span style={{ color: "var(--text-primary)", flex: 1 }}>{f.filename}</span>
                      <span style={{ color: "var(--text-muted)" }}>{(f.size_bytes / 1024).toFixed(1)} KB</span>
                      <button type="button" onClick={() => setEvidenceFiles((prev) => prev.filter((x) => x.id !== f.id))} style={{ color: "var(--danger)", background: "none", border: "none", cursor: "pointer" }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && <div style={{ padding: "12px 16px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, color: "#f87171", fontSize: 13 }}>{error}</div>}

            <button type="submit" className="btn-primary" style={{ justifyContent: "center", fontSize: 14, padding: 13 }} disabled={processing}>
              {processing ? <><div className="spinner" style={{ width: 16, height: 16 }} /> Investigating...</> : "Submit & Investigate"}
            </button>
          </form>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <TicketResult result={result} />
            <button onClick={handleReset} className="btn-ghost" style={{ alignSelf: "flex-start" }}>← Submit Another Ticket</button>
          </div>
        )}

        <div style={{ position: "sticky", top: 20 }}>
          <div className="glass-card" style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <h2 style={{ fontWeight: 700, fontSize: 14 }}>Agent Pipeline</h2>
              {processing && <span className="badge badge-accent">LIVE</span>}
            </div>
            <AgentPipelineUI stepStatuses={stepStatuses} />
          </div>
        </div>
      </div>
    </div>
  );
}
