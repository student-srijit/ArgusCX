import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { signOutDashboard } from "@/lib/firebase";
import { logout } from "@/lib/auth";

export default function SignOutButton({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout();
    } catch {
      // Local session cleanup still safely signs the operator out if the API is offline.
    } finally {
      await signOutDashboard().catch(() => undefined);
      navigate("/login", { replace: true });
    }
  };

  return <button className="btn-ghost" type="button" onClick={() => void signOut()} disabled={signingOut} style={compact ? { width: "100%", justifyContent: "flex-start", marginTop: 8, padding: "8px 0", border: "none" } : undefined}><LogOut size={15} />{signingOut ? "Signing out…" : "Sign out"}</button>;
}
