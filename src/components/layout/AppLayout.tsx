import { useState, useEffect, Suspense } from "react";
import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { WifiOff } from "lucide-react";

export function AppLayout() {
  const { role } = useAuth();
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

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

      {/* Offline Status Indicator Banner */}
      {isOffline && (
        <div
          role="status"
          aria-live="polite"
          className="bg-amber-500 text-slate-950 px-4 py-1.5 text-xs font-semibold flex items-center justify-center gap-2 shadow-sm text-center"
        >
          <WifiOff className="h-4 w-4" />
          <span>تنبيه: أنت تعمل حالياً دون اتصال بالإنترنت (Offline Mode). يرجى التحقق من الشبكة لمزامنة العمليات.</span>
        </div>
      )}

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
            <Suspense
              fallback={
                <div className="flex h-[40vh] w-full items-center justify-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-sky-600" />
                    <span className="text-xs text-slate-400 font-mono">جاري تحميل الشاشة...</span>
                  </div>
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNav />
    </div>
  );
}
