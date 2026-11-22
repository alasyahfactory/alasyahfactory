import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import {
  CalendarCheck,
  AlertTriangle,
  Lock,
  ArrowRight,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export function YearEndClosingPage() {
  const { user, isOwner } = useAuth();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const isArabic = i18n.language === "ar";

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear - 1);
  const [closingDate, setClosingDate] = useState<string>(`${selectedYear}-12-31`);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  // Fetch summary of current revenues and expenses
  const { data: closingPreview, isLoading } = useQuery({
    queryKey: ["year_end_closing_preview", selectedYear],
    queryFn: async () => {
      const { data: revData } = await supabase
        .from("accounts")
        .select("current_balance")
        .in("type", ["revenue", "contra_revenue"]);
      const { data: expData } = await supabase
        .from("accounts")
        .select("current_balance")
        .in("type", ["expense", "cogs"]);

      const totalRev = revData?.reduce((acc: number, a: any) => acc + (a.current_balance || 0), 0) || 0;
      const totalExp = expData?.reduce((acc: number, a: any) => acc + (a.current_balance || 0), 0) || 0;
      const netProfit = totalRev - totalExp;

      return {
        totalRevenue: totalRev,
        totalExpense: totalExp,
        netProfit,
      };
    },
  });

  // Execute Year End Closing Mutation
  const closingMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("rpc_year_end_closing", {
        p_fiscal_year: selectedYear,
        p_closing_date: closingDate,
        p_created_by: user?.id,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (res) => {
      toast.success(
        isArabic
          ? `تم تنفيذ الإقفال السنوي لعام ${selectedYear} وترحيل صافي الربح (${res.net_profit} ر.س) بنجاح`
          : "Year-End closing executed successfully"
      );
      queryClient.invalidateQueries({ queryKey: ["financial_reports_rpc"] });
      queryClient.invalidateQueries({ queryKey: ["coa_accounts"] });
      queryClient.invalidateQueries({ queryKey: ["fiscal_periods_list"] });
      setConfirmModalOpen(false);
    },
    onError: (err: any) => {
      toast.error(err.message || (isArabic ? "فشل تنفيذ الإقفال السنوي" : "Year-end closing failed"));
    },
  });

  // Full-page in-place Canvas for Confirmation
  if (confirmModalOpen) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto pb-16 animate-in fade-in duration-200">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-rose-200 dark:border-rose-950 shadow-sm">
          <div className="flex items-center gap-3">
            <Button
              variant="tonal"
              size="sm"
              onClick={() => setConfirmModalOpen(false)}
              className="gap-1.5"
            >
              <ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
              <span>العودة لمعالج الإقفال</span>
            </Button>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-rose-700 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                <span>تأكيد الإقفال السنوي لعام {selectedYear}</span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                تأكيد الإقفال النهائي وترحيل صافي الأرباح لحساب 3201
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmModalOpen(false)}
              disabled={closingMutation.isPending}
            >
              إلغاء التراجع
            </Button>
            <Button
              onClick={() => closingMutation.mutate()}
              disabled={closingMutation.isPending}
              className="bg-rose-700 hover:bg-rose-800 text-white min-h-[40px] px-6 font-semibold"
            >
              {closingMutation.isPending ? "جاري الإقفال..." : "تأكيد الإقفال وترحيل الأرباح"}
            </Button>
          </div>
        </div>

        <Card className="border-rose-200 shadow-sm p-6 space-y-4 bg-white dark:bg-slate-900">
          <div className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed space-y-3">
            <p>
              أنت على وشك تنفيذ الإقفال النهائي للسنة المالية <strong>{selectedYear}</strong> بتاريخ <strong>{closingDate}</strong>.
            </p>
            <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl font-mono text-center font-bold text-rose-900 dark:text-rose-200 text-lg">
              صافي الربح المرحل لحساب الأرباح المبقاة: {closingPreview?.netProfit.toFixed(2)} ر.س
            </div>
            <p className="text-rose-600 dark:text-rose-400 font-semibold text-xs">
              تنبيه: سيتم تصفير حسابات الإيرادات والمصروفات وقفل فترات السنة لمنع التعديل. هل أنت متأكد من المتابعة؟
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
          <CalendarCheck className="h-6 w-6 text-industrial-accent" />
          {isArabic ? "معالج الإقفال السنوي وترحيل الأرباح (Year-End Closing)" : "Year-End Closing Wizard"}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {isArabic
            ? "معالج محاسبي اختياري لإقفال حسابات الإيرادات والمصروفات وترحيل صافي أرباح/خسائر العام إلى حساب الأرباح المبقاة (3201) وقفل الفترات المالية"
            : "Optional accounting wizard to zero out revenue/expense accounts and transfer net profit to Retained Earnings (3201)"}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Configuration Card */}
        <Card className="border-industrial-border bg-white shadow-sm p-4 space-y-4">
          <h3 className="font-bold text-slate-900 border-b pb-2">
            إعدادات السنة المالية المستهدفة
          </h3>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              السنة المالية للإقفال *
            </label>
            <select
              value={selectedYear}
              onChange={(e) => {
                const yr = Number(e.target.value);
                setSelectedYear(yr);
                setClosingDate(`${yr}-12-31`);
              }}
              className="w-full h-9 px-3 rounded-md border border-industrial-border bg-slate-50 text-xs font-bold text-slate-800"
            >
              <option value={2024}>السنة المالية 2024</option>
              <option value={2025}>السنة المالية 2025</option>
              <option value={2026}>السنة المالية 2026</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              تاريخ قيد الإقفال السنوي *
            </label>
            <Input
              type="date"
              value={closingDate}
              onChange={(e) => setClosingDate(e.target.value)}
              className="bg-slate-50 border-industrial-border text-xs font-mono"
            />
          </div>

          <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-900 space-y-1.5">
            <div className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span>تنبيه هام ومحاسبي صارم:</span>
            </div>
            <p>
              تنفيذ هذا المعالج سيقوم بتصفير أرصدة جميع حسابات الإيرادات والمصروفات للفترة ونقل الفارق كقيد متوازن إلى
              حساب <strong>الأرباح المبقاة (3201)</strong>، مع قفل كامل الفترات المالية التابعة لهذه السنة.
            </p>
          </div>

          <Button
            onClick={() => setConfirmModalOpen(true)}
            disabled={closingMutation.isPending || !isOwner}
            className="w-full gap-2 bg-slate-900 text-white hover:bg-slate-800 font-bold"
          >
            <Lock className="h-4 w-4" />
            <span>تنفيذ الإقفال السنوي الآن</span>
          </Button>

          {!isOwner && (
            <p className="text-[11px] text-rose-600 text-center font-medium">
              * صلاحية تنفيذ الإقفال السنوي مقتصرة حصراً على المدير العام (Owner)
            </p>
          )}
        </Card>

        {/* Financial Preview Card */}
        <Card className="border-industrial-border bg-white shadow-sm p-4 space-y-4 md:col-span-2">
          <h3 className="font-bold text-slate-900 border-b pb-2 flex items-center justify-between">
            <span>معاينة الأثر المالي للإقفال السنوي للسنة {selectedYear}</span>
            <Badge variant="outline">حساب 3201</Badge>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-xs text-slate-500 font-medium block">إجمالي الإيرادات المقفلة</span>
              <span className="font-mono font-black text-xl text-slate-900 block mt-1">
                {closingPreview?.totalRevenue.toFixed(2)} ر.س
              </span>
              <span className="text-[10px] text-slate-400">سيتم جعلها مدينة (Dr) بقيمة رصيدها لتصفيرها</span>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-xs text-slate-500 font-medium block">إجمالي المصروفات المقفلة</span>
              <span className="font-mono font-black text-xl text-rose-700 block mt-1">
                {closingPreview?.totalExpense.toFixed(2)} ر.س
              </span>
              <span className="text-[10px] text-slate-400">سيتم جعلها دائنة (Cr) بقيمة رصيدها لتصفيرها</span>
            </div>

            <div className="p-3.5 bg-emerald-50 rounded-lg border border-emerald-200">
              <span className="text-xs text-emerald-800 font-medium block">صافي الأرباح المرحلة لحساب 3201</span>
              <span className="font-mono font-black text-xl text-emerald-700 block mt-1">
                {closingPreview?.netProfit.toFixed(2)} ر.س
              </span>
              <span className="text-[10px] text-emerald-600">ستُرحّل إلى حقوق الملكية / الأرباح المبقاة</span>
            </div>
          </div>

          <div className="p-3 bg-slate-100 rounded-lg text-xs space-y-2">
            <div className="font-bold text-slate-800">ما هي خطوات المعالج التلقائية؟</div>
            <ul className="list-disc list-inside space-y-1 text-slate-600">
              <li>توليد قيد يومية سنوي متوازن غير قابل للتعديل برقم <code>JV-{selectedYear}-YE-001</code>.</li>
              <li>تصفير أرصدة المبيعات وتكلفة البضاعة المباعة ومصروفات التشغيل.</li>
              <li>ترحيل صافي الربح إلى حساب <strong>3201 الأرباح المبقاة</strong>.</li>
              <li>قفل جميع الفترات المالية التابعة لسنة {selectedYear} لمنع تسجيل أي حركات بأثر رجعي.</li>
            </ul>
          </div>
        </Card>
      </div>
    </div>
  );
}
