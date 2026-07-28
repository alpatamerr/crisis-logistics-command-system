import { useState, useEffect, useMemo } from "react";
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
type Role = "all" | "ops-manager" | "dispatcher" | "resource-officer" | "shift-supervisor";

const ROLE_CONFIG: Record<Role, { label: string; icon: string; tabs: TabId[] }> = {
  "all":               { label: "All Access",         icon: "👁",  tabs: ["dashboard", "incidents", "transport", "resources", "analytics"] },
  "ops-manager":       { label: "Ops Manager",        icon: "🎯", tabs: ["dashboard", "incidents"] },
  "dispatcher":        { label: "Dispatcher",         icon: "🚛", tabs: ["dashboard", "transport"] },
  "resource-officer":  { label: "Resource Officer",   icon: "📦", tabs: ["dashboard", "resources"] },
  "shift-supervisor":  { label: "Shift Supervisor",   icon: "📊", tabs: ["dashboard", "analytics"] },
};

function getStoredRole(): Role {
  const stored = localStorage.getItem("crisis-role");
  if (stored && stored in ROLE_CONFIG) { return stored as Role; }
  return "all";
}

function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [role, setRole] = useState<Role>(getStoredRole);
  const [roleOpen, setRoleOpen] = useState(false);
  const { secondsUntilRefresh, refresh } = useAutoRefresh();

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  useEffect(() => {
    localStorage.setItem("crisis-role", role);
    // If current tab is not visible for new role, switch to dashboard
    if (!ROLE_CONFIG[role].tabs.includes(activeTab)) {
      setActiveTab("dashboard");
    }
  }, [role, activeTab]);

  const visibleTabs = useMemo(() => ROLE_CONFIG[role].tabs, [role]);
  const currentRole = ROLE_CONFIG[role];

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

        <Navbar.Group align={Alignment.RIGHT}>
          <div className="role-selector-wrapper">
            <button
              className="role-selector-btn"
              onClick={() => setRoleOpen(!roleOpen)}
            >
              <span className="role-icon">{currentRole.icon}</span>
              <span className="role-label">{currentRole.label}</span>
              <Icon icon="chevron-down" size={12} style={{ opacity: 0.6 }} />
            </button>
            {roleOpen && (
              <>
                {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
                <div className="role-backdrop" onClick={() => setRoleOpen(false)} />
                <div className="role-dropdown">
                  {(Object.entries(ROLE_CONFIG) as [Role, typeof currentRole][]).map(([key, cfg]) => (
                    <button
                      key={key}
                      className={`role-option ${key === role ? "role-option-active" : ""}`}
                      onClick={() => { setRole(key); setRoleOpen(false); }}
                    >
                      <span className="role-icon">{cfg.icon}</span>
                      <span>{cfg.label}</span>
                      {key === role && <Icon icon="tick" size={12} style={{ marginLeft: "auto", color: "#2d72d2" }} />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
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
          {visibleTabs.includes("dashboard") && (
            <Tab id="dashboard" title="Situation Overview" panel={<SectionErrorBoundary title="Situation Overview"><Dashboard /></SectionErrorBoundary>} />
          )}
          {visibleTabs.includes("incidents") && (
            <Tab id="incidents" title="Active Incidents" panel={<SectionErrorBoundary title="Active Incidents"><ActiveIncidents /></SectionErrorBoundary>} />
          )}
          {visibleTabs.includes("transport") && (
            <Tab id="transport" title="Transport Status" panel={<SectionErrorBoundary title="Transport Status"><TransportStatus /></SectionErrorBoundary>} />
          )}
          {visibleTabs.includes("resources") && (
            <Tab id="resources" title="Resources & Fleet" panel={<SectionErrorBoundary title="Resources & Fleet"><ResourcesFleet /></SectionErrorBoundary>} />
          )}
          {visibleTabs.includes("analytics") && (
            <Tab id="analytics" title="Analytics" panel={<SectionErrorBoundary title="Analytics"><Analytics /></SectionErrorBoundary>} />
          )}
        </Tabs>
      </div>

      <footer className="app-footer">
        Powered by TfL Open Data · Google Maps Platform · Airlabs
      </footer>
    </div>
  );
}

export default Home;
