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
  ShoppingCart,
  Scale,
  Droplets,
  Receipt,
} from "lucide-react";

export function BottomNav() {
  const { role } = useAuth();
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";

  let navItems: { to: string; label: string; icon: React.ElementType }[] = [];

  if (role === "owner") {
    navItems = [
      { to: "/", label: t("nav.dashboard"), icon: LayoutDashboard },
      { to: "/inventory/items", label: isArabic ? "الأصناف" : "Items", icon: Package },
      { to: "/procurement/orders", label: isArabic ? "المشتريات" : "Orders", icon: ShoppingCart },
      { to: "/procurement/receipts", label: isArabic ? "الاستلام" : "Receipts", icon: Scale },
      { to: "/accounting/coa", label: t("nav.coa"), icon: BookOpen },
    ];
  } else if (role === "accountant") {
    navItems = [
      { to: "/accounting", label: t("nav.accounting"), icon: LayoutDashboard },
      { to: "/sales/invoices", label: isArabic ? "الفواتير" : "Invoices", icon: Receipt },
      { to: "/procurement/orders", label: isArabic ? "أوامر الشراء" : "Orders", icon: ShoppingCart },
      { to: "/procurement/receipts", label: isArabic ? "الاستلام" : "Receipts", icon: Scale },
      { to: "/accounting/coa", label: t("nav.coa"), icon: BookOpen },
    ];
  } else if (role === "production") {
    navItems = [
      { to: "/production", label: isArabic ? "الإنتاج" : "Floor", icon: Factory },
      { to: "/manufacturing/mixing", label: isArabic ? "التانكات" : "Tanks", icon: Droplets },
      { to: "/manufacturing/packaging", label: isArabic ? "التعبئة" : "Packing", icon: Package },
      { to: "/inventory/items", label: isArabic ? "الأصناف" : "Stock", icon: Scale },
    ];
  } else if (role === "warehouse") {
    navItems = [
      { to: "/warehouse", label: t("nav.warehouseShell"), icon: Package },
      { to: "/procurement/receipts", label: isArabic ? "استلام الوزن" : "GRN", icon: Scale },
      { to: "/inventory/items", label: isArabic ? "الأصناف" : "Items", icon: Package },
    ];
  } else if (role === "sales_rep") {
    navItems = [
      { to: "/rep", label: t("nav.repShell"), icon: Truck },
    ];
  }

  if (navItems.length === 0) return null;

  return (
    <nav
      aria-label={isArabic ? "التنقل السريع للجوال" : "Quick Navigation"}
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-lg border-t border-slate-200/80 shadow-[0_-4px_20px_rgba(0,0,0,0.04)] pb-safe"
    >
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/" || item.to === "/accounting"}
              className={({ isActive }) =>
                cn(
                  "relative flex flex-1 flex-col items-center justify-center min-h-[48px] py-1 text-center transition-all duration-150 select-none rounded-xl active:scale-95",
                  isActive
                    ? "text-sky-600 font-semibold"
                    : "text-slate-500 hover:text-slate-800"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn("h-5 w-5 mb-0.5 transition-transform duration-150", isActive && "scale-110")} />
                  <span className="text-[10px] tracking-tight truncate max-w-[64px]">
                    {item.label}
                  </span>
                  {isActive && (
                    <span className="absolute top-1 h-1 w-6 bg-sky-600 rounded-full" />
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
