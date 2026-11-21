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
      {/* Skip to Main Content Link for Screen Readers and Keyboard Navigation */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:start-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-sky-600 focus:text-white focus:rounded-md focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2"
      >
        الانتقال إلى المحتوى الرئيسي
      </a>

      {/* Top Header */}
      <Header onToggleSidebar={showSidebar ? () => setCollapsed(!collapsed) : undefined} />

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar */}
        {showSidebar && (
          <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
        )}

        {/* Main Content Area */}
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6 focus:outline-none">
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
