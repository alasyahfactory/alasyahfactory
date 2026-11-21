import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import {
  Coins,
  Plus,
  Search,
  CheckCircle2,
  Calendar,
  FileSpreadsheet,
  Users,
  Eye,
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
import { PayrollSlipPrint } from "@/components/accounting/PayrollSlipPrint";
import type { PayrollRun, PayrollRunLine, Employee, FactorySettings } from "@/types/database";

interface PayrollLineDraft {
  employee_id: string;
  employee_name: string;
  emp_code: string;
  department: string;
  basic_salary: number;
  housing_allowance: number;
  transport_allowance: number;
  other_allowance: number;
  overtime_amount: number;
  commission_amount: number;
  bonus_amount: number;
  absence_deduction: number;
  penalty_deduction: number;
  advance_deduction: number;
  net_salary: number;
}

export function PayrollRunsPage() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const isArabic = i18n.language === "ar";

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [payrollDate, setPayrollDate] = useState<string>(now.toISOString().split("T")[0]);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null);

  // Form lines draft
  const [draftLines, setDraftLines] = useState<PayrollLineDraft[]>([]);

  // Fetch Factory Settings for Print
  const { data: settings } = useQuery<FactorySettings | null>({
    queryKey: ["factory_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("factory_settings").select("*").single();
      if (error) return null;
      return data as FactorySettings;
    },
  });

  // Fetch Payroll Runs
  const { data: runs, isLoading } = useQuery<PayrollRun[]>({
    queryKey: ["payroll_runs_list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_runs")
        .select(`
          *,
          lines:payroll_run_lines(
            *,
            employee:employees(emp_code, name_ar, job_title, department)
          )
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as PayrollRun[];
    },
  });

  // Fetch Active Employees for Initializing New Run Draft
  const handleOpenCreateModal = async () => {
    try {
      const { data: emps, error: empErr } = await supabase
        .from("employees")
        .select("*")
        .eq("is_active", true)
        .order("emp_code", { ascending: true });

      if (empErr) throw empErr;

      // Look up active advances per employee
      const { data: advs } = await supabase
        .from("employee_advances")
        .select("employee_id, monthly_deduction, remaining_balance")
        .eq("status", "active");

      // Look up approved rep commissions
      const { data: comms } = await supabase
        .from("sales_rep_commissions")
        .select("rep_id, commission_amount")
        .eq("status", "approved");

      const lines: PayrollLineDraft[] = (emps || []).map((emp: any) => {
        // Find active advance deduction
        const empAdv = advs?.find((a: any) => a.employee_id === emp.id);
        const advDed = empAdv ? Math.min(empAdv.monthly_deduction, empAdv.remaining_balance) : 0;

        // Find rep commissions
        const empComm = comms
          ?.filter((c: any) => c.rep_id === emp.user_profile_id)
          .reduce((acc: number, c: any) => acc + (c.commission_amount || 0), 0) || 0;

        const gross = emp.basic_salary + emp.housing_allowance + emp.transport_allowance + emp.other_allowances + empComm;
        const net = Math.max(0, gross - advDed);

        return {
          employee_id: emp.id,
          employee_name: emp.name_ar,
          emp_code: emp.emp_code,
          department: emp.department,
          basic_salary: emp.basic_salary,
          housing_allowance: emp.housing_allowance,
          transport_allowance: emp.transport_allowance,
          other_allowance: emp.other_allowances,
          overtime_amount: 0,
          commission_amount: empComm,
          bonus_amount: 0,
          absence_deduction: 0,
          penalty_deduction: 0,
          advance_deduction: advDed,
          net_salary: net,
        };
      });

      setDraftLines(lines);
      setCreateModalOpen(true);
    } catch (err: any) {
      toast.error(err.message || "فشل تحميل بيانات العاملين");
    }
  };

  const handleUpdateLine = (idx: number, field: keyof PayrollLineDraft, value: number) => {
    const updated = [...draftLines];
    updated[idx] = { ...updated[idx], [field]: value };

    // Recompute Net Salary
    const l = updated[idx];
    const gross =
      l.basic_salary +
      l.housing_allowance +
      l.transport_allowance +
      l.other_allowance +
      l.overtime_amount +
      l.commission_amount +
      l.bonus_amount;
    const deductions = l.absence_deduction + l.penalty_deduction + l.advance_deduction;
    l.net_salary = Math.max(0, gross - deductions);

    setDraftLines(updated);
  };

  // Create Payroll Run Mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const formattedLines = draftLines.map((l) => ({
        employee_id: l.employee_id,
        basic_salary: l.basic_salary,
        housing_allowance: l.housing_allowance,
        transport_allowance: l.transport_allowance,
        other_allowance: l.other_allowance,
        overtime_amount: l.overtime_amount,
        commission_amount: l.commission_amount,
        bonus_amount: l.bonus_amount,
        absence_deduction: l.absence_deduction,
        penalty_deduction: l.penalty_deduction,
        advance_deduction: l.advance_deduction,
        net_salary: l.net_salary,
      }));

      const { data, error } = await supabase.rpc("rpc_post_payroll_run", {
        p_month: selectedMonth,
        p_year: selectedYear,
        p_payroll_date: payrollDate,
        p_lines: formattedLines,
        p_created_by: user?.id,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (res) => {
      toast.success(isArabic ? `تم ترحيل مسير الرواتب بنجاح (صافي: ${res.net_payable} ر.س)` : "Payroll run posted");
      queryClient.invalidateQueries({ queryKey: ["payroll_runs_list"] });
      queryClient.invalidateQueries({ queryKey: ["journal_entries_list"] });
      queryClient.invalidateQueries({ queryKey: ["employee_advances_list"] });
      setCreateModalOpen(false);
    },
    onError: (err: any) => {
      toast.error(err.message || (isArabic ? "فشل ترحيل مسير الرواتب" : "Failed to post payroll"));
    },
  });

  const totalGrossDraft = draftLines.reduce(
    (acc, l) =>
      acc +
      (l.basic_salary +
        l.housing_allowance +
        l.transport_allowance +
        l.other_allowance +
        l.overtime_amount +
        l.commission_amount +
        l.bonus_amount),
    0
  );
  const totalAdvancesDraft = draftLines.reduce((acc, l) => acc + l.advance_deduction, 0);
  const totalNetPayableDraft = draftLines.reduce((acc, l) => acc + l.net_salary, 0);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Coins className="h-6 w-6 text-industrial-accent" />
            {isArabic ? "مسيرات الرواتب الشهرية والبدلات" : "Monthly Payroll Runs"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isArabic
              ? "إعداد مسيرات الأجور والرواتب، احتساب عمولات المناديب، استقطاع السلف آلياً، وترحيل قيود الاستحقاق"
              : "Generate monthly payroll, calculate allowances, rep commissions, advance deductions, and double-entry postings"}
          </p>
        </div>

        <Button
          onClick={handleOpenCreateModal}
          className="gap-2 bg-slate-900 text-white hover:bg-slate-800 shadow-sm font-semibold"
        >
          <Plus className="h-4 w-4" />
          <span>{isArabic ? "إعداد مسير رواتب جديد" : "New Payroll Run"}</span>
        </Button>
      </div>

      {/* Payroll Runs History Table */}
      <Card className="border-industrial-border bg-white shadow-sm overflow-hidden">
        <CardHeader className="py-3 px-4 border-b border-industrial-border bg-slate-50">
          <CardTitle className="text-sm font-bold text-slate-800 flex items-center justify-between">
            <span>{isArabic ? "سجل مسيرات الرواتب المعتمدة" : "Approved Payroll Runs Register"}</span>
            <span className="text-xs font-normal text-slate-500 font-mono">
              {runs?.length || 0} {isArabic ? "مسير" : "runs"}
            </span>
          </CardTitle>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start border-collapse">
              <thead>
                <tr className="border-b border-industrial-border bg-slate-100/75 text-slate-700 font-semibold">
                  <th className="py-2.5 px-3 text-start">رقم المسير</th>
                  <th className="py-2.5 px-3 text-start">الشهر / السنة</th>
                  <th className="py-2.5 px-3 text-start">تاريخ الصرف</th>
                  <th className="py-2.5 px-3 text-end">إجمالي الأساسي</th>
                  <th className="py-2.5 px-3 text-end">البدلات والعمولات</th>
                  <th className="py-2.5 px-3 text-end">سلف مستردة</th>
                  <th className="py-2.5 px-3 text-end">صافي المستحق للصرف</th>
                  <th className="py-2.5 px-3 text-center">الحالة</th>
                  <th className="py-2.5 px-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-industrial-border">
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={9} className="p-3">
                        <Skeleton className="h-6 w-full" />
                      </td>
                    </tr>
                  ))
                ) : runs?.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400">
                      {isArabic ? "لا توجد مسيرات رواتب مسجلة حتى الآن" : "No payroll runs recorded yet"}
                    </td>
                  </tr>
                ) : (
                  runs?.map((run) => (
                    <tr key={run.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                        {run.run_number}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-700">
                        {run.month} / {run.year}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {run.payroll_date}
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono tabular-nums text-slate-800">
                        {run.total_basic.toFixed(2)} ر.س
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono tabular-nums text-slate-800">
                        {(run.total_allowances + run.total_commissions + run.total_overtime).toFixed(2)} ر.س
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono tabular-nums font-bold text-rose-700">
                        {run.total_advance_deductions.toFixed(2)} ر.س
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono tabular-nums font-black text-emerald-800 text-sm">
                        {run.net_payable.toFixed(2)} ر.س
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge variant="emerald" className="text-[10px]">
                          معتمد ومرحل
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedRun(run);
                              setDetailsModalOpen(true);
                            }}
                            className="h-7 w-7 p-0 text-slate-600 hover:text-slate-900"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <PayrollSlipPrint payrollRun={run} settings={settings || null} />
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

      {/* Prepare Payroll Run Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center justify-between">
              <span>إعداد مسير رواتب العاملين لشهر: {selectedMonth}/{selectedYear}</span>
              <span className="text-xs font-mono font-normal text-slate-400">
                {draftLines.length} موظفاً
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2 text-xs">
            {/* Run Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div>
                <label className="font-bold text-slate-700 block mb-1">الشهر *</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="w-full h-8 px-2 rounded border border-industrial-border bg-white text-xs font-medium text-slate-800"
                >
                  {Array.from({ length: 12 }).map((_, i) => (
                    <option key={i + 1} value={i + 1}>
                      شهر {i + 1}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">السنة المالية *</label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="w-full h-8 px-2 rounded border border-industrial-border bg-white text-xs font-medium text-slate-800"
                >
                  <option value={2024}>2024</option>
                  <option value={2025}>2025</option>
                  <option value={2026}>2026</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">تاريخ استحقاق المسير *</label>
                <Input
                  type="date"
                  value={payrollDate}
                  onChange={(e) => setPayrollDate(e.target.value)}
                  className="h-8 text-xs font-mono bg-white"
                />
              </div>
            </div>

            {/* Editable Lines Table */}
            <div className="border border-industrial-border rounded-lg overflow-hidden">
              <table className="w-full text-xs text-start border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-industrial-border text-slate-700 font-semibold">
                    <th className="py-2 px-2 text-start">الموظف</th>
                    <th className="py-2 px-2 text-end">الأساسي</th>
                    <th className="py-2 px-2 text-end">البدلات</th>
                    <th className="py-2 px-2 text-end">عمولة المندوب</th>
                    <th className="py-2 px-2 text-end">إضافي / مكافأة</th>
                    <th className="py-2 px-2 text-end text-rose-700">خصم السلف</th>
                    <th className="py-2 px-2 text-end text-rose-700">خصم غياب/جزاء</th>
                    <th className="py-2 px-2 text-end font-bold">صافي الراتب</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-industrial-border">
                  {draftLines.map((line, idx) => (
                    <tr key={line.employee_id} className="bg-white hover:bg-slate-50/50">
                      <td className="p-2 font-medium text-slate-900">
                        {line.employee_name}
                        <span className="block font-mono text-[10px] text-slate-400">
                          {line.emp_code} - {line.department}
                        </span>
                      </td>
                      <td className="p-1.5 text-end font-mono tabular-nums text-slate-800">
                        {line.basic_salary.toFixed(2)}
                      </td>
                      <td className="p-1.5 text-end font-mono tabular-nums text-slate-800">
                        {(line.housing_allowance + line.transport_allowance + line.other_allowance).toFixed(2)}
                      </td>
                      <td className="p-1.5 text-end font-mono tabular-nums text-emerald-700 font-bold">
                        {line.commission_amount.toFixed(2)}
                      </td>
                      <td className="p-1.5 w-24">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.overtime_amount || ""}
                          onChange={(e) => handleUpdateLine(idx, "overtime_amount", Number(e.target.value))}
                          placeholder="0.00"
                          className="h-7 text-xs font-mono text-end"
                        />
                      </td>
                      <td className="p-1.5 w-24 text-end font-mono font-bold text-rose-700">
                        {line.advance_deduction.toFixed(2)}
                      </td>
                      <td className="p-1.5 w-24">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.penalty_deduction || ""}
                          onChange={(e) => handleUpdateLine(idx, "penalty_deduction", Number(e.target.value))}
                          placeholder="0.00"
                          className="h-7 text-xs font-mono text-end border-rose-200"
                        />
                      </td>
                      <td className="p-1.5 text-end font-mono font-bold text-slate-900 text-sm">
                        {line.net_salary.toFixed(2)} ر.س
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals Summary Footer */}
            <div className="bg-slate-900 text-white p-3 rounded-lg flex items-center justify-between text-xs">
              <div className="flex items-center gap-6">
                <div>
                  إجمالي الاستحقاق: <strong className="font-mono text-emerald-400 text-sm">{totalGrossDraft.toFixed(2)} ر.س</strong>
                </div>
                <div>
                  إجمالي استرداد السلف: <strong className="font-mono text-rose-400 text-sm">({totalAdvancesDraft.toFixed(2)}) ر.س</strong>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-300">صافي الرواتب المستحقة للصرف:</span>
                <span className="font-mono font-black text-lg text-emerald-400">
                  {totalNetPayableDraft.toFixed(2)} ر.س
                </span>
              </div>
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
              disabled={draftLines.length === 0 || createMutation.isPending}
              className="gap-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold"
            >
              {createMutation.isPending ? "جاري الترحيل..." : "ترحيل مسير الرواتب وقيد الاستحقاق"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
