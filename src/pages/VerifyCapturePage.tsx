/**
 * ArgusCX -- Mobile Verification Capture Page
 * Renders the live challenge-response camera capture UI.
 * iOS Safari compatible: video element with playsinline + muted + autoplay.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { getPublicSession, completeSession, type PublicChallenge, type PublicSessionData } from "@/lib/api_cases";
import { supabase } from "@/integrations/supabase/client";

const EVIDENCE_BUCKET = "verification-evidence";

async function uploadEvidenceFrame(sessionId: string, challengeIdx: number, blob: Blob): Promise<{ id: string; url: string } | null> {
  const path = `evidence/${sessionId}/${challengeIdx}-${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(EVIDENCE_BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) return null;
  const { data } = supabase.storage.from(EVIDENCE_BUCKET).getPublicUrl(path);
  return data.publicUrl ? { id: path, url: data.publicUrl } : null;
}

type CapturePhase =
  | "loading"
  | "permission_request"
  | "permission_denied"
  | "challenge"
  | "uploading"
  | "completed"
  | "error"
  | "expired";

export default function VerifyCapturePage() {
  const { sessionId = "" } = useParams<{ sessionId: string }>();
  const [sessionToken] = useState<string | null>(() => new URLSearchParams(window.location.search).get("token"));
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [phase, setPhase] = useState<CapturePhase>("loading");
  const [session, setSession] = useState<PublicSessionData | null>(null);
  const [currentChallengeIdx, setCurrentChallengeIdx] = useState(0);
  const [completedChallenges, setCompletedChallenges] = useState<number[]>([]);
  const [error, setError] = useState<string>("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [capturedFrames, setCapturedFrames] = useState<{ blob: Blob; challengeIdx: number }[]>([]);

  // Re-attach the stream once the <video> element is actually in the DOM.
  useEffect(() => {
    if (phase === "challenge" && videoRef.current && streamRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
        videoRef.current.play().catch(() => {/* autoplay policy — muted so this rarely fails */});
      }
    }
  }, [phase]);

  // Fetch the capture plan using the scoped token embedded in the QR/link.
  useEffect(() => {
    if (!sessionId || !sessionToken) {
      setError("This verification link is incomplete. Request a new link from support.");
      setPhase("error");
      return;
    }
    let active = true;
    getPublicSession(sessionId, sessionToken)
      .then((data) => {
        if (!active) return;
        setSession(data);
        setPhase("permission_request");
      })
      .catch((reason: unknown) => {
        if (!active) return;
        const status = (reason as { status?: number }).status;
        if (status === 410) { setPhase("expired"); return; }
        setError(reason instanceof Error ? reason.message : "Could not load this verification session.");
        setPhase("error");
      });
    return () => { active = false; };
  }, [sessionId, sessionToken]);

  const requestCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setPhase("challenge");
    } catch (err: any) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setPhase("permission_denied");
      } else {
        setError(`Camera error: ${err.message}`);
        setPhase("error");
      }
    }
  }, []);

  const captureFrame = async (): Promise<Blob | null> => {
    if (!videoRef.current) return null;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => { canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.9); });
  };

  const submitSession = useCallback(async (framesToUpload: { blob: Blob; challengeIdx: number }[]) => {
    if (!sessionToken) {
      setError("This verification link is incomplete. Request a new link from support.");
      setPhase("error");
      return;
    }
    setPhase("uploading");
    setUploadProgress(10);
    try {
      const uploaded: { id: string; url: string }[] = [];
      for (let i = 0; i < framesToUpload.length; i++) {
        const result = await uploadEvidenceFrame(sessionId, framesToUpload[i].challengeIdx, framesToUpload[i].blob);
        if (result) uploaded.push(result);
        setUploadProgress(10 + Math.round(((i + 1) / Math.max(framesToUpload.length, 1)) * 70));
      }

      setUploadProgress(85);
      await completeSession(sessionId, sessionToken, {
        assurance_level: "live_video",
        evidence_ids: uploaded.map((item) => item.id),
        evidence_urls: uploaded.map((item) => item.url),
      });
      setUploadProgress(100);
      setPhase("completed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed");
      setPhase("error");
    } finally {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    }
  }, [sessionId, sessionToken]);

  const completeChallenge = useCallback(async () => {
    const idx = currentChallengeIdx;
    const blob = await captureFrame();
    const newFrames = blob ? [...capturedFrames, { blob, challengeIdx: idx }] : capturedFrames;
    if (blob) setCapturedFrames(newFrames);

    const nextCompleted = [...completedChallenges, idx];
    setCompletedChallenges(nextCompleted);
    const challenges = session?.challenges || [];
    if (idx + 1 >= challenges.length) {
      submitSession(newFrames);
    } else {
      setCurrentChallengeIdx(idx + 1);
    }
  }, [completedChallenges, currentChallengeIdx, session, capturedFrames, submitSession]);

  const challenges = session?.challenges || [];
  const currentChallenge: PublicChallenge | undefined = challenges[currentChallengeIdx];
  const progressPct = challenges.length ? (completedChallenges.length / challenges.length) * 100 : 0;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.logo}>ArgusCX</div>
        <div style={styles.headerSub}>Return Verification</div>
      </div>

      {phase === "challenge" && challenges.length > 0 && (
        <div style={styles.progressBar}>
          <div style={{ ...styles.progressFill, width: `${progressPct}%` }} />
        </div>
      )}

      <div style={styles.content}>
        {phase === "loading" && (
          <div style={styles.centered}>
            <div style={styles.spinner} />
            <p style={styles.subText}>Loading session...</p>
          </div>
        )}

        {phase === "permission_request" && (
          <div style={styles.centered}>
            <h1 style={styles.title}>Camera Access Needed</h1>
            <p style={styles.bodyText}>
              We need your camera to capture live evidence of the product.
              Your session is secure and expires in 30 minutes.
            </p>
            <button style={styles.primaryBtn} onClick={requestCamera}>Allow Camera</button>
            <p style={styles.hint}>iOS: tap Allow when prompted. Android: tap Allow or OK.</p>
          </div>
        )}

        {phase === "permission_denied" && (
          <div style={styles.centered}>
            <h1 style={styles.title}>Camera Access Denied</h1>
            <p style={styles.bodyText}>Please enable camera access in your browser settings and refresh this page.</p>
            <p style={styles.hint}>
              iOS: Settings → Safari → Camera → Allow<br />
              Android: Site settings → Camera → Allow
            </p>
            <button style={styles.secondaryBtn} onClick={() => window.location.reload()}>Try Again</button>
          </div>
        )}

        {phase === "challenge" && (
          <div style={styles.challengeContainer}>
            <div style={styles.videoWrapper}>
              <video ref={videoRef} autoPlay muted playsInline style={styles.video} />
              <div style={styles.videoOverlay}>
                <div style={styles.challengeStep}>Step {currentChallengeIdx + 1} of {challenges.length}</div>
              </div>
            </div>
            {currentChallenge && (
              <div style={styles.challengeCard}>
                <p style={styles.challengeInstruction}>{currentChallenge.instruction_text}</p>
                <button style={styles.primaryBtn} onClick={completeChallenge}>Done</button>
              </div>
            )}
          </div>
        )}

        {phase === "uploading" && (
          <div style={styles.centered}>
            <div style={styles.spinner} />
            <h1 style={styles.title}>Submitting Evidence</h1>
            <div style={styles.uploadBar}><div style={{ ...styles.uploadFill, width: `${uploadProgress}%` }} /></div>
            <p style={styles.subText}>{uploadProgress}% — Please keep this page open</p>
          </div>
        )}

        {phase === "completed" && (
          <div style={styles.centered}>
            <h1 style={styles.title}>Verification Complete</h1>
            <p style={styles.bodyText}>Your evidence has been submitted for review. You will be notified of the outcome shortly.</p>
            <p style={styles.hint}>You may now close this window.</p>
          </div>
        )}

        {phase === "expired" && (
          <div style={styles.centered}>
            <h1 style={styles.title}>Session Expired</h1>
            <p style={styles.bodyText}>This verification link has expired. Please contact support to receive a new verification link.</p>
          </div>
        )}

        {phase === "error" && (
          <div style={styles.centered}>
            <h1 style={styles.title}>Something Went Wrong</h1>
            <p style={styles.bodyText}>{error || "An unexpected error occurred."}</p>
            <button style={styles.secondaryBtn} onClick={() => window.location.reload()}>Retry</button>
          </div>
        )}
      </div>

      <div style={styles.footer}>
        <p style={styles.footerText}>Secured by ArgusCX · Evidence encrypted in transit</p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container:           { minHeight: "100vh", background: "var(--bg-primary)", color: "var(--text-primary)", fontFamily: "var(--font-sans)", display: "flex", flexDirection: "column" },
  header:              { background: "var(--bg-elevated)", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)" },
  logo:                { fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" },
  headerSub:           { fontSize: "12px", color: "var(--text-muted)", fontWeight: 500 },
  progressBar:         { height: "3px", background: "var(--border)" },
  progressFill:        { height: "100%", background: "var(--accent)", transition: "width 0.4s ease" },
  content:             { flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "24px 20px", maxWidth: 430, margin: "0 auto", width: "100%" },
  centered:            { display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "16px" },
  title:               { fontSize: "20px", fontWeight: 600, margin: 0, color: "var(--text-primary)" },
  bodyText:            { fontSize: "15px", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 },
  hint:                { fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.5 },
  subText:             { fontSize: "14px", color: "var(--text-secondary)" },
  primaryBtn:          { background: "var(--text-primary)", color: "var(--bg-primary)", border: "none", borderRadius: "8px", padding: "16px 32px", fontSize: "16px", fontWeight: 600, cursor: "pointer", width: "100%" },
  secondaryBtn:        { background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border-strong)", borderRadius: "8px", padding: "14px 28px", fontSize: "15px", fontWeight: 500, cursor: "pointer" },
  spinner:             { width: "40px", height: "40px", border: "3px solid var(--border)", borderTop: "3px solid var(--text-primary)", borderRadius: "50%", animation: "spin-slow 1s linear infinite" },
  uploadBar:           { width: "100%", height: "6px", background: "var(--bg-elevated)", borderRadius: "3px", overflow: "hidden" },
  uploadFill:          { height: "100%", background: "var(--accent)", transition: "width 0.3s ease" },
  challengeContainer:  { display: "flex", flexDirection: "column", gap: "16px", width: "100%" },
  videoWrapper:        { position: "relative", borderRadius: "12px", overflow: "hidden", background: "var(--bg-elevated)", aspectRatio: "3/4", maxHeight: "65vh" },
  video:               { width: "100%", height: "100%", objectFit: "cover" },
  videoOverlay:        { position: "absolute", top: "12px", left: "12px", right: "12px" },
  challengeStep:       { background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)", padding: "4px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: 500, display: "inline-block" },
  challengeCard:       { background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "12px", padding: "20px", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", textAlign: "center" },
  challengeInstruction:{ fontSize: "16px", color: "var(--text-primary)", fontWeight: 500, lineHeight: 1.4, margin: 0 },
  footer:              { padding: "16px", textAlign: "center" },
  footerText:          { fontSize: "11px", color: "var(--text-muted)", margin: 0 },
};
