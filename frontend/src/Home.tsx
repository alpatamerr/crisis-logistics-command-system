import { useState, useEffect } from "react";
import { Tabs, Tab, Navbar, Alignment, Icon, Tag } from "@blueprintjs/core";
import { useAutoRefresh } from "./utils/autoRefresh";
import { requestNotificationPermission } from "./utils/notifications";
import { SectionErrorBoundary } from "./components/SectionErrorBoundary";
import ActiveIncidents from "@/pages/ActiveIncidents";
import TransportStatus from "@/pages/TransportStatus";
import ResourcesFleet from "@/pages/ResourcesFleet";
import Analytics from "@/pages/Analytics";
import Dashboard from "@/pages/Dashboard";
import "./Home.css";

type TabId = "dashboard" | "incidents" | "transport" | "resources" | "analytics";

function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const { secondsUntilRefresh, refresh } = useAutoRefresh();

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  return (
    <div className="app-container">
      <Navbar className="app-navbar" fixedToTop>
        <Navbar.Group align={Alignment.LEFT}>
          <Icon icon="warning-sign" size={20} className="nav-icon" />
          <Navbar.Heading className="nav-title">
            Crisis Logistics Command Center
          </Navbar.Heading>
          <span className="live-indicator">
            <span className="live-dot" />
            LIVE
          </span>
          <Tag
            minimal
            icon="refresh"
            style={{ marginLeft: 12, fontSize: 10, cursor: "pointer", color: "#a7b6c2" }}
            onClick={refresh}
          >
            {Math.floor(secondsUntilRefresh / 60)}:{String(secondsUntilRefresh % 60).padStart(2, "0")}
          </Tag>
        </Navbar.Group>

      </Navbar>

      <div className="app-content">
        <Tabs
          id="main-tabs"
          selectedTabId={activeTab}
          onChange={(newTab) => setActiveTab(newTab as TabId)}
          large
          renderActiveTabPanelOnly
          className="app-tabs"
        >
          <Tab id="dashboard" title="Situation Overview" panel={<SectionErrorBoundary title="Situation Overview"><Dashboard /></SectionErrorBoundary>} />
          <Tab id="incidents" title="Active Incidents" panel={<SectionErrorBoundary title="Active Incidents"><ActiveIncidents /></SectionErrorBoundary>} />
          <Tab id="transport" title="Transport Status" panel={<SectionErrorBoundary title="Transport Status"><TransportStatus /></SectionErrorBoundary>} />
          <Tab id="resources" title="Resources & Fleet" panel={<SectionErrorBoundary title="Resources & Fleet"><ResourcesFleet /></SectionErrorBoundary>} />
          <Tab id="analytics" title="Analytics" panel={<SectionErrorBoundary title="Analytics"><Analytics /></SectionErrorBoundary>} />
        </Tabs>
      </div>

      <footer className="app-footer">
        Powered by TfL Open Data · Google Maps Platform · Airlabs
      </footer>
    </div>
  );
}

export default Home;
