import { printDocumentHtml, saveDocumentPdfFromHtml, shareDocumentWhatsApp } from "@/utils/printAndPdf";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import {
  BookOpen,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Eye,
  Trash2,
  ArrowRightLeft,
  FileSpreadsheet,
  ArrowRight,
  Printer,
  FileDown,
  Share2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { JournalEntry, JournalLine, Account } from "@/types/database";

interface ManualLineInput {
  account_id: string;
  debit: number;
  credit: number;
  description: string;
  cost_center_van_id?: string;
}

export function JournalEntriesPage() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const isArabic = i18n.language === "ar";

  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Manual JV Form State
  const [entryDate, setEntryDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [entryDescription, setEntryDescription] = useState<string>("");
  const [lines, setLines] = useState<ManualLineInput[]>([
    { account_id: "", debit: 0, credit: 0, description: "" },
    { account_id: "", debit: 0, credit: 0, description: "" },
  ]);

  // Fetch Accounts
  const { data: accounts } = useQuery<Account[]>({
    queryKey: ["coa_accounts_selectable"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .neq("type", "header")
        .eq("is_active", true)
        .order("code", { ascending: true });
      if (error) throw error;
      return (data || []) as Account[];
    },
  });

  // Fetch Journal Entries
  const { data: entries, isLoading } = useQuery<JournalEntry[]>({
    queryKey: ["journal_entries_list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journal_entries")
        .select(`
          *,
          lines:journal_lines(
            *,
            account:accounts(code, name_ar, name_en, type)
          )
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as JournalEntry[];
    },
  });

  // Create Manual JV Mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const formattedLines = lines.map((l) => ({
        account_id: l.account_id,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        description: l.description || entryDescription,
        cost_center_van_id: l.cost_center_van_id || null,
      }));

      const { data, error } = await supabase.rpc(
        "rpc_create_manual_journal_entry",
        {
          p_entry_date: entryDate,
          p_description: entryDescription,
          p_lines: formattedLines,
          p_created_by: user?.id,
        }
      );

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(isArabic ? "تم ترحيل قيد اليومية بنجاح" : "Journal entry posted successfully");
      queryClient.invalidateQueries({ queryKey: ["journal_entries_list"] });
      queryClient.invalidateQueries({ queryKey: ["coa_accounts"] });
      setCreateModalOpen(false);
      setEntryDescription("");
      setLines([
        { account_id: "", debit: 0, credit: 0, description: "" },
        { account_id: "", debit: 0, credit: 0, description: "" },
      ]);
    },
    onError: (err: any) => {
      toast.error(err.message || (isArabic ? "فشل ترحيل القيد" : "Failed to post entry"));
    },
  });

  // Calculations for manual entry balance
  const totalDebit = lines.reduce((acc, l) => acc + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((acc, l) => acc + (Number(l.credit) || 0), 0);
  const difference = Math.abs(totalDebit - totalCredit);
  const isBalanced = difference < 0.001 && totalDebit > 0;

  const handleAddLine = () => {
    setLines([...lines, { account_id: "", debit: 0, credit: 0, description: "" }]);
  };

  const handleRemoveLine = (idx: number) => {
    if (lines.length <= 2) {
      toast.error(isArabic ? "يجب أن يحتوي القيد على سطرين على الأقل" : "Entry must have at least 2 lines");
      return;
    }
    setLines(lines.filter((_, i) => i !== idx));
  };

  const handleLineChange = (idx: number, field: keyof ManualLineInput, value: any) => {
    const updated = [...lines];
    updated[idx] = { ...updated[idx], [field]: value };
    // If entering debit, clear credit and vice versa
    if (field === "debit" && Number(value) > 0) {
      updated[idx].credit = 0;
    } else if (field === "credit" && Number(value) > 0) {
      updated[idx].debit = 0;
    }
    setLines(updated);
  };

  
  const getEntryHtml = (entry: JournalEntry) => {
    const docTitle = `سند قيد يومية - ${entry.entry_number}`;
    const linesHtml = (entry.lines || [])
      .map(
        (l, i) => `
      <tr>
        <td style="text-align: center;">${i + 1}</td>
        <td style="font-family: monospace; font-weight: bold;">${(l as any).account?.code || (l as any).account?.account_code || "-"}</td>
        <td>${(l as any).account?.name_ar || "-"}</td>
        <td>${l.description || (entry as any).description || (entry as any).narration || "-"}</td>
        <td class="tabular" style="text-align: right;">${Number((l as any).debit || (l as any).debit_amount || 0) > 0 ? Number((l as any).debit || (l as any).debit_amount).toFixed(2) : "-"}</td>
        <td class="tabular" style="text-align: right;">${Number((l as any).credit || (l as any).credit_amount || 0) > 0 ? Number((l as any).credit || (l as any).credit_amount).toFixed(2) : "-"}</td>
      </tr>
    `
      )
      .join("");
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
            .badge { display: inline-block; padding: 4px 14px; background: #0f172a; color: #fff; font-weight: bold; font-size: 16px; border-radius: 4px; }
            .meta-card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px; background: #f8fafc; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { border: 1px solid #cbd5e1; background: #f1f5f9; padding: 8px; font-size: 11px; font-weight: bold; }
            .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 30px; margin-top: 40px; text-align: center; }
            .sig-box { border-top: 1px dashed #94a3b8; padding-top: 8px; font-size: 11px; }
          </style>
        </head>
        <body>
          <div class="header-grid">
            <div style="text-align: ${isArabic ? "right" : "left"};">
              <div style="font-weight: bold; font-size: 15px;">مصنع الأسياح للمنتجات الكيميائية</div>
              <div style="font-size: 11px; color: #64748b;">سجل تجاري: 1010000000 | الرقم الضريبي: 300000000000003</div>
              <div style="font-size: 11px; color: #64748b;">إدارة الحسابات العامة والمالية</div>
            </div>
            <div style="text-align: center;">
              <div class="badge">سند قيد يومية عامة</div>
              <div style="font-size: 13px; font-family: monospace; font-weight: bold; margin-top: 4px;">${entry.entry_number}</div>
            </div>
            <div style="text-align: ${isArabic ? "left" : "right"}; direction: ltr;">
              <div style="font-weight: bold; font-size: 14px;">Al-Asyah Chemical Factory</div>
              <div style="font-size: 11px; color: #64748b;">General Journal Entry Voucher</div>
              <div style="font-size: 11px; color: #64748b;">Date: ${entry.entry_date}</div>
            </div>
          </div>

          <div class="meta-card">
            <div><strong>رقم القيد:</strong> <span style="font-family: monospace;">${entry.entry_number}</span></div>
            <div><strong>تاريخ القيد:</strong> <span style="font-family: monospace;">${entry.entry_date}</span></div>
            <div style="grid-column: span 2;"><strong>البيان العام:</strong> ${entry.description || "قيد محاسبي مرحل"}</div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 40px;">#</th>
                <th style="width: 100px;">رقم الحساب</th>
                <th>اسم الحساب</th>
                <th style="width: 110px;">مدين (ر.س)</th>
                <th style="width: 110px;">دائن (ر.س)</th>
                <th>البيان التحليلي</th>
              </tr>
            </thead>
            <tbody>
              ${linesHtml}
            </tbody>
            <tfoot>
              <tr style="background: #f8fafc; font-weight: bold;">
                <td colspan="3" style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">الإجمالي العام المتوازن</td>
                <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: right; font-family: monospace;">${Number(entry.total_debit).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: right; font-family: monospace;">${Number(entry.total_credit).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; color: #16a34a; font-size: 11px;">متوازن ومرحل آلياً</td>
              </tr>
            </tfoot>
          </table>

          <div class="signatures">
            <div class="sig-box">
              <div style="font-weight: bold; margin-bottom: 35px;">المحاسب المنشئ</div>
              <div>التوقيع: ............................</div>
            </div>
            <div class="sig-box">
              <div style="font-weight: bold; margin-bottom: 35px;">المراجع المالي الداخلي</div>
              <div>التوقيع: ............................</div>
            </div>
            <div class="sig-box">
              <div style="font-weight: bold; margin-bottom: 35px;">المدير المالي والاعتماد</div>
              <div>الختم والتوقيع: ............................</div>
            </div>
          </div>

          
        </body>
      </html>
    `;
  };

  const handlePrintEntry = (entry: JournalEntry) => {
    printDocumentHtml(getEntryHtml(entry), `قيد_يومية_${entry.entry_number}`);
  };

  const handleSavePdfEntry = (entry: JournalEntry) => {
    saveDocumentPdfFromHtml(getEntryHtml(entry), `قيد_يومية_${entry.entry_number}`);
  };

  const handleShareWhatsapp = (entry: JournalEntry) => {
    const msg = `*سند قيد محاسبي - مصنع الأسياح للمنتجات الكيميائية*
رقم القيد: ${entry.entry_number}
التاريخ: ${entry.entry_date}
البيان: ${entry.description || "-"}
إجمالي المدين: ${Number(entry.total_debit).toLocaleString("en-US", { minimumFractionDigits: 2 })} ر.س
إجمالي الدائن: ${Number(entry.total_credit).toLocaleString("en-US", { minimumFractionDigits: 2 })} ر.س
الحالة: مرحل ومتوازن
_نظام إدارة العمليات والمحاسبة - مصنع الأسياح_`;

    const encoded = encodeURIComponent(msg);
    const waUrl = `https://api.whatsapp.com/send?text=${encoded}`;
    window.open(waUrl, "_blank");
  };

  // Filter entries
  const filteredEntries = entries?.filter((entry) => {
    const matchesSearch =
      entry.entry_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType =
      filterType === "all" ||
      (filterType === "manual" && entry.ref_type === "manual") ||
      (filterType === "sales" && entry.ref_type?.includes("invoice")) ||
      (filterType === "purchase" && entry.ref_type?.includes("purchase")) ||
      (filterType === "voucher" && entry.ref_type === "voucher") ||
      (filterType === "payroll" && entry.ref_type === "payroll");
    return matchesSearch && matchesType;
  });

  // In-Page Canvas View for Manual JV Creation (Eliminating modal popup)
  if (createModalOpen) {
    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <Button
              variant="tonal"
              size="sm"
              onClick={() => setCreateModalOpen(false)}
              className="gap-1.5"
            >
              <ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
              <span>{isArabic ? "العودة لقيود اليومية" : "Back to Journal"}</span>
            </Button>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-sky-600" />
                <span>تسجيل قيد محاسبي يدوي (Double-Entry Balanced JV)</span>
              </h1>
              <p className="text-xs text-slate-500">
                تسجيل الأطراف المدينة والدائنة مع اشتراط التوازن التام (المدين = الدائن) قبل الترحيل
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setCreateModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!isBalanced || !entryDescription.trim() || createMutation.isPending}
              className="bg-emerald-700 hover:bg-emerald-800 text-white min-h-[40px] px-5 font-semibold"
            >
              {createMutation.isPending ? "جاري الترحيل..." : "ترحيل القيد المالي"}
            </Button>
          </div>
        </div>

        {/* Form Body in Cards */}
        <div className="space-y-6">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-800">بيانات القيد العام</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    تاريخ القيد *
                  </label>
                  <Input
                    type="date"
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className="bg-slate-50 border-slate-200 text-xs font-mono"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    البيان العام للقيد *
                  </label>
                  <Input
                    value={entryDescription}
                    onChange={(e) => setEntryDescription(e.target.value)}
                    placeholder="مثال: إثبات مصاريف عمومية وإدارية / تسوية رصيد حساب..."
                    className="bg-slate-50 border-slate-200 text-xs"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold text-slate-800">أطراف القيد (مدين / دائن)</CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">اختر الحساب المالي وحدد المبلغ المدين أو الدائن</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddLine}
                className="gap-1.5 text-xs text-slate-700 hover:bg-slate-50"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>إضافة طرف / سطر آخر</span>
              </Button>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs text-start border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold">
                      <th className="py-2.5 px-3 text-start w-1/3">الحساب المالي *</th>
                      <th className="py-2.5 px-3 text-start">شرح / بيان السطر</th>
                      <th className="py-2.5 px-3 text-end w-32">مدين (Debit)</th>
                      <th className="py-2.5 px-3 text-end w-32">دائن (Credit)</th>
                      <th className="py-2.5 px-3 text-center w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lines.map((line, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="p-2">
                          <select
                            value={line.account_id}
                            onChange={(e) => handleLineChange(idx, "account_id", e.target.value)}
                            className="w-full text-xs p-1.5 rounded border border-slate-200 bg-white"
                          >
                            <option value="">-- اختر الحساب المالي --</option>
                            {accounts?.map((acc) => (
                              <option key={acc.id} value={acc.id}>
                                {acc.code} - {acc.name_ar} ({acc.type})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2">
                          <Input
                            placeholder="بيان خاص بهذا السطر..."
                            value={line.description}
                            onChange={(e) => handleLineChange(idx, "description", e.target.value)}
                            className="h-8 text-xs bg-white"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.debit || ""}
                            onChange={(e) => handleLineChange(idx, "debit", parseFloat(e.target.value) || 0)}
                            className="h-8 text-xs text-end font-mono font-bold text-emerald-800 bg-white"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.credit || ""}
                            onChange={(e) => handleLineChange(idx, "credit", parseFloat(e.target.value) || 0)}
                            className="h-8 text-xs text-end font-mono font-bold text-slate-800 bg-white"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveLine(idx)}
                            disabled={lines.length <= 2}
                            className="h-7 w-7 text-rose-500 hover:text-rose-700"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Balance Status Card */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs">
                <div className="flex flex-wrap items-center gap-6">
                  <div>
                    <span className="text-slate-500 block">إجمالي المدين:</span>
                    <strong className="font-mono text-base text-emerald-700 tabular-nums">{totalDebit.toFixed(2)} ر.س</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">إجمالي الدائن:</span>
                    <strong className="font-mono text-base text-slate-800 tabular-nums">{totalCredit.toFixed(2)} ر.س</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">الفارق:</span>
                    <strong className={`font-mono text-base tabular-nums ${difference > 0 ? "text-rose-600 font-bold" : "text-emerald-600"}`}>
                      {difference.toFixed(2)} ر.س
                    </strong>
                  </div>
                </div>

                {isBalanced ? (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-800 font-bold">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>القيد متوازن وجاهز للترحيل</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-100 text-rose-800 font-bold">
                    <AlertCircle className="h-4 w-4" />
                    <span>القيد غير متوازن (المدين != الدائن)</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // In-Page View for Selected Entry Details (Eliminating modal popup)
  if (detailsModalOpen && selectedEntry) {
    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <Button
              variant="tonal"
              size="sm"
              onClick={() => {
                setDetailsModalOpen(false);
                setSelectedEntry(null);
              }}
              className="gap-1.5"
            >
              <ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
              <span>{isArabic ? "العودة لقيود اليومية" : "Back to Journal"}</span>
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold font-mono text-slate-900">
                  {selectedEntry.entry_number}
                </h1>
                <Badge variant="outline" className="font-mono text-xs">
                  {selectedEntry.entry_date}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {selectedEntry.description}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePrintEntry(selectedEntry)}
              className="gap-1.5"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              <span>{isArabic ? "طباعة A4" : "Print A4"}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSavePdfEntry(selectedEntry)}
              className="gap-1.5"
            >
              <FileDown className="w-4 h-4 text-sky-600" />
              <span>{isArabic ? "حفظ PDF" : "Save PDF"}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleShareWhatsapp(selectedEntry)}
              className="gap-1.5 text-emerald-700 hover:text-emerald-800"
            >
              <Share2 className="w-4 h-4 text-emerald-600" />
              <span>{isArabic ? "مشاركة واتساب" : "WhatsApp"}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDetailsModalOpen(false);
                setSelectedEntry(null);
              }}
            >
              {isArabic ? "إغلاق" : "Close"}
            </Button>
          </div>
        </div>

        {/* Details Card */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3 border-b border-slate-100">
            <CardTitle className="text-sm font-bold text-slate-800">أطراف وسطور القيد المالي</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs text-start border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold">
                    <th className="py-2.5 px-3 text-start">رقم الحساب</th>
                    <th className="py-2.5 px-3 text-start">اسم الحساب</th>
                    <th className="py-2.5 px-3 text-start">شرح السطر</th>
                    <th className="py-2.5 px-3 text-end">مدين (Debit)</th>
                    <th className="py-2.5 px-3 text-end">دائن (Credit)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedEntry.lines?.map((line) => (
                    <tr key={line.id} className="hover:bg-slate-50/50">
                      <td className="py-2 px-3 font-mono font-bold text-slate-800">
                        {line.account?.code}
                      </td>
                      <td className="py-2 px-3 font-medium text-slate-900">
                        {line.account?.name_ar}
                      </td>
                      <td className="py-2 px-3 text-slate-500 text-[11px]">
                        {line.description || line.note || "-"}
                      </td>
                      <td className="py-2 px-3 text-end font-mono tabular-nums font-bold text-emerald-800">
                        {line.debit > 0 ? `${line.debit.toFixed(2)} ر.س` : "-"}
                      </td>
                      <td className="py-2 px-3 text-end font-mono tabular-nums font-bold text-slate-800">
                        {line.credit > 0 ? `${line.credit.toFixed(2)} ر.س` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100/75 border-t border-slate-200 font-bold text-slate-900">
                    <td colSpan={3} className="py-3 px-3 text-center">
                      الإجمالي المتوازن
                    </td>
                    <td className="py-3 px-3 text-end font-mono text-emerald-800 text-sm tabular-nums">
                      {selectedEntry.total_debit?.toFixed(2)} ر.س
                    </td>
                    <td className="py-3 px-3 text-end font-mono text-slate-900 text-sm tabular-nums">
                      {selectedEntry.total_credit?.toFixed(2)} ر.س
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-industrial-accent" />
            {isArabic ? "دفتر قيود اليومية العامة" : "General Journal Entries"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isArabic
              ? "متابعة القيود الآلية الناتجة عن المبيعات، المشتريات، الإنتاج، والرواتب مع تسجيل القيود اليدوية"
              : "Review automated and manual double-entry accounting transactions"}
          </p>
        </div>

        <Button
          onClick={() => setCreateModalOpen(true)}
          className="gap-2 bg-slate-900 text-white hover:bg-slate-800 shadow-sm font-semibold"
        >
          <Plus className="h-4 w-4" />
          <span>{isArabic ? "تسجيل قيد يدوي" : "New Journal Entry"}</span>
        </Button>
      </div>

      {/* Filter and Search */}
      <Card className="border-industrial-border bg-white shadow-sm">
        <CardContent className="p-4 flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={isArabic ? "بحث برقم القيد أو البيان..." : "Search entry # or description..."}
              className="ps-9 bg-slate-50 border-industrial-border"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <Filter className="h-4 w-4 text-slate-400" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="h-9 px-3 rounded-md border border-industrial-border bg-slate-50 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="all">{isArabic ? "جميع مصادر القيود" : "All Entry Sources"}</option>
              <option value="manual">{isArabic ? "قيود يدوية فقط" : "Manual JVs Only"}</option>
              <option value="sales">{isArabic ? "فواتير ومردودات مبيعات" : "Sales Invoices"}</option>
              <option value="purchase">{isArabic ? "مشتريات وموردين" : "Procurement"}</option>
              <option value="voucher">{isArabic ? "سندات قبض وصرف" : "Vouchers"}</option>
              <option value="payroll">{isArabic ? "مسيرات الرواتب" : "Payroll"}</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Journal Entries Table */}
      <Card className="border-industrial-border bg-white shadow-sm overflow-hidden">
        <CardHeader className="py-3 px-4 border-b border-industrial-border bg-slate-50">
          <CardTitle className="text-sm font-bold text-slate-800 flex items-center justify-between">
            <span>{isArabic ? "سجل القيود المرحلة" : "Posted Journal Entries"}</span>
            <span className="text-xs font-normal text-slate-500 font-mono">
              {filteredEntries?.length || 0} {isArabic ? "قيد" : "entries"}
            </span>
          </CardTitle>
        </CardHeader>

        <CardContent className="p-0">
          <div
            className="table-accessible-wrapper heavy-section-deferred"
            tabIndex={0}
            role="region"
            aria-label={isArabic ? "سجل قيود اليومية المحاسبية" : "Journal Entries Register"}
          >
            <table className="w-full text-xs text-start border-collapse">
              <caption className="sr-only">
                {isArabic ? "سجل القيود اليومية المرحلة" : "Posted Journal Entries Log"}
              </caption>
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-industrial-border bg-slate-100/95 text-slate-700 font-semibold backdrop-blur-sm">
                  <th scope="col" className="py-2.5 px-3 text-start">رقم القيد</th>
                  <th scope="col" className="py-2.5 px-3 text-start">التاريخ</th>
                  <th scope="col" className="py-2.5 px-3 text-start">المصدر / النوع</th>
                  <th scope="col" className="py-2.5 px-3 text-start">البيان والشرح</th>
                  <th scope="col" className="py-2.5 px-3 text-end">إجمالي المدين</th>
                  <th scope="col" className="py-2.5 px-3 text-end">إجمالي الدائن</th>
                  <th scope="col" className="py-2.5 px-3 text-center">الحالة</th>
                  <th scope="col" className="py-2.5 px-3 text-center">التفاصيل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-industrial-border">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={8} className="p-3">
                        <Skeleton className="h-6 w-full" />
                      </td>
                    </tr>
                  ))
                ) : filteredEntries?.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      {isArabic ? "لا توجد قيود يومية مطابقة" : "No journal entries found"}
                    </td>
                  </tr>
                ) : (
                  filteredEntries?.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                        {entry.entry_number}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {entry.entry_date}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {entry.ref_type || "manual"}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-slate-800 font-medium max-w-xs truncate">
                        {entry.description}
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono tabular-nums font-bold text-slate-900">
                        {entry.total_debit?.toFixed(2)} ر.س
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono tabular-nums font-bold text-slate-900">
                        {entry.total_credit?.toFixed(2)} ر.س
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge variant="emerald" className="text-[10px]">
                          {isArabic ? "مرحل ومتوازن" : "Balanced"}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedEntry(entry);
                              setDetailsModalOpen(true);
                            }}
                            className="h-7 w-7 p-0 text-slate-500 hover:text-slate-900"
                            title={isArabic ? "معاينة القيد" : "View"}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handlePrintEntry(entry)}
                            className="h-7 w-7 p-0 text-slate-600 hover:bg-slate-100"
                            title={isArabic ? "طباعة A4" : "Print A4"}
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSavePdfEntry(entry)}
                            className="h-7 w-7 p-0 text-sky-700 hover:bg-sky-50"
                            title={isArabic ? "حفظ PDF" : "Save PDF"}
                          >
                            <FileDown className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleShareWhatsapp(entry)}
                            className="h-7 w-7 p-0 text-emerald-600 hover:bg-emerald-50"
                            title={isArabic ? "مشاركة واتساب" : "WhatsApp"}
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Entry Details Modal */}
    </div>
  );
}
