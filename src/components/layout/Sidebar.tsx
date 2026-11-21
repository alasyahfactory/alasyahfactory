import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Building2,
  Users,
  Warehouse,
  BookOpen,
  Calendar,
  ShieldCheck,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { role } = useAuth();
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";

  const ownerLinks = [
    { to: "/", icon: LayoutDashboard, label: t("nav.dashboard") },
    { to: "/settings/factory", icon: Building2, label: t("nav.factorySettings") },
    { to: "/settings/users", icon: Users, label: t("nav.users") },
    { to: "/settings/facilities", icon: Warehouse, label: t("nav.facilities") },
    { to: "/accounting/coa", icon: BookOpen, label: t("nav.coa") },
    { to: "/accounting/periods", icon: Calendar, label: t("nav.periods") },
    { to: "/settings/audit-log", icon: ShieldCheck, label: t("nav.auditLog") },
  ];

  const accountantLinks = [
    { to: "/accounting", icon: LayoutDashboard, label: t("nav.accounting") },
    { to: "/accounting/coa", icon: BookOpen, label: t("nav.coa") },
    { to: "/accounting/periods", icon: Calendar, label: t("nav.periods") },
  ];

  const navLinks = role === "owner" ? ownerLinks : accountantLinks;

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col border-e border-industrial-border bg-white transition-all duration-300 select-none",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex flex-1 flex-col justify-between p-3">
        <nav className="space-y-1">
          {navLinks.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/" || item.to === "/accounting"}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
                    collapsed && "justify-center px-2"
                  )
                }
                title={collapsed ? item.label : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* Collapse toggle at bottom */}
        <div className="border-t border-industrial-border pt-2">
          <button
            onClick={onToggle}
            className="flex w-full items-center justify-center gap-2 rounded-md p-2 text-xs text-slate-500 hover:bg-slate-100"
          >
            {isArabic ? (
              collapsed ? (
                <ChevronLeft className="h-4 w-4" />
              ) : (
                <>
                  <ChevronRight className="h-4 w-4" />
                  <span>طي القائمة</span>
                </>
              )
            ) : collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
