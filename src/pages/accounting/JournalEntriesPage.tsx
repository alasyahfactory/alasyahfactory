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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedEntry(entry);
                            setDetailsModalOpen(true);
                          }}
                          className="h-7 w-7 p-0 text-slate-500 hover:text-slate-900"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
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
      <Dialog open={detailsModalOpen} onOpenChange={setDetailsModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center justify-between">
              <span>تفاصيل القيد المالي: {selectedEntry?.entry_number}</span>
              <span className="font-mono text-xs text-slate-400 font-normal">
                {selectedEntry?.entry_date}
              </span>
            </DialogTitle>
          </DialogHeader>

          {selectedEntry && (
            <div className="space-y-4 pt-2">
              <div className="bg-slate-50 p-3 rounded-md border border-slate-200 text-xs">
                <span className="font-bold text-slate-700">البيان: </span>
                <span className="text-slate-900">{selectedEntry.description}</span>
              </div>

              <div className="border border-industrial-border rounded-md overflow-hidden">
                <table className="w-full text-xs text-start border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-industrial-border text-slate-700 font-semibold">
                      <th className="py-2 px-3 text-start">رقم الحساب</th>
                      <th className="py-2 px-3 text-start">اسم الحساب</th>
                      <th className="py-2 px-3 text-start">شرح السطر</th>
                      <th className="py-2 px-3 text-end">مدين (Debit)</th>
                      <th className="py-2 px-3 text-end">دائن (Credit)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-industrial-border">
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
                    <tr className="bg-slate-100/75 border-t border-industrial-border font-bold text-slate-900">
                      <td colSpan={3} className="py-2 px-3 text-center">
                        الإجمالي المتوازن
                      </td>
                      <td className="py-2 px-3 text-end font-mono text-emerald-800">
                        {selectedEntry.total_debit?.toFixed(2)} ر.س
                      </td>
                      <td className="py-2 px-3 text-end font-mono text-slate-900">
                        {selectedEntry.total_credit?.toFixed(2)} ر.س
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Manual JV Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Plus className="h-5 w-5 text-industrial-accent" />
              <span>تسجيل قيد محاسبي يدوي (Double-Entry Balanced JV)</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  تاريخ القيد *
                </label>
                <Input
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="bg-slate-50 border-industrial-border text-xs"
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
                  className="bg-slate-50 border-industrial-border text-xs"
                />
              </div>
            </div>

            {/* Lines Table */}
            <div className="border border-industrial-border rounded-lg overflow-hidden">
              <table className="w-full text-xs text-start border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-industrial-border text-slate-700 font-semibold">
                    <th className="py-2 px-2 text-start w-52">الحساب المالي *</th>
                    <th className="py-2 px-2 text-end w-32">مدين (Debit) *</th>
                    <th className="py-2 px-2 text-end w-32">دائن (Credit) *</th>
                    <th className="py-2 px-2 text-start">شرح السطر</th>
                    <th className="py-2 px-2 text-center w-12">حذف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-industrial-border">
                  {lines.map((line, idx) => (
                    <tr key={idx} className="bg-white">
                      <td className="p-1.5">
                        <select
                          value={line.account_id}
                          onChange={(e) => handleLineChange(idx, "account_id", e.target.value)}
                          className="w-full h-8 px-2 rounded border border-industrial-border bg-slate-50 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-accent"
                        >
                          <option value="">اختر الحساب...</option>
                          {accounts?.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.code} - {acc.name_ar}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-1.5">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.debit || ""}
                          onChange={(e) => handleLineChange(idx, "debit", e.target.value)}
                          placeholder="0.00"
                          className="h-8 text-end font-mono text-xs"
                        />
                      </td>
                      <td className="p-1.5">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.credit || ""}
                          onChange={(e) => handleLineChange(idx, "credit", e.target.value)}
                          placeholder="0.00"
                          className="h-8 text-end font-mono text-xs"
                        />
                      </td>
                      <td className="p-1.5">
                        <Input
                          value={line.description}
                          onChange={(e) => handleLineChange(idx, "description", e.target.value)}
                          placeholder="شرح إضافي للسطر..."
                          className="h-8 text-xs"
                        />
                      </td>
                      <td className="p-1.5 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveLine(idx)}
                          className="h-7 w-7 p-0 text-rose-500 hover:text-rose-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddLine}
              className="gap-1.5 text-xs text-slate-700"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>إضافة طرف / سطر آخر</span>
            </Button>

            {/* Balance Status Footer */}
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex items-center justify-between text-xs">
              <div className="flex items-center gap-4">
                <div>
                  إجمالي المدين: <strong className="font-mono text-emerald-700">{totalDebit.toFixed(2)} ر.س</strong>
                </div>
                <div>
                  إجمالي الدائن: <strong className="font-mono text-slate-800">{totalCredit.toFixed(2)} ر.س</strong>
                </div>
                <div>
                  الفارق: <strong className={`font-mono ${difference > 0 ? "text-rose-600 font-bold" : "text-emerald-600"}`}>{difference.toFixed(2)} ر.س</strong>
                </div>
              </div>

              {isBalanced ? (
                <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>القيد متوازن وجاهز للترحيل</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-rose-600 font-bold">
                  <AlertCircle className="h-4 w-4" />
                  <span>القيد غير متوازن (المدين != الدائن)</span>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="pt-3 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCreateModalOpen(false)}
            >
              إلغاء
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!isBalanced || !entryDescription.trim() || createMutation.isPending}
              className="gap-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold"
            >
              {createMutation.isPending ? "جاري الترحيل..." : "ترحيل القيد المالي"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
