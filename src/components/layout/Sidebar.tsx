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
  Package,
  Layers,
  Scale,
  ShoppingCart,
  RotateCcw,
  Truck,
  Building,
  FlaskConical,
  Droplets,
  PackageCheck,
} from "lucide-react";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { role, isOwner, isAccountant } = useAuth();
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";

  const sections = [
    {
      title: isArabic ? "الرئيسية" : "Overview",
      items: [
        {
          to: isOwner ? "/" : "/accounting",
          icon: LayoutDashboard,
          label: isOwner ? (isArabic ? "لوحة المدير" : "Dashboard") : (isArabic ? "لوحة المحاسب" : "Accounting"),
          show: isOwner || isAccountant,
        },
      ],
    },
    {
      title: isArabic ? "المخزون والـ FIFO" : "Inventory & FIFO",
      items: [
        {
          to: "/inventory/items",
          icon: Package,
          label: t("nav.items"),
          show: isOwner || isAccountant || role === "production" || role === "warehouse",
        },
        {
          to: "/inventory/opening-balances",
          icon: Scale,
          label: t("nav.openingBalances"),
          show: isOwner || isAccountant,
        },
      ],
    },
    {
      title: isArabic ? "المشتريات والموردين" : "Procurement",
      items: [
        {
          to: "/procurement/suppliers",
          icon: Building,
          label: t("nav.suppliers"),
          show: isOwner || isAccountant,
        },
        {
          to: "/procurement/orders",
          icon: ShoppingCart,
          label: t("nav.purchaseOrders"),
          show: isOwner || isAccountant,
        },
        {
          to: "/procurement/receipts",
          icon: Scale,
          label: t("nav.goodsReceipts"),
          show: isOwner || isAccountant || role === "warehouse",
        },
        {
          to: "/procurement/returns",
          icon: RotateCcw,
          label: t("nav.debitNotes"),
          show: isOwner || isAccountant,
        },
      ],
    },
    {
      title: isArabic ? "التصنيع والتعبئة" : "Manufacturing",
      items: [
        {
          to: "/manufacturing/formulas",
          icon: FlaskConical,
          label: t("nav.formulas"),
          show: isOwner || role === "production" || isAccountant,
        },
        {
          to: "/manufacturing/specs",
          icon: Layers,
          label: t("nav.packagingSpecs"),
          show: isOwner || role === "production" || isAccountant,
        },
        {
          to: "/manufacturing/mixing",
          icon: Droplets,
          label: t("nav.mixingBatches"),
          show: isOwner || role === "production",
        },
        {
          to: "/manufacturing/packaging",
          icon: PackageCheck,
          label: t("nav.packagingOrders"),
          show: isOwner || role === "production",
        },
      ],
    },
    {
      title: isArabic ? "المحاسبة والمالية" : "Accounting",
      items: [
        {
          to: "/accounting/coa",
          icon: BookOpen,
          label: t("nav.coa"),
          show: isOwner || isAccountant,
        },
        {
          to: "/accounting/periods",
          icon: Calendar,
          label: t("nav.periods"),
          show: isOwner || isAccountant,
        },
      ],
    },
    {
      title: isArabic ? "الإعدادات والأسطول" : "Settings & Fleet",
      items: [
        {
          to: "/settings/factory",
          icon: Building2,
          label: t("nav.factorySettings"),
          show: isOwner,
        },
        {
          to: "/settings/users",
          icon: Users,
          label: t("nav.users"),
          show: isOwner,
        },
        {
          to: "/settings/facilities",
          icon: Warehouse,
          label: t("nav.facilities"),
          show: isOwner,
        },
        {
          to: "/settings/vehicles",
          icon: Truck,
          label: t("nav.vehicles"),
          show: isOwner || isAccountant,
        },
        {
          to: "/settings/audit-log",
          icon: ShieldCheck,
          label: t("nav.auditLog"),
          show: isOwner,
        },
      ],
    },
  ];

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col border-e border-industrial-border bg-white transition-all duration-300 select-none overflow-y-auto",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex flex-1 flex-col justify-between p-3 space-y-4">
        <nav className="space-y-4">
          {sections.map((sec, secIdx) => {
            const visibleItems = sec.items.filter((i) => i.show);
            if (visibleItems.length === 0) return null;

            return (
              <div key={secIdx} className="space-y-1">
                {!collapsed && (
                  <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    {sec.title}
                  </div>
                )}
                {visibleItems.map((item) => {
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
              </div>
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

