import { printDocumentHtml, saveDocumentPdfFromHtml, shareDocumentWhatsApp } from "@/utils/printAndPdf";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import {
  CreditCard,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRight,
  Building2,
  Calendar,
  Printer,
  FileDown,
  Share2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { CheckAndNote, Account } from "@/types/database";

export function ChecksPage() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const isArabic = i18n.language === "ar";

  const [activeTab, setActiveTab] = useState<"received" | "issued">("received");
  const [searchTerm, setSearchTerm] = useState("");
  const [collectModalOpen, setCollectModalOpen] = useState(false);
  const [selectedCheck, setSelectedCheck] = useState<CheckAndNote | null>(null);

  // Collect Check Form State
  const [collectionAccount, setCollectionAccount] = useState<string>("");
  const [collectionDate, setCollectionDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );

  // Fetch Bank Accounts for Deposit
  const { data: bankAccounts } = useQuery<Account[]>({
    queryKey: ["bank_accounts_for_checks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .in("code", ["1101", "1102", "1103"])
        .eq("is_active", true);
      if (error) throw error;
      return (data || []) as Account[];
    },
  });

  // Fetch Checks
  const { data: checks, isLoading } = useQuery<CheckAndNote[]>({
    queryKey: ["checks_list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checks_and_notes")
        .select(`
          *,
          customer:customers(name_ar, customer_code),
          supplier:suppliers(name_ar, code)
        `)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return (data || []) as CheckAndNote[];
    },
  });

  // Collect Check Mutation
  const collectMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCheck) return;
      const { data, error } = await supabase.rpc("rpc_collect_check", {
        p_check_id: selectedCheck.id,
        p_collection_account_id: collectionAccount,
        p_collection_date: collectionDate,
        p_created_by: user?.id,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(isArabic ? "تم تحصيل الشيك وإيداعه بنجاح" : "Check collected successfully");
      queryClient.invalidateQueries({ queryKey: ["checks_list"] });
      queryClient.invalidateQueries({ queryKey: ["journal_entries_list"] });
      queryClient.invalidateQueries({ queryKey: ["coa_accounts"] });
      setCollectModalOpen(false);
      setSelectedCheck(null);
    },
    onError: (err: any) => {
      toast.error(err.message || (isArabic ? "فشل تحصيل الشيك" : "Failed to collect check"));
    },
  });

  const todayStr = new Date().toISOString().split("T")[0];

  const filteredChecks = checks?.filter((c) => {
    const matchesTab = c.check_type === activeTab;
    const matchesSearch =
      c.check_number.includes(searchTerm) ||
      c.bank_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.customer?.name_ar && c.customer.name_ar.includes(searchTerm)) ||
      (c.supplier?.name_ar && c.supplier.name_ar.includes(searchTerm));
    return matchesTab && matchesSearch;
  });


  
  const getCheckHtml = (chk: CheckAndNote) => {
    const isRec = chk.check_type === "received";
    const docTitle = `حافظة شيك بنكي - ${chk.check_number}`;
    return `
      <!DOCTYPE html>
      <html dir="${isArabic ? "rtl" : "ltr"}" lang="${isArabic ? "ar" : "en"}">
        <head>
          <meta charset="utf-8" />
          <title>${docTitle}</title>
          <style>
            @page { size: A4 portrait; margin: 12mm; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "IBM Plex Sans Arabic", sans-serif; color: #0f172a; background: #fff; margin: 0; padding: 0; font-size: 12px; }
            .header-grid { display: grid; grid-template-columns: 1fr auto 1fr; gap: 16px; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; }
            .chk-badge { display: inline-block; padding: 4px 14px; background: #0f172a; color: #fff; font-weight: bold; font-size: 16px; border-radius: 4px; }
            .meta-card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 16px; background: #f8fafc; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; font-size: 12px; }
            .amount-box { border: 2px solid #0f172a; background: #f1f5f9; padding: 16px; border-radius: 6px; text-align: center; margin-bottom: 24px; }
            .tabular { font-family: monospace; font-variant-numeric: tabular-nums; }
            .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; text-align: center; }
            .sig-box { border-top: 1px dashed #94a3b8; padding-top: 8px; font-size: 11px; }
          </style>
        </head>
        <body>
          <div class="header-grid">
            <div style="text-align: ${isArabic ? "right" : "left"};">
              <div style="font-weight: bold; font-size: 15px;">مصنع الأسياح للمنتجات الكيميائية</div>
              <div style="font-size: 11px; color: #64748b;">سجل تجاري: 1010000000 | الرقم الضريبي: 300000000000003</div>
              <div style="font-size: 11px; color: #64748b;">قسم الخزينة وأوراق القبض والدفع</div>
            </div>
            <div style="text-align: center;">
              <div class="chk-badge">${isRec ? "حافظة شيك بنكي وارد (قبض)" : "حافظة شيك بنكي صادر (صرف)"}</div>
              <div style="font-size: 13px; font-family: monospace; font-weight: bold; margin-top: 4px;">${chk.check_number}</div>
            </div>
            <div style="text-align: ${isArabic ? "left" : "right"}; direction: ltr;">
              <div style="font-weight: bold; font-size: 14px;">Al-Asyah Chemical Factory</div>
              <div style="font-size: 11px; color: #64748b;">Treasury & Banking Voucher</div>
              <div style="font-size: 11px; color: #64748b;">Due Date: ${chk.due_date}</div>
            </div>
          </div>

          <div class="amount-box">
            <span style="font-size: 12px; color: #64748b; font-weight: bold;">مبلغ وقيمة الشيك:</span>
            <div style="font-size: 24px; font-weight: bold; margin-top: 4px;">
              <span class="tabular">${chk.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span> ريال سعودي
            </div>
          </div>

          <div class="meta-card">
            <div>
              <span style="color: #64748b; display: block; margin-bottom: 2px;">البنك المسحوب عليه:</span>
              <strong style="font-size: 13px;">${chk.bank_name}</strong>
            </div>
            <div>
              <span style="color: #64748b; display: block; margin-bottom: 2px;">الطرف المعني (العميل / المورد):</span>
              <strong style="font-size: 13px;">${chk.customer?.name_ar || chk.supplier?.name_ar || "-"}</strong>
            </div>
            <div>
              <span style="color: #64748b; display: block; margin-bottom: 2px;">تاريخ الاستحقاق والصرف:</span>
              <strong class="tabular" style="font-size: 13px;">${chk.due_date}</strong>
            </div>
            <div>
              <span style="color: #64748b; display: block; margin-bottom: 2px;">الحالة البنكية الحالية:</span>
              <strong style="font-size: 13px;">${chk.status === "collected" ? "تم التحصيل والإيداع" : chk.status === "bounced" ? "مرتد / مرفوض" : "برسم التحصيل بالمحفظة"}</strong>
            </div>
          </div>

          <div class="signatures">
            <div class="sig-box">
              <div style="font-weight: bold; margin-bottom: 35px;">أمين الخزينة وحافظة الشيكات</div>
              <div>التوقيع: ............................</div>
            </div>
            <div class="sig-box">
              <div style="font-weight: bold; margin-bottom: 35px;">اعتماد المدير المالي</div>
              <div>الختم والتوقيع: ............................</div>
            </div>
          </div>

          
        </body>
      </html>
    `;
  };

  const handlePrintCheck = (chk: CheckAndNote) => {
    printDocumentHtml(getCheckHtml(chk), `حافظة_شيك_${chk.check_number}`);
  };

  const handleSavePdfCheck = (chk: CheckAndNote) => {
    saveDocumentPdfFromHtml(getCheckHtml(chk), `حافظة_شيك_${chk.check_number}`);
  };

  const handleShareWhatsapp = (chk: CheckAndNote) => {
    const party = chk.customer?.name_ar || chk.supplier?.name_ar || "-";
    const msg = `*إشعار شيك بنكي (محفظة الشيكات)*
رقم الشيك: ${chk.check_number}
البنك: ${chk.bank_name}
الطرف: ${party}
المبلغ: ${chk.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} ريال سعودي
تاريخ الاستحقاق: ${chk.due_date}
النوع: ${chk.check_type === "received" ? "شيك وارد (قبض)" : "شيك صادر (صرف)"}
_مصنع الأسياح للمنتجات الكيميائية - إدارة الحسابات والخزينة_`;

    const encoded = encodeURIComponent(msg);
    const waUrl = `https://api.whatsapp.com/send?text=${encoded}`;
    window.open(waUrl, "_blank");
  };

  // Full-page in-place Canvas for Check Collection / Deposit
  if (collectModalOpen && selectedCheck) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto pb-16 animate-in fade-in duration-200">
        {/* Top Header Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3">
            <Button
              variant="tonal"
              size="sm"
              onClick={() => {
                setCollectModalOpen(false);
                setSelectedCheck(null);
              }}
              className="gap-1.5"
            >
              <ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
              <span>العودة لحافظة الشيكات</span>
            </Button>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-700" />
                <span>
                  {selectedCheck.check_type === "received" ? "تحصيل وإيداع الشيك البنكي" : "إثبات صرف الشيك الصادر"}
                </span>
                <span className="font-mono text-xs text-slate-500 font-normal">
                  (رقم: {selectedCheck.check_number})
                </span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                تأكيد الإيداع في الحساب البنكي وإنشاء القيود المحاسبية التلقائية
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePrintCheck(selectedCheck)}
              className="gap-1.5"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              <span>{isArabic ? "طباعة A4" : "Print A4"}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSavePdfCheck(selectedCheck)}
              className="gap-1.5"
            >
              <FileDown className="w-4 h-4 text-sky-600" />
              <span>{isArabic ? "حفظ PDF" : "Save PDF"}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleShareWhatsapp(selectedCheck)}
              className="gap-1.5 text-emerald-700 hover:text-emerald-800"
            >
              <Share2 className="w-4 h-4 text-emerald-600" />
              <span>{isArabic ? "مشاركة واتساب" : "WhatsApp"}</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setCollectModalOpen(false);
                setSelectedCheck(null);
              }}
              disabled={collectMutation.isPending}
            >
              إلغاء
            </Button>
            <Button
              onClick={() => collectMutation.mutate()}
              disabled={!collectionAccount || collectMutation.isPending}
              className="bg-emerald-700 hover:bg-emerald-800 text-white min-h-[40px] px-6 font-semibold"
            >
              {collectMutation.isPending ? "جاري الترحيل..." : "تأكيد التحصيل وترحيل القيد"}
            </Button>
          </div>
        </div>

        {/* Check Details & Deposit Card */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-800">بيانات الشيك الحالي</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                  <span className="text-slate-500">رقم الشيك:</span>
                  <span className="font-mono font-bold text-slate-900 text-sm">{selectedCheck.check_number}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">البنك المسحوب عليه:</span>
                  <strong className="text-slate-800 flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-slate-400" />
                    <span>{selectedCheck.bank_name}</span>
                  </strong>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">الطرف المقابل:</span>
                  <strong className="text-slate-800">
                    {selectedCheck.customer?.name_ar || selectedCheck.supplier?.name_ar || "-"}
                  </strong>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">تاريخ الاستحقاق:</span>
                  <span className="font-mono text-slate-700">{selectedCheck.due_date}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-200 text-sm">
                  <span className="font-bold text-slate-700">مبلغ الشيك:</span>
                  <span className="font-mono font-black text-emerald-700 text-base">
                    {selectedCheck.amount.toFixed(2)} ر.س
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-800">بيانات التحصيل والإيداع</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  تاريخ التحصيل الفعلي *
                </label>
                <Input
                  type="date"
                  value={collectionDate}
                  onChange={(e) => setCollectionDate(e.target.value)}
                  className="bg-white border-slate-300 text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  {selectedCheck.check_type === "received" ? "حساب البنك المودع فيه *" : "حساب البنك المخصوم منه *"}
                </label>
                <select
                  value={collectionAccount}
                  onChange={(e) => setCollectionAccount(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">اختر حساب البنك...</option>
                  {bankAccounts?.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.code} - {acc.name_ar}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100 text-[11px] text-emerald-800 leading-relaxed">
                سيقوم النظام تلقائياً بإنشاء قيد محاسبي يثبت إيداع الشيك في حساب البنك المحدد وإقفال رصيد أوراق القبض.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-industrial-accent" />
            {isArabic ? "حافظة الشيكات والأوراق التجارية" : "Checks & Commercial Paper"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isArabic
              ? "متابعة استحقاق أوراق القبض والشيكات الواردة من العملاء وأوراق الدفع الصادرة مع التحصيل الآلي"
              : "Track maturity and automatic collection of incoming and outgoing bank checks"}
          </p>
        </div>
      </div>

      {/* Tabs and Search */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg border border-industrial-border w-full md:w-auto">
          <button
            onClick={() => setActiveTab("received")}
            className={`px-4 py-2 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === "received" ? "bg-emerald-700 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <ArrowDownLeft className="h-4 w-4" />
            <span>{isArabic ? "أوراق القبض (شيكات مستلمة من عملاء)" : "Checks Receivable"}</span>
          </button>
          <button
            onClick={() => setActiveTab("issued")}
            className={`px-4 py-2 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === "issued" ? "bg-rose-700 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <ArrowUpRight className="h-4 w-4" />
            <span>{isArabic ? "أوراق الدفع (شيكات صادرة لموردين)" : "Checks Payable"}</span>
          </button>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={isArabic ? "بحث برقم الشيك أو البنك..." : "Search check # or bank..."}
            className="ps-9 bg-slate-50 border-industrial-border text-xs"
          />
        </div>
      </div>

      {/* Checks Table */}
      <Card className="border-industrial-border bg-white shadow-sm overflow-hidden">
        <CardHeader className="py-3 px-4 border-b border-industrial-border bg-slate-50">
          <CardTitle className="text-sm font-bold text-slate-800 flex items-center justify-between">
            <span>
              {activeTab === "received"
                ? isArabic ? "حافظة أوراق القبض برسم التحصيل" : "Received Checks Under Collection"
                : isArabic ? "حافظة أوراق الدفع المستحقة" : "Issued Checks Payable"}
            </span>
            <span className="text-xs font-normal text-slate-500 font-mono">
              {filteredChecks?.length || 0} {isArabic ? "شيك" : "checks"}
            </span>
          </CardTitle>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start border-collapse">
              <thead>
                <tr className="border-b border-industrial-border bg-slate-100/75 text-slate-700 font-semibold">
                  <th className="py-2.5 px-3 text-start">رقم الشيك</th>
                  <th className="py-2.5 px-3 text-start">البنك المسحوب عليه</th>
                  <th className="py-2.5 px-3 text-start">الطرف المقابل (عميل / مورد)</th>
                  <th className="py-2.5 px-3 text-start">تاريخ الاستحقاق</th>
                  <th className="py-2.5 px-3 text-end">مبلغ الشيك</th>
                  <th className="py-2.5 px-3 text-center">حالة الشيك</th>
                  <th className="py-2.5 px-3 text-center">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-industrial-border">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={7} className="p-3">
                        <Skeleton className="h-6 w-full" />
                      </td>
                    </tr>
                  ))
                ) : filteredChecks?.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      {isArabic ? "لا توجد شيكات مسجلة في هذه الحافظة" : "No checks found in portfolio"}
                    </td>
                  </tr>
                ) : (
                  filteredChecks?.map((chk) => {
                    const isOverdue = chk.status === "under_collection" && chk.due_date < todayStr;
                    const isDueToday = chk.status === "under_collection" && chk.due_date === todayStr;

                    return (
                      <tr key={chk.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                          {chk.check_number}
                        </td>
                        <td className="py-2.5 px-3 text-slate-800 font-medium flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-slate-400" />
                          <span>{chk.bank_name}</span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-800">
                          {chk.customer?.name_ar || chk.supplier?.name_ar || "-"}
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          <div className="flex items-center gap-1.5">
                            <span>{chk.due_date}</span>
                            {isOverdue && (
                              <Badge variant="rose" className="text-[9px] py-0">
                                متأخر
                              </Badge>
                            )}
                            {isDueToday && (
                              <Badge variant="amber" className="text-[9px] py-0">
                                مستحق اليوم
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-end font-mono tabular-nums font-bold text-slate-900">
                          {chk.amount.toFixed(2)} ر.س
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {chk.status === "collected" ? (
                            <Badge variant="emerald" className="text-[10px]">
                              تم التحصيل
                            </Badge>
                          ) : chk.status === "bounced" ? (
                            <Badge variant="destructive" className="text-[10px]">
                              مرتد / مرفوض
                            </Badge>
                          ) : (
                            <Badge variant="amber" className="text-[10px]">
                              برسم التحصيل
                            </Badge>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {chk.status === "under_collection" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedCheck(chk);
                                  setCollectModalOpen(true);
                                }}
                                className="h-7 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 border-emerald-200"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 me-1" />
                                <span>{activeTab === "received" ? "تحصيل" : "صرف"}</span>
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handlePrintCheck(chk)}
                              className="h-7 w-7 p-0 text-slate-600 hover:bg-slate-100"
                              title={isArabic ? "طباعة A4" : "Print A4"}
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSavePdfCheck(chk)}
                              className="h-7 w-7 p-0 text-sky-700 hover:bg-sky-50"
                              title={isArabic ? "حفظ PDF" : "Save PDF"}
                            >
                              <FileDown className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleShareWhatsapp(chk)}
                              className="h-7 w-7 p-0 text-emerald-600 hover:bg-emerald-50"
                              title={isArabic ? "مشاركة واتساب" : "WhatsApp"}
                            >
                              <Share2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
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
    </div>
  );
}
