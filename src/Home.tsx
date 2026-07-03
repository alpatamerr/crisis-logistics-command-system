import { useState } from "react";
import { Tabs, Tab, Navbar, Alignment, Icon } from "@blueprintjs/core";
import ActiveIncidents from "@/pages/ActiveIncidents";
import TransportStatus from "@/pages/TransportStatus";
import ResourcesFleet from "@/pages/ResourcesFleet";
import Analytics from "@/pages/Analytics";
import Dashboard from "@/pages/Dashboard";
import "./Home.css";

type TabId = "dashboard" | "incidents" | "transport" | "resources" | "analytics";

function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");

  return (
    <div className="app-container">
      <Navbar className="app-navbar" fixedToTop>
        <Navbar.Group align={Alignment.LEFT}>
          <Icon icon="warning-sign" size={20} className="nav-icon" />
          <Navbar.Heading className="nav-title">
            Crisis Logistics Command Center
          </Navbar.Heading>
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
          <Tab id="dashboard" title="Situation Overview" panel={<Dashboard />} />
          <Tab id="incidents" title="Active Incidents" panel={<ActiveIncidents />} />
          <Tab id="transport" title="Transport Status" panel={<TransportStatus />} />
          <Tab id="resources" title="Resources & Fleet" panel={<ResourcesFleet />} />
          <Tab id="analytics" title="Analytics" panel={<Analytics />} />
        </Tabs>
      </div>

      <footer className="app-footer">
        Powered by TfL Open Data · Google Maps Platform · Airlabs
      </footer>
    </div>
  );
}

export default Home;
