import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, ShieldAlert, XCircle } from "lucide-react";
import { getCaseDetails, reviewCase } from "@/lib/api_cases";

type SessionDetail = {
  id?: string;
  order_id?: string | null;
  customer_ref?: string | null;
  claim_text?: string | null;
  return_reason?: string | null;
  category?: string | null;
  expected_serial?: string | null;
  assurance_level?: string | null;
  challenges?: { instruction_text: string; required_action: string }[];
  evidence_ids?: string[];
  evidence_urls?: string[];
  created_at?: string | null;
};

type CaseDetail = {
  id: string;
  session_id: string;
  state: string;
  routing?: string;
  reasoning_narrative?: string;
  reviewer_decision?: string;
  reviewer_notes?: string;
  reviewed_at?: string;
  created_at: string;
  session?: SessionDetail;
};

export default function CaseDetailPage() {
  const { caseId = "" } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    getCaseDetails(caseId)
      .then((data) => setDetail(data as CaseDetail))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to load this case."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [caseId]);

  const decide = async (decision: "APPROVED" | "REJECTED" | "ESCALATED") => {
    setSubmitting(true);
    setError("");
    try {
      await reviewCase(caseId, decision, notes);
      load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to record the decision.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <p style={{ color: "var(--text-secondary)" }}>Loading case…</p>;
  if (!detail) return <div className="api-notice api-notice-error">{error || "Case not found."}</div>;

  const session = detail.session || {};
  const decided = Boolean(detail.reviewer_decision);
  const evidenceUrls = session.evidence_urls || [];

  return (
    <section style={{ maxWidth: 980, paddingBottom: 48 }}>
      <button className="btn-ghost" onClick={() => navigate(-1)} style={{ marginBottom: 16 }}><ArrowLeft size={14} /> Back</button>
      <p className="label">Case</p>
      <h1 style={{ fontSize: 26, fontWeight: 800, marginTop: 4, fontFamily: "var(--font-mono)" }}>{detail.id}</h1>
      <p style={{ color: "var(--text-secondary)" }}>Session <Link to={`/dashboard/sessions`} style={{ color: "var(--info)" }}>{detail.session_id}</Link> · Created {new Date(detail.created_at).toLocaleString()}</p>

      {error && <div className="api-notice api-notice-error" role="alert" style={{ marginTop: 14 }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, marginTop: 22 }}>
        <div style={{ display: "grid", gap: 16 }}>
          <div className="glass-card" style={{ padding: 22 }}>
            <p className="label">Claim context</p>
            <p style={{ margin: "8px 0", color: "var(--text-primary)" }}>{session.claim_text || "No claim context supplied."}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginTop: 14, fontSize: 13 }}>
              <div><span style={{ color: "var(--text-muted)" }}>Order</span><div>{session.order_id ?? "Not supplied"}</div></div>
              <div><span style={{ color: "var(--text-muted)" }}>Customer</span><div>{session.customer_ref ?? "Not supplied"}</div></div>
              <div><span style={{ color: "var(--text-muted)" }}>Category</span><div>{session.category ?? "—"}</div></div>
              <div><span style={{ color: "var(--text-muted)" }}>Return reason</span><div>{session.return_reason ?? "—"}</div></div>
              <div><span style={{ color: "var(--text-muted)" }}>Expected serial</span><div>{session.expected_serial ?? "—"}</div></div>
              <div><span style={{ color: "var(--text-muted)" }}>Assurance level</span><div>{session.assurance_level ?? "—"}</div></div>
            </div>
          </div>

          <div className="glass-card" style={{ padding: 22 }}>
            <p className="label">Reasoning</p>
            <p style={{ margin: "8px 0", color: "var(--text-primary)" }}>{detail.reasoning_narrative || "No automated reasoning is available for this case."}</p>
          </div>

          <div className="glass-card" style={{ padding: 22 }}>
            <p className="label">Evidence ({evidenceUrls.length})</p>
            {evidenceUrls.length === 0 ? (
              <p style={{ color: "var(--text-muted)", marginTop: 8 }}>No evidence was submitted for this session.</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginTop: 12 }}>
                {evidenceUrls.map((url, index) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer" style={{ display: "block", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }}>
                    <img src={url} alt={`Evidence ${index + 1}`} style={{ width: "100%", height: 110, objectFit: "cover", display: "block" }} />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          <div className="glass-card" style={{ padding: 22 }}>
            <p className="label">Status</p>
            <h2 style={{ fontSize: 18, margin: "8px 0" }}>{detail.state}</h2>
            <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Routing: {detail.routing ?? "Pending"}</p>
            {decided && (
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 10 }}>
                Reviewed as <strong>{detail.reviewer_decision}</strong>{detail.reviewed_at ? ` on ${new Date(detail.reviewed_at).toLocaleString()}` : ""}.
                {detail.reviewer_notes ? ` "${detail.reviewer_notes}"` : ""}
              </p>
            )}
          </div>

          <div className="glass-card" style={{ padding: 22 }}>
            <p className="label">Operator decision</p>
            <textarea className="textarea" placeholder="Notes for this decision (optional)" value={notes} onChange={(event) => setNotes(event.target.value)} style={{ marginTop: 10, minHeight: 80 }} />
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              <button className="btn-primary" disabled={submitting} onClick={() => void decide("APPROVED")}><CheckCircle2 size={14} /> Approve</button>
              <button className="btn-ghost" disabled={submitting} onClick={() => void decide("ESCALATED")}><ShieldAlert size={14} /> Escalate</button>
              <button className="btn-ghost" disabled={submitting} onClick={() => void decide("REJECTED")}><XCircle size={14} /> Reject</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
