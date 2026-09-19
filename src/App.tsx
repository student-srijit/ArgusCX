import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import NotFoundPage from "./pages/NotFoundPage";

// Everything below is reached only by navigation (never on the initial "/"
// landing load), so it is split into route-level chunks instead of joining
// the public homepage's critical bundle.
const LoginPage = lazy(() => import("./pages/LoginPage"));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage"));
const VerifyCapturePage = lazy(() => import("./pages/VerifyCapturePage"));
const DashboardLayout = lazy(() => import("./pages/dashboard/DashboardLayout"));
const DashboardOverview = lazy(() => import("./pages/dashboard/DashboardOverview"));
const SettingsPage = lazy(() => import("./pages/dashboard/SettingsPage"));
const ApiConsolePage = lazy(() => import("./pages/dashboard/ApiConsolePage"));
const VerifyNewPage = lazy(() => import("./pages/dashboard/VerifyNewPage"));

function RouteFallback() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-primary)" }}>
      <div className="spinner" aria-label="Loading" />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/verify/:sessionId" element={<VerifyCapturePage />} />

          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<DashboardOverview />} />
            <Route path="verify-new" element={<VerifyNewPage />} />
            <Route path="queue" element={<Navigate to="/dashboard/cases" replace />} />
            <Route path="api" element={<ApiConsolePage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
