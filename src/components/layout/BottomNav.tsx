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
  Factory,
  Package,
  Truck,
} from "lucide-react";

export function BottomNav() {
  const { role } = useAuth();
  const { t } = useTranslation();

  let navItems: { to: string; label: string; icon: React.ElementType }[] = [];

  if (role === "owner") {
    navItems = [
      { to: "/", label: t("nav.dashboard"), icon: LayoutDashboard },
      { to: "/settings/factory", label: t("nav.factorySettings"), icon: Building2 },
      { to: "/settings/users", label: t("nav.users"), icon: Users },
      { to: "/settings/facilities", label: t("nav.facilities"), icon: Warehouse },
      { to: "/accounting/coa", label: t("nav.coa"), icon: BookOpen },
    ];
  } else if (role === "accountant") {
    navItems = [
      { to: "/accounting", label: t("nav.accounting"), icon: LayoutDashboard },
      { to: "/accounting/coa", label: t("nav.coa"), icon: BookOpen },
      { to: "/accounting/periods", label: t("nav.periods"), icon: Calendar },
    ];
  } else if (role === "production") {
    navItems = [
      { to: "/production", label: t("nav.productionShell"), icon: Factory },
    ];
  } else if (role === "warehouse") {
    navItems = [
      { to: "/warehouse", label: t("nav.warehouseShell"), icon: Package },
    ];
  } else if (role === "sales_rep") {
    navItems = [
      { to: "/rep", label: t("nav.repShell"), icon: Truck },
    ];
  }

  if (navItems.length === 0) return null;

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-industrial-border pb-safe">
      <div className="flex items-center justify-around h-16 px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/" || item.to === "/accounting"}
              className={({ isActive }) =>
                cn(
                  "flex flex-1 flex-col items-center justify-center min-h-[44px] py-1 text-center transition-colors select-none",
                  isActive
                    ? "text-accent font-semibold"
                    : "text-slate-500 hover:text-slate-800"
                )
              }
            >
              <Icon className="h-5 w-5 mb-0.5" />
              <span className="text-[10px] tracking-tight truncate max-w-[64px]">
                {item.label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
