import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { useAuth } from "@/contexts/AuthContext";

export function AppLayout() {
  const { role } = useAuth();
  const [collapsed, setCollapsed] = useState<boolean>(false);

  // Desktop sidebar only shown for owner and accountant
  const showSidebar = role === "owner" || role === "accountant";

  return (
    <div className="flex min-h-screen flex-col bg-industrial-bg text-industrial-primary antialiased">
      {/* Top Header */}
      <Header onToggleSidebar={showSidebar ? () => setCollapsed(!collapsed) : undefined} />

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar */}
        {showSidebar && (
          <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
        )}

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNav />
    </div>
  );
}
