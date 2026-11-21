import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import {
  Banknote,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  Calendar,
  AlertCircle,
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
import type { EmployeeAdvance, Employee, Account } from "@/types/database";

export function EmployeeAdvancesPage() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const isArabic = i18n.language === "ar";

  const [searchTerm, setSearchTerm] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Form State
  const [employeeId, setEmployeeId] = useState("");
  const [advanceDate, setAdvanceDate] = useState(new Date().toISOString().split("T")[0]);
  const [amount, setAmount] = useState<number>(0);
  const [installmentMonths, setInstallmentMonths] = useState<number>(1);
  const [paymentAccount, setPaymentAccount] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // Fetch Treasury Accounts for Cash Out
  const { data: treasuryAccounts } = useQuery<Account[]>({
    queryKey: ["treasury_accounts_advances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .in("code", ["1101", "1102"])
        .eq("is_active", true);
      if (error) throw error;
      return (data || []) as Account[];
    },
  });

  // Fetch Employees
  const { data: employees } = useQuery<Employee[]>({
    queryKey: ["employees_for_advances"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("*").eq("is_active", true);
      if (error) throw error;
      return (data || []) as Employee[];
    },
  });

  // Fetch Advances
  const { data: advances, isLoading } = useQuery<EmployeeAdvance[]>({
    queryKey: ["employee_advances_list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_advances")
        .select(`
          *,
          employee:employees(emp_code, name_ar, phone, department, basic_salary)
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as EmployeeAdvance[];
    },
  });

  // Create Advance Mutation with balanced JV (Dr: 1120 / Cr: Treasury Account)
  const createMutation = useMutation({
    mutationFn: async () => {
      const seq = Math.floor(Math.random() * 9000) + 1000;
      const advNum = `ADV-${new Date().getFullYear()}-${seq}`;
      const monthlyDeduction = Number((amount / installmentMonths).toFixed(2));

      // 1. Get Employee Advances Account (1120 or 1150)
      const { data: advAcc } = await supabase
        .from("accounts")
        .select("id")
        .in("code", ["1120", "1150"])
        .limit(1)
        .single();

      if (!advAcc) throw new Error("حساب سلف الموظفين (1120) غير موجود");

      // 2. Insert Journal Entry (Dr: 1120, Cr: Treasury Account)
      const { data: jvData, error: jvError } = await supabase.rpc(
        "rpc_create_manual_journal_entry",
        {
          p_entry_date: advanceDate,
          p_description: `صرف سلفة موظف: ${advNum}`,
          p_lines: [
            {
              account_id: advAcc.id,
              debit: Number(amount),
              credit: 0,
              description: `سلفة موظف رقم ${advNum}`,
            },
            {
              account_id: paymentAccount,
              debit: 0,
              credit: Number(amount),
              description: `صرف سلفة نقداً / بنك`,
            },
          ],
          p_created_by: user?.id,
        }
      );

      if (jvError) throw jvError;

      // 3. Insert Employee Advance Record
      const { data, error } = await supabase.from("employee_advances").insert({
        advance_number: advNum,
        employee_id: employeeId,
        advance_date: advanceDate,
        amount: Number(amount),
        installment_months: installmentMonths,
        monthly_deduction: monthlyDeduction,
        recovered_amount: 0,
        remaining_balance: Number(amount),
        journal_entry_id: jvData?.journal_entry_id || null,
        notes: notes || null,
        status: "active",
        created_by: user?.id,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(isArabic ? "تم صرف وترحيل السلفة بنجاح" : "Advance issued successfully");
      queryClient.invalidateQueries({ queryKey: ["employee_advances_list"] });
      queryClient.invalidateQueries({ queryKey: ["journal_entries_list"] });
      setCreateModalOpen(false);
      setAmount(0);
      setNotes("");
    },
    onError: (err: any) => {
      toast.error(err.message || (isArabic ? "فشل تسجيل السلفة" : "Failed to issue advance"));
    },
  });

  const monthlyDeductionCalc = amount > 0 && installmentMonths > 0 ? (amount / installmentMonths).toFixed(2) : "0.00";

  const filteredAdvances = advances?.filter((adv) => {
    return (
      adv.advance_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      adv.employee?.name_ar.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Banknote className="h-6 w-6 text-industrial-accent" />
            {isArabic ? "سُلف الموظفين والأقساط المستردة" : "Employee Advances & Deductions"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isArabic
              ? "صرف السلف للعاملين، جدولة الأقساط الشهرية، والخصم التلقائي من مسيرات الرواتب"
              : "Track employee cash advances, monthly installment plans, and automatic payroll recoveries"}
          </p>
        </div>

        <Button
          onClick={() => setCreateModalOpen(true)}
          className="gap-2 bg-slate-900 text-white hover:bg-slate-800 shadow-sm font-semibold"
        >
          <Plus className="h-4 w-4" />
          <span>{isArabic ? "صرف سلفة جديدة" : "Issue New Advance"}</span>
        </Button>
      </div>

      {/* Search Bar */}
      <div className="relative w-full md:w-80">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={isArabic ? "بحث برقم السلفة أو اسم الموظف..." : "Search advance..."}
          className="ps-9 bg-white border-industrial-border text-xs"
        />
      </div>

      {/* Advances Table */}
      <Card className="border-industrial-border bg-white shadow-sm overflow-hidden">
        <CardHeader className="py-3 px-4 border-b border-industrial-border bg-slate-50">
          <CardTitle className="text-sm font-bold text-slate-800 flex items-center justify-between">
            <span>{isArabic ? "سجل السلف المالية النشطة والمستردة" : "Active & Settled Advances"}</span>
            <span className="text-xs font-normal text-slate-500 font-mono">
              {filteredAdvances?.length || 0} {isArabic ? "سلفة" : "advances"}
            </span>
          </CardTitle>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start border-collapse">
              <thead>
                <tr className="border-b border-industrial-border bg-slate-100/75 text-slate-700 font-semibold">
                  <th className="py-2.5 px-3 text-start">رقم السلفة</th>
                  <th className="py-2.5 px-3 text-start">اسم الموظف</th>
                  <th className="py-2.5 px-3 text-start">تاريخ الصرف</th>
                  <th className="py-2.5 px-3 text-end">مبلغ السلفة</th>
                  <th className="py-2.5 px-3 text-center">الأقساط (شهر)</th>
                  <th className="py-2.5 px-3 text-end">القسط الشهري</th>
                  <th className="py-2.5 px-3 text-end">المسترد بالرواتب</th>
                  <th className="py-2.5 px-3 text-end">المتبقي للتحصيل</th>
                  <th className="py-2.5 px-3 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-industrial-border">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={9} className="p-3">
                        <Skeleton className="h-6 w-full" />
                      </td>
                    </tr>
                  ))
                ) : filteredAdvances?.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400">
                      {isArabic ? "لا توجد سلف مسجلة حالياً" : "No advances recorded"}
                    </td>
                  </tr>
                ) : (
                  filteredAdvances?.map((adv) => (
                    <tr key={adv.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                        {adv.advance_number}
                      </td>
                      <td className="py-2.5 px-3 text-slate-900 font-medium">
                        {adv.employee?.name_ar}
                        <span className="block text-[10px] text-slate-400 font-mono">
                          {adv.employee?.emp_code} - {adv.employee?.department}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {adv.advance_date}
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono tabular-nums font-bold text-slate-900">
                        {adv.amount.toFixed(2)} ر.س
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700">
                        {adv.installment_months}
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono tabular-nums text-slate-700">
                        {adv.monthly_deduction.toFixed(2)} ر.س
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono tabular-nums text-emerald-700 font-bold">
                        {adv.recovered_amount.toFixed(2)} ر.س
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono tabular-nums font-bold text-rose-700">
                        {adv.remaining_balance.toFixed(2)} ر.س
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {adv.status === "settled" ? (
                          <Badge variant="emerald" className="text-[10px]">
                            تم السداد بالكامل
                          </Badge>
                        ) : (
                          <Badge variant="amber" className="text-[10px]">
                            جارٍ الاستقطاع
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Issue Advance Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Plus className="h-4 w-4 text-industrial-accent" />
              <span>صرف سلفة مالية لموظف</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 pt-2 text-xs">
            <div>
              <label className="font-bold text-slate-700 block mb-1">الموظف المستفيد *</label>
              <select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="w-full h-8 px-2 rounded border border-industrial-border bg-slate-50 text-xs font-medium text-slate-800"
              >
                <option value="">اختر الموظف...</option>
                {employees?.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name_ar} ({emp.emp_code} - راتب: {emp.basic_salary} ر.س)
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">تاريخ الصرف *</label>
                <Input
                  type="date"
                  value={advanceDate}
                  onChange={(e) => setAdvanceDate(e.target.value)}
                  className="h-8 text-xs font-mono bg-slate-50 border-industrial-border"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">حساب الصرف (الصندوق/البنك) *</label>
                <select
                  value={paymentAccount}
                  onChange={(e) => setPaymentAccount(e.target.value)}
                  className="w-full h-8 px-2 rounded border border-industrial-border bg-slate-50 text-xs font-medium text-slate-800"
                >
                  <option value="">اختر الحساب...</option>
                  {treasuryAccounts?.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.code} - {acc.name_ar}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">مبلغ السلفة (SAR) *</label>
                <Input
                  type="number"
                  min="1"
                  step="0.01"
                  value={amount || ""}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  placeholder="0.00"
                  className="h-8 text-xs font-mono text-end font-bold text-slate-900 bg-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">عدد أشهر الاستقطاع *</label>
                <select
                  value={installmentMonths}
                  onChange={(e) => setInstallmentMonths(Number(e.target.value))}
                  className="w-full h-8 px-2 rounded border border-industrial-border bg-slate-50 text-xs font-medium text-slate-800"
                >
                  <option value={1}>شهر واحد (كامل السلفة من الراتب القادم)</option>
                  <option value={2}>شهران (قسطان)</option>
                  <option value={3}>3 أشهر</option>
                  <option value={4}>4 أشهر</option>
                  <option value={6}>6 أشهر</option>
                  <option value={10}>10 أشهر</option>
                  <option value={12}>12 شهراً</option>
                </select>
              </div>
            </div>

            <div className="p-2.5 bg-emerald-50 rounded border border-emerald-200 flex justify-between font-bold text-emerald-900">
              <span>القسط الشهري المستقطع:</span>
              <span className="font-mono text-sm">{monthlyDeductionCalc} ر.س / شهرياً</span>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">ملاحظات / سبب السلفة</label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="مثال: ظرف طارئ / مساعدة زواج..."
                className="h-8 text-xs bg-slate-50 border-industrial-border"
              />
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
              disabled={!employeeId || !paymentAccount || amount <= 0 || createMutation.isPending}
              className="gap-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold"
            >
              {createMutation.isPending ? "جاري الصرف..." : "صرف السلفة وترحيل القيد"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
