import React, { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import Sidebar from "@/components/dashboard/Sidebar";
import Topbar from "@/components/dashboard/Topbar";
import { getToken } from "@/lib/auth";

export default function DashboardLayout() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!getToken()) navigate("/login");
  }, [navigate]);

  return (
    <div className="premium-shell" style={{ display: "flex", height: "100vh", overflow: "hidden", backgroundColor: "var(--bg-primary)" }}>
      <Sidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "auto", position: "relative" }}>
        <Topbar />
        <main className="dashboard-main" style={{ flex: 1, padding: "32px", maxWidth: "1600px", margin: "0 auto", width: "100%" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
