import Hero from "@/components/dashboard/Hero";
import OperationalMetrics from "@/components/dashboard/OperationalMetrics";
import GettingStarted from "@/components/dashboard/GettingStarted";
import LiveVerificationMonitor from "@/components/dashboard/LiveVerificationMonitor";
import EvidencePipeline from "@/components/dashboard/EvidencePipeline";
import CasesTable from "@/components/dashboard/CasesTable";
import EvidenceAnomalies from "@/components/dashboard/EvidenceAnomalies";
import FraudGraph from "@/components/dashboard/FraudGraph";

export default function DashboardOverview() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32, paddingBottom: 64 }}>
      <Hero />
      <OperationalMetrics />
      <GettingStarted />
      <div className="dashboard-split">
        <LiveVerificationMonitor />
        <EvidencePipeline />
      </div>
      <div className="dashboard-split">
        <FraudGraph />
        <EvidenceAnomalies />
      </div>
      <CasesTable />
    </div>
  );
}
