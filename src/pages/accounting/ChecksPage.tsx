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
  Building2,
  Calendar,
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
                              <span>{activeTab === "received" ? "تحصيل وإيداع" : "إثبات الصرف"}</span>
                            </Button>
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

      {/* Collect / Clear Check Modal */}
      <Dialog open={collectModalOpen} onOpenChange={setCollectModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-700" />
              <span>إيداع وتحصيل الشيك رقم: {selectedCheck?.check_number}</span>
            </DialogTitle>
          </DialogHeader>

          {selectedCheck && (
            <div className="space-y-4 pt-2">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">المبلغ المستحق:</span>
                  <strong className="font-mono text-slate-900 text-sm">{selectedCheck.amount.toFixed(2)} ر.س</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">البنك المسحوب عليه:</span>
                  <strong className="text-slate-800">{selectedCheck.bank_name}</strong>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  تاريخ التحصيل الفعلي *
                </label>
                <Input
                  type="date"
                  value={collectionDate}
                  onChange={(e) => setCollectionDate(e.target.value)}
                  className="bg-slate-50 border-industrial-border text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  {selectedCheck.check_type === "received" ? "حساب البنك المودع فيه *" : "حساب البنك المخصوم منه *"}
                </label>
                <select
                  value={collectionAccount}
                  onChange={(e) => setCollectionAccount(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-industrial-border bg-slate-50 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="">اختر حساب البنك...</option>
                  {bankAccounts?.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.code} - {acc.name_ar}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <DialogFooter className="pt-3 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCollectModalOpen(false)}
            >
              إلغاء
            </Button>
            <Button
              onClick={() => collectMutation.mutate()}
              disabled={!collectionAccount || collectMutation.isPending}
              className="gap-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold"
            >
              {collectMutation.isPending ? "جاري الترحيل..." : "تأكيد التحصيل وترحيل القيد"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
