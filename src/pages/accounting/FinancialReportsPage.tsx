import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import {
  FileText,
  Calendar,
  Download,
  Printer,
  FileDown,
  Share2,
  Scale,
  TrendingUp,
  Building,
  FileCheck2,
  ListOrdered,
  Clock,
  ArrowUpDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { TrialBalanceRow, IncomeStatementData, BalanceSheetData, VatReturnData, Account } from "@/types/database";

export function FinancialReportsPage() {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";

  const today = new Date();
  const firstDayOfYear = `${today.getFullYear()}-01-01`;
  const todayStr = today.toISOString().split("T")[0];

  const [startDate, setStartDate] = useState<string>(firstDayOfYear);
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [activeTab, setActiveTab] = useState<"trial_balance" | "income_statement" | "balance_sheet" | "vat_return" | "ledger" | "aging">("trial_balance");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");

  // Quick Date Selectors
  const setThisMonth = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    setStartDate(firstDay);
    setEndDate(todayStr);
  };

  const setThisQuarter = () => {
    const now = new Date();
    const qMonth = Math.floor(now.getMonth() / 3) * 3;
    const firstDay = new Date(now.getFullYear(), qMonth, 1).toISOString().split("T")[0];
    setStartDate(firstDay);
    setEndDate(todayStr);
  };

  const setYearToDate = () => {
    setStartDate(firstDayOfYear);
    setEndDate(todayStr);
  };

  // Fetch High-Performance Financial Reports Data from RPC
  const { data: reportData, isLoading, refetch } = useQuery<{
    trial_balance: TrialBalanceRow[];
    income_statement: IncomeStatementData;
    balance_sheet: BalanceSheetData;
    vat_return: VatReturnData;
  }>({
    queryKey: ["financial_reports_rpc", startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_get_financial_reports", {
        p_start_date: startDate,
        p_end_date: endDate,
      });
      if (error) throw error;
      return data;
    },
  });

  // Fetch Accounts for General Ledger selector
  const { data: accounts } = useQuery<Account[]>({
    queryKey: ["all_accounts_for_reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .neq("type", "header")
        .order("code", { ascending: true });
      if (error) throw error;
      return (data || []) as Account[];
    },
  });

  // Fetch Ledger movements if specific account selected
  const { data: ledgerLines } = useQuery({
    queryKey: ["account_ledger_lines", selectedAccountId, startDate, endDate],
    enabled: !!selectedAccountId && activeTab === "ledger",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journal_lines")
        .select(`
          *,
          journal_entry:journal_entries(entry_number, entry_date, description, ref_type)
        `)
        .eq("account_id", selectedAccountId)
        .order("journal_entry(entry_date)", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch Customers for Aging
  const { data: customerAging } = useQuery({
    queryKey: ["customer_debt_aging"],
    enabled: activeTab === "aging",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_invoices")
        .select(`
          id, invoice_number, invoice_date, due_date, net_amount_due, paid_amount, payment_status,
          customer:customers(name_ar, customer_code)
        `)
        .neq("payment_status", "paid")
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Excel Export Handler using SheetJS
  const exportToExcel = () => {
    if (!reportData) return;
    let wsData: any[] = [];
    let fileName = `تقرير_مالي_${todayStr}.xlsx`;

    if (activeTab === "trial_balance") {
      fileName = `ميزان_المراجعة_${startDate}_${endDate}.xlsx`;
      wsData = reportData.trial_balance.map((row) => ({
        "كود الحساب": row.code,
        "اسم الحساب": row.name_ar,
        "النوع": row.type,
        "حركة مدين للفترة": row.period_debit,
        "حركة دائن للفترة": row.period_credit,
        "الرصيد الختامي": row.ending_balance,
      }));
    } else if (activeTab === "vat_return") {
      fileName = `إقرار_ضريبة_القيمة_المضافة_${startDate}_${endDate}.xlsx`;
      wsData = [
        { "البند الضريبي": "إجمالي المبيعات الخاضعة للضريبة 15%", "المبلغ الخاضع": reportData.vat_return.sales_taxable, "الضريبة المستحقة": reportData.vat_return.sales_vat },
        { "البند الضريبي": "إجمالي المشتريات الخاضعة للضريبة 15%", "المبلغ الخاضع": reportData.vat_return.purchases_taxable, "الضريبة القابلة للاسترداد": reportData.vat_return.purchases_vat },
        { "البند الضريبي": "صافي الضريبة المستحقة للهيئة (ZATCA)", "المبلغ الخاضع": "-", "الضريبة المستحقة": reportData.vat_return.net_vat_due },
      ];
    } else if (activeTab === "income_statement") {
      fileName = `قائمة_الدخل_${startDate}_${endDate}.xlsx`;
      wsData = [
        { "البند": "إجمالي إيرادات المبيعات", "المبلغ (SAR)": reportData.income_statement.total_revenue },
        { "البند": "تكلفة البضاعة المباعة (FIFO)", "المبلغ (SAR)": reportData.income_statement.total_cogs },
        { "البند": "مجمل الربح (Gross Profit)", "المبلغ (SAR)": reportData.income_statement.gross_profit },
        { "البند": "إجمالي المصروفات التشغيلية", "المبلغ (SAR)": reportData.income_statement.total_opex },
        { "البند": "صافي الربح التشغيلي", "المبلغ (SAR)": reportData.income_statement.net_profit },
      ];
    }

    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Financial Report");
    XLSX.writeFile(wb, fileName);
    toast.success(isArabic ? "تم تصدير ملف Excel بنجاح" : "Exported to Excel successfully");
  };

  const handlePrint = () => {
    window.print();
  };

  const handleShareWhatsApp = () => {
    const reportNames: Record<string, string> = {
      trial_balance: "ميزان المراجعة بالمجاميع والأرصدة",
      income_statement: "قائمة الدخل والأرباح والخسائر (P&L)",
      balance_sheet: "الميزانية العمومية والمركز المالي",
      vat_return: "إقرار ضريبة القيمة المضافة (ZATCA)",
      general_ledger: "كشف حساب الأستاذ العام",
      aging_receivables: "أعمار ديون العملاء",
    };
    const rName = reportNames[activeTab] || "التقرير المالي";
    const msg = `*${rName}*
الفترة: من ${startDate} إلى ${endDate}
_صادر من النظام المالي - مصنع الأسياح للمنتجات الكيميائية_`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <FileText className="h-6 w-6 text-industrial-accent" />
            {isArabic ? "التقارير المالية والقوائم الختامية" : "Financial & Tax Reports"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isArabic
              ? "ميزان المراجعة، قائمة الدخل، الميزانية العمومية، إقرار الزكاة والضريبة ZATCA، وكشوف الحسابات"
              : "Trial balance, P&L, balance sheet, VAT return, and general ledger statements"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportToExcel}
            className="gap-1.5 text-xs font-semibold text-emerald-800 border-emerald-300 hover:bg-emerald-50"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{isArabic ? "تصدير Excel (SheetJS)" : "Export Excel"}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="gap-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>{isArabic ? "طباعة A4" : "Print A4"}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="gap-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50"
          >
            <FileDown className="h-3.5 w-3.5" />
            <span>{isArabic ? "حفظ PDF" : "Save PDF"}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleShareWhatsApp}
            className="gap-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
          >
            <Share2 className="h-3.5 w-3.5" />
            <span>{isArabic ? "مشاركة واتساب" : "WhatsApp"}</span>
          </Button>
        </div>
      </div>

      {/* Date Filter Bar */}
      <Card className="border-industrial-border bg-white shadow-sm">
        <CardContent className="p-3.5 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full md:w-auto">
            <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">من:</span>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-8 text-xs font-mono w-36 bg-slate-50 border-industrial-border"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">إلى:</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-8 text-xs font-mono w-36 bg-slate-50 border-industrial-border"
              />
            </div>
          </div>

          {/* Quick Date Shortcuts */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={setThisMonth}
              className="px-2.5 py-1 text-xs font-medium rounded border border-industrial-border bg-slate-50 hover:bg-slate-100 text-slate-700"
            >
              هذا الشهر
            </button>
            <button
              onClick={setThisQuarter}
              className="px-2.5 py-1 text-xs font-medium rounded border border-industrial-border bg-slate-50 hover:bg-slate-100 text-slate-700"
            >
              الربع الحالي
            </button>
            <button
              onClick={setYearToDate}
              className="px-2.5 py-1 text-xs font-medium rounded border border-industrial-border bg-slate-50 hover:bg-slate-100 text-slate-700"
            >
              منذ بداية السنة
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg border border-industrial-border overflow-x-auto">
        <button
          onClick={() => setActiveTab("trial_balance")}
          className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === "trial_balance" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Scale className="h-3.5 w-3.5" />
          <span>ميزان المراجعة (Trial Balance)</span>
        </button>

        <button
          onClick={() => setActiveTab("income_statement")}
          className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === "income_statement" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <TrendingUp className="h-3.5 w-3.5" />
          <span>قائمة الدخل والأرباح (P&L)</span>
        </button>

        <button
          onClick={() => setActiveTab("balance_sheet")}
          className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === "balance_sheet" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Building className="h-3.5 w-3.5" />
          <span>الميزانية العمومية (Balance Sheet)</span>
        </button>

        <button
          onClick={() => setActiveTab("vat_return")}
          className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === "vat_return" ? "bg-emerald-700 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <FileCheck2 className="h-3.5 w-3.5" />
          <span>الإقرار الضريبي (ZATCA VAT 15%)</span>
        </button>

        <button
          onClick={() => setActiveTab("ledger")}
          className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === "ledger" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <ListOrdered className="h-3.5 w-3.5" />
          <span>كشف الحساب العام (General Ledger)</span>
        </button>

        <button
          onClick={() => setActiveTab("aging")}
          className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === "aging" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Clock className="h-3.5 w-3.5" />
          <span>أعمار الديون (Aging)</span>
        </button>
      </div>

      {/* Tab 1: Trial Balance */}
      {activeTab === "trial_balance" && (
        <Card className="border-industrial-border bg-white shadow-sm overflow-hidden">
          <CardHeader className="py-3 px-4 border-b border-industrial-border bg-slate-50 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold text-slate-800">
              ميزان المراجعة بالأرصدة والحركات ({startDate} إلى {endDate})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start border-collapse">
                <thead>
                  <tr className="border-b border-industrial-border bg-slate-100/75 text-slate-700 font-semibold">
                    <th className="py-2.5 px-3 text-start">رقم الحساب</th>
                    <th className="py-2.5 px-3 text-start">اسم الحساب</th>
                    <th className="py-2.5 px-3 text-start">النوع</th>
                    <th className="py-2.5 px-3 text-end">حركة مدين للفترة</th>
                    <th className="py-2.5 px-3 text-end">حركة دائن للفترة</th>
                    <th className="py-2.5 px-3 text-end">الرصيد الختامي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-industrial-border">
                  {isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={6} className="p-3">
                          <Skeleton className="h-5 w-full" />
                        </td>
                      </tr>
                    ))
                  ) : (
                    reportData?.trial_balance.map((row) => (
                      <tr key={row.account_id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2 px-3 font-mono font-bold text-slate-900">{row.code}</td>
                        <td className="py-2 px-3 text-slate-900 font-medium">{row.name_ar}</td>
                        <td className="py-2 px-3 text-slate-500 font-mono text-[11px]">{row.type}</td>
                        <td className="py-2 px-3 text-end font-mono tabular-nums text-slate-900 font-medium">
                          {row.period_debit > 0 ? `${row.period_debit.toFixed(2)} ر.س` : "-"}
                        </td>
                        <td className="py-2 px-3 text-end font-mono tabular-nums text-slate-900 font-medium">
                          {row.period_credit > 0 ? `${row.period_credit.toFixed(2)} ر.س` : "-"}
                        </td>
                        <td className="py-2 px-3 text-end font-mono tabular-nums font-bold text-slate-900">
                          {row.ending_balance.toFixed(2)} ر.س
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 2: Income Statement */}
      {activeTab === "income_statement" && reportData && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-industrial-border bg-white shadow-sm p-4 space-y-4">
            <h3 className="font-bold text-slate-900 border-b pb-2 flex items-center justify-between">
              <span>قائمة الدخل التشغيلية (Statement of Income)</span>
              <Badge variant="emerald">معتمد</Badge>
            </h3>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="font-semibold text-slate-700">1. إجمالي إيرادات المبيعات (4101)</span>
                <span className="font-mono font-bold text-slate-900">{reportData.income_statement.total_revenue.toFixed(2)} ر.س</span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-slate-100 text-rose-700">
                <span className="font-semibold">2. تكلفة البضاعة المباعة (FIFO) (5101)</span>
                <span className="font-mono font-bold">({reportData.income_statement.total_cogs.toFixed(2)}) ر.س</span>
              </div>

              <div className="flex justify-between items-center py-2.5 bg-emerald-50 px-3 rounded-lg border border-emerald-200">
                <span className="font-bold text-emerald-900">= مجمل الربح (Gross Profit)</span>
                <span className="font-mono font-black text-emerald-700 text-base">
                  {reportData.income_statement.gross_profit.toFixed(2)} ر.س
                </span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-slate-100 text-slate-700">
                <span className="font-semibold">3. إجمالي المصروفات التشغيلية (6101..6109)</span>
                <span className="font-mono font-bold text-rose-600">({reportData.income_statement.total_opex.toFixed(2)}) ر.س</span>
              </div>

              <div className="flex justify-between items-center py-3 bg-slate-900 text-white px-3 rounded-lg">
                <span className="font-bold text-base">= صافي الربح التشغيلي للفترة (Net Profit)</span>
                <span className="font-mono font-black text-lg text-emerald-400">
                  {reportData.income_statement.net_profit.toFixed(2)} ر.س
                </span>
              </div>
            </div>
          </Card>

          {/* Profitability KPIs */}
          <div className="space-y-4">
            <Card className="border-industrial-border bg-white shadow-sm p-4">
              <span className="text-xs text-slate-500 font-semibold block">هامش مجمل الربح (Gross Margin %)</span>
              <div className="font-mono font-black text-3xl text-emerald-700 mt-1">
                {reportData.income_statement.total_revenue > 0
                  ? ((reportData.income_statement.gross_profit / reportData.income_statement.total_revenue) * 100).toFixed(1)
                  : "0.0"}%
              </div>
              <p className="text-xs text-slate-400 mt-1">نسبة مجمل الربح من إجمالي المبيعات الصناعية</p>
            </Card>

            <Card className="border-industrial-border bg-white shadow-sm p-4">
              <span className="text-xs text-slate-500 font-semibold block">هامش صافي الربح (Net Margin %)</span>
              <div className="font-mono font-black text-3xl text-slate-900 mt-1">
                {reportData.income_statement.total_revenue > 0
                  ? ((reportData.income_statement.net_profit / reportData.income_statement.total_revenue) * 100).toFixed(1)
                  : "0.0"}%
              </div>
              <p className="text-xs text-slate-400 mt-1">صافي الأرباح المحققة بعد خصم كافة مصاريف التشغيل والرواتب والإهلاك</p>
            </Card>
          </div>
        </div>
      )}

      {/* Tab 3: Balance Sheet */}
      {activeTab === "balance_sheet" && reportData && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-industrial-border bg-white shadow-sm p-4 space-y-4">
            <h3 className="font-bold text-slate-900 border-b pb-2 flex items-center justify-between">
              <span>الأصول (Assets)</span>
              <span className="font-mono text-emerald-700 font-bold">{reportData.balance_sheet.total_assets.toFixed(2)} ر.س</span>
            </h3>
            <p className="text-xs text-slate-500">
              تشمل النقدية بالصناديق والبنوك، ذمم العملاء المدينة، مخزون الخامات والتام، والأصول الثابتة مخصوماً منها مجمع الإهلاك.
            </p>
            <div className="p-3 bg-slate-50 rounded border text-xs flex justify-between font-bold">
              <span>إجمالي قيمة الأصول</span>
              <span className="font-mono text-slate-900">{reportData.balance_sheet.total_assets.toFixed(2)} ر.س</span>
            </div>
          </Card>

          <Card className="border-industrial-border bg-white shadow-sm p-4 space-y-4">
            <h3 className="font-bold text-slate-900 border-b pb-2 flex items-center justify-between">
              <span>الخصوم وحقوق الملكية (Liabilities & Equity)</span>
              <span className="font-mono text-slate-900 font-bold">
                {(reportData.balance_sheet.total_liabilities + reportData.balance_sheet.total_equity).toFixed(2)} ر.س
              </span>
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b">
                <span className="text-slate-600">إجمالي الالتزامات (موردين + ضريبة + رواتب مستحقة):</span>
                <span className="font-mono font-bold text-slate-900">{reportData.balance_sheet.total_liabilities.toFixed(2)} ر.س</span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span className="text-slate-600">حقوق الملكية ورأس المال:</span>
                <span className="font-mono font-bold text-slate-900">{reportData.balance_sheet.total_equity.toFixed(2)} ر.س</span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span className="text-slate-600">أرباح الفترة الحالية المنقولة:</span>
                <span className="font-mono font-bold text-emerald-700">{reportData.balance_sheet.retained_earnings_current.toFixed(2)} ر.س</span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 4: ZATCA VAT Return */}
      {activeTab === "vat_return" && reportData && (
        <Card className="border-industrial-border bg-white shadow-sm overflow-hidden">
          <CardHeader className="py-3 px-4 border-b border-industrial-border bg-slate-50 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <FileCheck2 className="h-4 w-4 text-emerald-700" />
              <span>إقرار ضريبة القيمة المضافة (ZATCA VAT Return 15%) — الفترة {startDate} إلى {endDate}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="border border-industrial-border rounded-lg overflow-hidden">
              <table className="w-full text-xs text-start border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-industrial-border text-slate-700 font-semibold">
                    <th className="py-2.5 px-3 text-start">بند الإقرار الضريبي</th>
                    <th className="py-2.5 px-3 text-end">المبلغ الخاضع للضريبة (SAR)</th>
                    <th className="py-2.5 px-3 text-end">مبلغ الضريبة 15% (SAR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-industrial-border">
                  <tr>
                    <td className="py-3 px-3 font-bold text-slate-900">
                      1. المبيعات الخاضعة للنسبة الأساسية (15%) - مخرجات الضريبة
                    </td>
                    <td className="py-3 px-3 text-end font-mono tabular-nums font-bold text-slate-900">
                      {reportData.vat_return.sales_taxable.toFixed(2)} ر.س
                    </td>
                    <td className="py-3 px-3 text-end font-mono tabular-nums font-black text-emerald-700">
                      {reportData.vat_return.sales_vat.toFixed(2)} ر.س
                    </td>
                  </tr>

                  <tr>
                    <td className="py-3 px-3 font-bold text-slate-900">
                      2. المشتريات الخاضعة للنسبة الأساسية (15%) - مدخلات الضريبة القابلة للاسترداد
                    </td>
                    <td className="py-3 px-3 text-end font-mono tabular-nums font-bold text-slate-900">
                      {reportData.vat_return.purchases_taxable.toFixed(2)} ر.س
                    </td>
                    <td className="py-3 px-3 text-end font-mono tabular-nums font-black text-rose-700">
                      ({reportData.vat_return.purchases_vat.toFixed(2)}) ر.س
                    </td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="bg-slate-900 text-white font-bold text-sm">
                    <td className="py-3 px-3">
                      صافي الضريبة المستحقة للسداد لهيئة الزكاة والضريبة والجمارك (ZATCA)
                    </td>
                    <td className="py-3 px-3 text-end font-mono">-</td>
                    <td className="py-3 px-3 text-end font-mono text-emerald-400 font-black">
                      {reportData.vat_return.net_vat_due.toFixed(2)} ر.س
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <p className="text-xs text-slate-500">
              * تم احتساب هذا الإقرار آلياً بناءً على فواتير المبيعات الضريبية وفواتير المشتريات ومردوداتها الصادرة خلال الفترة المحددة.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Tab 5: General Ledger */}
      {activeTab === "ledger" && (
        <Card className="border-industrial-border bg-white shadow-sm overflow-hidden">
          <CardHeader className="py-3 px-4 border-b border-industrial-border bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-sm font-bold text-slate-800">
              كشف الحساب التفصيلي (General Ledger Account Statement)
            </CardTitle>
            <div className="w-full sm:w-80">
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full h-8 px-2 rounded border border-industrial-border bg-white text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="">اختر حساباً لعرض كشف الحركة...</option>
                {accounts?.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name_ar}
                  </option>
                ))}
              </select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {!selectedAccountId ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                يرجى اختيار حساب مالي من القائمة أعلاه لعرض كشف حركته التفصيلي
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-start border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-industrial-border text-slate-700 font-semibold">
                      <th className="py-2.5 px-3 text-start">التاريخ</th>
                      <th className="py-2.5 px-3 text-start">رقم القيد</th>
                      <th className="py-2.5 px-3 text-start">البيان والشرح</th>
                      <th className="py-2.5 px-3 text-end">مدين (Debit)</th>
                      <th className="py-2.5 px-3 text-end">دائن (Credit)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-industrial-border">
                    {ledgerLines?.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-400">
                          لا توجد حركات مسجلة لهذا الحساب خلال الفترة المحددة
                        </td>
                      </tr>
                    ) : (
                      ledgerLines?.map((line: any) => (
                        <tr key={line.id} className="hover:bg-slate-50/70">
                          <td className="py-2 px-3 font-mono text-slate-600">
                            {line.journal_entry?.entry_date}
                          </td>
                          <td className="py-2 px-3 font-mono font-bold text-slate-900">
                            {line.journal_entry?.entry_number}
                          </td>
                          <td className="py-2 px-3 text-slate-800">
                            {line.description || line.journal_entry?.description}
                          </td>
                          <td className="py-2 px-3 text-end font-mono tabular-nums font-bold text-emerald-800">
                            {line.debit > 0 ? `${line.debit.toFixed(2)} ر.س` : "-"}
                          </td>
                          <td className="py-2 px-3 text-end font-mono tabular-nums font-bold text-slate-800">
                            {line.credit > 0 ? `${line.credit.toFixed(2)} ر.س` : "-"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab 6: Customer Aging */}
      {activeTab === "aging" && (
        <Card className="border-industrial-border bg-white shadow-sm overflow-hidden">
          <CardHeader className="py-3 px-4 border-b border-industrial-border bg-slate-50">
            <CardTitle className="text-sm font-bold text-slate-800">
              تقرير أعمار ديون العملاء والفواتير الآجلة غير المسددة
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-industrial-border text-slate-700 font-semibold">
                    <th className="py-2.5 px-3 text-start">رقم الفاتورة</th>
                    <th className="py-2.5 px-3 text-start">العميل</th>
                    <th className="py-2.5 px-3 text-start">تاريخ الفاتورة</th>
                    <th className="py-2.5 px-3 text-start">تاريخ الاستحقاق</th>
                    <th className="py-2.5 px-3 text-end">إجمالي المستحق</th>
                    <th className="py-2.5 px-3 text-end">المسدد</th>
                    <th className="py-2.5 px-3 text-end">المتبقي</th>
                    <th className="py-2.5 px-3 text-center">فترة التأخير</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-industrial-border">
                  {customerAging?.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-slate-400">
                        لا توجد فواتير آجلة متأخرة السداد حالياً
                      </td>
                    </tr>
                  ) : (
                    customerAging?.map((inv: any) => {
                      const due = new Date(inv.due_date);
                      const diffDays = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
                      const remaining = inv.net_amount_due - inv.paid_amount;

                      return (
                        <tr key={inv.id} className="hover:bg-slate-50/70">
                          <td className="py-2 px-3 font-mono font-bold text-slate-900">{inv.invoice_number}</td>
                          <td className="py-2 px-3 font-medium text-slate-900">{inv.customer?.name_ar}</td>
                          <td className="py-2 px-3 font-mono text-slate-600">{inv.invoice_date}</td>
                          <td className="py-2 px-3 font-mono text-slate-600">{inv.due_date}</td>
                          <td className="py-2 px-3 text-end font-mono tabular-nums font-bold text-slate-900">{inv.net_amount_due.toFixed(2)} ر.س</td>
                          <td className="py-2 px-3 text-end font-mono tabular-nums text-emerald-700">{inv.paid_amount.toFixed(2)} ر.س</td>
                          <td className="py-2 px-3 text-end font-mono tabular-nums font-bold text-rose-700">{remaining.toFixed(2)} ر.س</td>
                          <td className="py-2 px-3 text-center">
                            {diffDays <= 0 ? (
                              <Badge variant="emerald" className="text-[10px]">لم تستحق بعد</Badge>
                            ) : diffDays <= 30 ? (
                              <Badge variant="secondary" className="text-[10px]">1 - 30 يوماً</Badge>
                            ) : diffDays <= 60 ? (
                              <Badge variant="amber" className="text-[10px]">31 - 60 يوماً</Badge>
                            ) : (
                              <Badge variant="rose" className="text-[10px]">متأخرة (+60 يوماً)</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
