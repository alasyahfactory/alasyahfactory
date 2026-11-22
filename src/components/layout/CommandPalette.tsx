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
  FlaskConical,
  Droplets,
  PackageCheck,
  Factory,
  Layers,
  Receipt,
  FileText,
  Coins,
  Wrench,
  BarChart3,
  CreditCard,
  Lock,
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
        className="hidden md:flex items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3.5 py-1.5 text-xs text-slate-500 hover:bg-slate-100/90 hover:text-slate-800 hover:border-slate-300 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-sky-500/20 active:scale-95 min-w-[220px] justify-between"
      >
        <span className="font-normal">{t("common.search")}</span>
        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 font-mono text-[10px] font-semibold text-slate-600 shadow-sm">
          <span>⌘</span>K
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
              <CommandItem onSelect={() => handleSelect("/approvals")}>
                <ShieldCheck className="me-2 h-4 w-4 text-slate-500" />
                <span>{isArabic ? "مركز الاعتمادات والرقابة الإدارية" : "Approvals Center"}</span>
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
              <CommandItem onSelect={() => handleSelect("/inventory/stocktaking")}>
                <Layers className="me-2 h-4 w-4 text-slate-500" />
                <span>{isArabic ? "الجرد الفعلي المخزني والتسويات" : "Stocktaking & Reconciliation"}</span>
              </CommandItem>
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

          {(role === "owner" || role === "production" || role === "accountant") && (
            <CommandGroup heading={isArabic ? "التصنيع والتعبئة" : "Manufacturing & Packaging"}>
              <CommandItem onSelect={() => handleSelect("/manufacturing/formulas")}>
                <FlaskConical className="me-2 h-4 w-4 text-slate-500" />
                <span>{isArabic ? "معادلات وتركيبات الخلط (BOM)" : "Formulas & BOM"}</span>
              </CommandItem>
              <CommandItem onSelect={() => handleSelect("/manufacturing/specs")}>
                <Layers className="me-2 h-4 w-4 text-slate-500" />
                <span>{isArabic ? "مواصفات التعبئة والتغليف" : "Packaging Specs"}</span>
              </CommandItem>
              {(role === "owner" || role === "production") && (
                <>
                  <CommandItem onSelect={() => handleSelect("/manufacturing/mixing")}>
                    <Droplets className="me-2 h-4 w-4 text-slate-500" />
                    <span>{isArabic ? "تانكات الخلط والتشغيل الحية" : "Live Mixing Tanks"}</span>
                  </CommandItem>
                  <CommandItem onSelect={() => handleSelect("/manufacturing/packaging")}>
                    <PackageCheck className="me-2 h-4 w-4 text-slate-500" />
                    <span>{isArabic ? "أوامر التعبئة والملصقات الحرارية" : "Packaging Orders & Labels"}</span>
                  </CommandItem>
                  <CommandItem onSelect={() => handleSelect("/production")}>
                    <Factory className="me-2 h-4 w-4 text-slate-500" />
                    <span>{isArabic ? "بوابة مشرف الإنتاج (جوال)" : "Production Floor Shell"}</span>
                  </CommandItem>
                </>
              )}
            </CommandGroup>
          )}

          {(role === "owner" || role === "accountant") && (
            <CommandGroup heading={isArabic ? "المبيعات والفوترة (ZATCA)" : "Sales & ZATCA Invoicing"}>
              <CommandItem onSelect={() => handleSelect("/sales/customers")}>
                <Users className="me-2 h-4 w-4 text-slate-500" />
                <span>{isArabic ? "دليل العملاء والائتمان" : "Customers Directory"}</span>
              </CommandItem>
              <CommandItem onSelect={() => handleSelect("/sales/quotations")}>
                <FileText className="me-2 h-4 w-4 text-slate-500" />
                <span>{isArabic ? "عروض الأسعار والتحويل لفاتورة" : "Quotations"}</span>
              </CommandItem>
              <CommandItem onSelect={() => handleSelect("/sales/invoices")}>
                <Receipt className="me-2 h-4 w-4 text-slate-500" />
                <span>{isArabic ? "فواتير المبيعات الضريبية (ZATCA QR)" : "Sales Tax Invoices"}</span>
              </CommandItem>
              <CommandItem onSelect={() => handleSelect("/sales/returns")}>
                <RotateCcw className="me-2 h-4 w-4 text-slate-500" />
                <span>{isArabic ? "الإشعارات الدائنة والمرتجعات" : "Sales Credit Notes"}</span>
              </CommandItem>
              <CommandItem onSelect={() => handleSelect("/sales/van-custody")}>
                <Truck className="me-2 h-4 w-4 text-slate-500" />
                <span>{isArabic ? "تسوية وتحميل عهدة سيارات التوزيع" : "Van Custody Transfers"}</span>
              </CommandItem>
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
              <CommandItem onSelect={() => handleSelect("/accounting/journal-entries")}>
                <BookOpen className="me-2 h-4 w-4 text-slate-500" />
                <span>{isArabic ? "دفتر قيود اليومية العامة" : "Journal Entries"}</span>
              </CommandItem>
              <CommandItem onSelect={() => handleSelect("/accounting/vouchers")}>
                <Receipt className="me-2 h-4 w-4 text-slate-500" />
                <span>{isArabic ? "سندات القبض والصرف والتحويل" : "Vouchers"}</span>
              </CommandItem>
              <CommandItem onSelect={() => handleSelect("/accounting/checks")}>
                <CreditCard className="me-2 h-4 w-4 text-slate-500" />
                <span>{isArabic ? "حافظة الشيكات وأوراق القبض" : "Checks Portfolio"}</span>
              </CommandItem>
              <CommandItem onSelect={() => handleSelect("/accounting/reports")}>
                <FileText className="me-2 h-4 w-4 text-slate-500" />
                <span>{isArabic ? "التقارير المالية وإقرار ZATCA" : "Financial Reports"}</span>
              </CommandItem>
              {role === "owner" && (
                <CommandItem onSelect={() => handleSelect("/accounting/year-end")}>
                  <Lock className="me-2 h-4 w-4 text-slate-500" />
                  <span>{isArabic ? "معالج الإقفال السنوي (3201)" : "Year-End Closing"}</span>
                </CommandItem>
              )}
            </CommandGroup>
          )}

          {(role === "owner" || role === "accountant") && (
            <CommandGroup heading={isArabic ? "الموارد البشرية والرواتب" : "HR & Payroll"}>
              <CommandItem onSelect={() => handleSelect("/hr/employees")}>
                <Users className="me-2 h-4 w-4 text-slate-500" />
                <span>{isArabic ? "دليل الموظفين وشؤون العاملين" : "Employees Directory"}</span>
              </CommandItem>
              <CommandItem onSelect={() => handleSelect("/hr/payroll")}>
                <Coins className="me-2 h-4 w-4 text-slate-500" />
                <span>{isArabic ? "مسيرات الرواتب الشهرية" : "Payroll Runs"}</span>
              </CommandItem>
              <CommandItem onSelect={() => handleSelect("/hr/advances")}>
                <CreditCard className="me-2 h-4 w-4 text-slate-500" />
                <span>{isArabic ? "سُلف الموظفين والأقساط" : "Employee Advances"}</span>
              </CommandItem>
            </CommandGroup>
          )}

          {(role === "owner" || role === "accountant") && (
            <CommandGroup heading={isArabic ? "الأصول الثابتة والرقابة" : "Fixed Assets & Analytics"}>
              <CommandItem onSelect={() => handleSelect("/assets/registry")}>
                <Wrench className="me-2 h-4 w-4 text-slate-500" />
                <span>{isArabic ? "سجل الأصول الثابتة والإهلاك" : "Fixed Assets Registry"}</span>
              </CommandItem>
              {role === "owner" && (
                <CommandItem onSelect={() => handleSelect("/reports/director-analytics")}>
                  <BarChart3 className="me-2 h-4 w-4 text-slate-500" />
                  <span>{isArabic ? "التقارير التحليلية الخمسة للمدير" : "Director Analytics"}</span>
                </CommandItem>
              )}
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
