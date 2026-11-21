import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  Building2,
  Users,
  Warehouse,
  BookOpen,
  Calendar,
  ShieldCheck,
  LayoutDashboard,
  LogOut,
  Globe,
  Package,
  Scale,
  ShoppingCart,
  RotateCcw,
  Truck,
  Building,
} from "lucide-react";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { role, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleSelect = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const toggleLanguage = () => {
    const nextLang = i18n.language === "ar" ? "en" : "ar";
    i18n.changeLanguage(nextLang);
    setOpen(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 rounded-md border border-industrial-border bg-white px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-accent"
      >
        <span>{t("common.search")}</span>
        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-slate-200 bg-slate-100 px-1.5 font-mono text-[10px] font-medium text-slate-600">
          <span className="text-xs">Ctrl</span>K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder={isArabic ? "ابحث عن شاشة أو أمر..." : "Type a command or search..."}
        />
        <CommandList>
          <CommandEmpty>
            {isArabic ? "لا توجد نتائج مطابقة" : "No results found"}
          </CommandEmpty>

          {role === "owner" && (
            <CommandGroup heading={isArabic ? "إدارة المنشأة والمصنع" : "Factory Administration"}>
              <CommandItem onSelect={() => handleSelect("/")}>
                <LayoutDashboard className="me-2 h-4 w-4 text-slate-500" />
                <span>{t("nav.dashboard")}</span>
              </CommandItem>
              <CommandItem onSelect={() => handleSelect("/settings/factory")}>
                <Building2 className="me-2 h-4 w-4 text-slate-500" />
                <span>{t("nav.factorySettings")}</span>
              </CommandItem>
              <CommandItem onSelect={() => handleSelect("/settings/users")}>
                <Users className="me-2 h-4 w-4 text-slate-500" />
                <span>{t("nav.users")}</span>
              </CommandItem>
              <CommandItem onSelect={() => handleSelect("/settings/facilities")}>
                <Warehouse className="me-2 h-4 w-4 text-slate-500" />
                <span>{t("nav.facilities")}</span>
              </CommandItem>
              <CommandItem onSelect={() => handleSelect("/settings/vehicles")}>
                <Truck className="me-2 h-4 w-4 text-slate-500" />
                <span>{isArabic ? "سيارات التوزيع" : "Delivery Vehicles"}</span>
              </CommandItem>
              <CommandItem onSelect={() => handleSelect("/settings/audit-log")}>
                <ShieldCheck className="me-2 h-4 w-4 text-slate-500" />
                <span>{t("nav.auditLog")}</span>
              </CommandItem>
            </CommandGroup>
          )}

          {(role === "owner" || role === "accountant" || role === "warehouse" || role === "production") && (
            <CommandGroup heading={isArabic ? "المخزون والمواد" : "Inventory & FIFO"}>
              <CommandItem onSelect={() => handleSelect("/inventory/items")}>
                <Package className="me-2 h-4 w-4 text-slate-500" />
                <span>{isArabic ? "دليل الأصناف والمواد" : "Items & Materials"}</span>
              </CommandItem>
              {(role === "owner" || role === "accountant") && (
                <CommandItem onSelect={() => handleSelect("/inventory/opening-balances")}>
                  <Scale className="me-2 h-4 w-4 text-slate-500" />
                  <span>{isArabic ? "الأرصدة الافتتاحية للمخزون" : "Opening Inventory Balances"}</span>
                </CommandItem>
              )}
            </CommandGroup>
          )}

          {(role === "owner" || role === "accountant" || role === "warehouse") && (
            <CommandGroup heading={isArabic ? "المشتريات والتوريد" : "Procurement & Suppliers"}>
              {(role === "owner" || role === "accountant") && (
                <>
                  <CommandItem onSelect={() => handleSelect("/procurement/suppliers")}>
                    <Building className="me-2 h-4 w-4 text-slate-500" />
                    <span>{isArabic ? "دليل الموردين" : "Suppliers Directory"}</span>
                  </CommandItem>
                  <CommandItem onSelect={() => handleSelect("/procurement/orders")}>
                    <ShoppingCart className="me-2 h-4 w-4 text-slate-500" />
                    <span>{isArabic ? "أوامر الشراء (PO)" : "Purchase Orders"}</span>
                  </CommandItem>
                </>
              )}
              <CommandItem onSelect={() => handleSelect("/procurement/receipts")}>
                <Scale className="me-2 h-4 w-4 text-slate-500" />
                <span>{isArabic ? "سندات استلام المشتريات" : "Goods Receipts (GRN)"}</span>
              </CommandItem>
              {(role === "owner" || role === "accountant") && (
                <CommandItem onSelect={() => handleSelect("/procurement/returns")}>
                  <RotateCcw className="me-2 h-4 w-4 text-slate-500" />
                  <span>{isArabic ? "إشعارات المدين والتعويض (DN)" : "Debit Notes & Compensation"}</span>
                </CommandItem>
              )}
            </CommandGroup>
          )}

          {(role === "owner" || role === "accountant") && (
            <CommandGroup heading={isArabic ? "المحاسبة والمالية" : "Accounting & Ledger"}>
              <CommandItem onSelect={() => handleSelect("/accounting/coa")}>
                <BookOpen className="me-2 h-4 w-4 text-slate-500" />
                <span>{t("nav.coa")}</span>
              </CommandItem>
              <CommandItem onSelect={() => handleSelect("/accounting/periods")}>
                <Calendar className="me-2 h-4 w-4 text-slate-500" />
                <span>{t("nav.periods")}</span>
              </CommandItem>
            </CommandGroup>
          )}

          <CommandGroup heading={isArabic ? "إعدادات النظام" : "System Actions"}>
            <CommandItem onSelect={toggleLanguage}>
              <Globe className="me-2 h-4 w-4 text-slate-500" />
              <span>{isArabic ? "Switch to English" : "التحويل للغة العربية"}</span>
            </CommandItem>
            <CommandItem
              onSelect={() => {
                setOpen(false);
                logout();
              }}
            >
              <LogOut className="me-2 h-4 w-4 text-rose-500" />
              <span className="text-rose-600">{t("auth.logout")}</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
