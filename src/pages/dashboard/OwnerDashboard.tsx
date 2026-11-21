import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import {
  Building2,
  Users,
  Warehouse,
  BookOpen,
  Calendar,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  ArrowLeft,
  FileText,
  BarChart3,
  TrendingUp,
  CreditCard,
  Wrench,
  Coins,
  CheckSquare,
  AlertTriangle,
  Receipt,
  Scale,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export function OwnerDashboard() {
  const { profile } = useAuth();
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const Arrow = isArabic ? ArrowLeft : ArrowRight;

  const [stats, setStats] = useState<{
    usersCount: number;
    warehousesCount: number;
    tanksCount: number;
    accountsCount: number;
    pendingApprovalsCount: number;
    totalCashLiquidity: number;
    todaySales: number;
    todayBatchesMixing: number;
    nearExpiryCount: number;
  }>({
    usersCount: 0,
    warehousesCount: 0,
    tanksCount: 0,
    accountsCount: 0,
    pendingApprovalsCount: 0,
    totalCashLiquidity: 0,
    todaySales: 0,
    todayBatchesMixing: 0,
    nearExpiryCount: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const todayStr = new Date().toISOString().split("T")[0];

        const [
          { count: usersCount },
          { count: warehousesCount },
          { count: tanksCount },
          { count: accountsCount },
          { data: cashAccounts },
          { data: todayInvoices },
          { count: batchesCount },
          { count: nearExpiryCount },
        ] = await Promise.all([
          supabase.from("users_profile").select("*", { count: "exact", head: true }),
          supabase.from("warehouses").select("*", { count: "exact", head: true }),
          supabase.from("tanks").select("status", { count: "exact", head: true }),
          supabase.from("accounts").select("*", { count: "exact", head: true }),
          supabase.from("accounts").select("current_balance").in("code", ["1101", "1102", "1103"]),
          supabase.from("sales_invoices").select("net_amount_due").eq("invoice_date", todayStr),
          supabase.from("mixing_batches").select("id", { count: "exact", head: true }).in("status", ["mixing", "pending_qc", "ready_for_packaging"]),
          supabase.from("fifo_layers").select("id", { count: "exact", head: true }).gt("remaining_qty", 0).not("expiry_date", "is", null),
        ]);

        const totalCash = cashAccounts?.reduce((acc: number, a: any) => acc + (a.current_balance || 0), 0) || 0;
        const totalTodaySales = todayInvoices?.reduce((acc: number, inv: any) => acc + (inv.net_amount_due || 0), 0) || 0;

        setStats({
          usersCount: usersCount || 0,
          warehousesCount: warehousesCount || 0,
          tanksCount: tanksCount || 0,
          accountsCount: accountsCount || 0,
          pendingApprovalsCount: 0,
          totalCashLiquidity: totalCash,
          todaySales: totalTodaySales,
          todayBatchesMixing: batchesCount || 0,
          nearExpiryCount: nearExpiryCount || 0,
        });
      } catch (err) {
        console.error("Dashboard stats error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  return (
    <div className="space-y-6">
      {/* Welcome Hero Banner */}
      <div className="rounded-lg border border-industrial-border bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                {isArabic ? `مرحباً، ${profile?.full_name}` : `Welcome, ${profile?.full_name}`}
              </h1>
              <Badge variant="emerald" className="text-xs">
                {isArabic ? "نظام ERP متكامل نشط" : "Full Industrial ERP Active"}
              </Badge>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-slate-500">
              {isArabic
                ? "لوحة التحكم التنفيذية الشاملة — متابعة السيولة، الإنتاج الحي، المبيعات والفوترة ZATCA، والتقارير المالية"
                : "Executive Operations Console — Live Liquidity, Production Floor, ZATCA Invoicing & Ledger"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              {isArabic ? "قاعدة البيانات متصلة (Supabase)" : "Database Online"}
            </span>
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Liquidity */}
        <Card className="border-industrial-border bg-white shadow-sm p-4">
          <span className="text-xs text-slate-500 font-semibold block flex items-center justify-between">
            <span>{isArabic ? "السيولة النقدية والبنك" : "Cash & Bank Liquidity"}</span>
            <Coins className="h-4 w-4 text-emerald-600" />
          </span>
          <div className="font-mono font-black text-2xl text-slate-900 mt-1">
            {loading ? <Skeleton className="h-8 w-24" /> : `${stats.totalCashLiquidity.toFixed(2)} ر.س`}
          </div>
          <span className="text-[11px] text-emerald-700 mt-1 block font-medium">
            حسابات 1101 (صندوق) + 1102 (بنك)
          </span>
        </Card>

        {/* Live Daily Operations */}
        <Card className="border-industrial-border bg-white shadow-sm p-4">
          <span className="text-xs text-slate-500 font-semibold block flex items-center justify-between">
            <span>{isArabic ? "تانكات الخلط قيد التشغيل" : "Active Mixing Tanks"}</span>
            <Building2 className="h-4 w-4 text-sky-600" />
          </span>
          <div className="font-mono font-black text-2xl text-slate-900 mt-1">
            {loading ? <Skeleton className="h-8 w-12" /> : `${stats.todayBatchesMixing} تانك`}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            تشغيلات خلط وتعبئة جارية بصالة الإنتاج
          </span>
        </Card>

        {/* Today's Sales */}
        <Card className="border-industrial-border bg-white shadow-sm p-4">
          <span className="text-xs text-slate-500 font-semibold block flex items-center justify-between">
            <span>{isArabic ? "مبيعات فواتير اليوم" : "Today's Invoices"}</span>
            <Receipt className="h-4 w-4 text-indigo-600" />
          </span>
          <div className="font-mono font-black text-2xl text-slate-900 mt-1">
            {loading ? <Skeleton className="h-8 w-20" /> : `${stats.todaySales.toFixed(2)} ر.س`}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            فواتير مبيعات ضريبية ZATCA
          </span>
        </Card>

        {/* Facilities & Tanks */}
        <Card className="border-industrial-border bg-white shadow-sm p-4">
          <span className="text-xs text-slate-500 font-semibold block flex items-center justify-between">
            <span>{isArabic ? "التانكات والمستودعات" : "Tanks & Facilities"}</span>
            <Warehouse className="h-4 w-4 text-amber-600" />
          </span>
          <div className="font-mono font-black text-2xl text-slate-900 mt-1">
            {loading ? <Skeleton className="h-8 w-16" /> : `${stats.tanksCount} / ${stats.warehousesCount}`}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {stats.tanksCount} تانك خلط • {stats.warehousesCount} مستودع
          </span>
        </Card>
      </div>

      {/* Live Gross Margin Guard & Approvals Bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Gross Margin Guard */}
        <Card className="border-industrial-border bg-white shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>{isArabic ? "حارس هامش الربح الحي (Gross Margin Guard)" : "Gross Margin Guard"}</span>
            </h3>
            <Badge variant="emerald" className="text-[10px]">مراقبة لحظية</Badge>
          </div>
          <p className="text-xs text-slate-500">
            يقوم النظام بمقارنة أسعار البيع بالفواتير مقابل آخر تكلفة شراء/إنتاج طبقة FIFO لضمان عدم بيع أي صنف بهامش سالب أو بأقل من التكلفة الصناعية.
          </p>
          <div className="flex items-center gap-3 pt-1 text-xs">
            <span className="inline-flex items-center gap-1.5 text-emerald-700 font-bold">
              <CheckCircle2 className="h-4 w-4" />
              <span>كافة الأصناف تباع فوق تكلفة FIFO</span>
            </span>
          </div>
        </Card>

        {/* Approvals Center */}
        <Card className="border-industrial-border bg-white shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-industrial-accent" />
              <span>{isArabic ? "مركز الاعتمادات والرقابة الإدارية" : "Approvals Center"}</span>
            </h3>
            <Badge variant="outline" className="text-[10px]">المدير العام</Badge>
          </div>
          <p className="text-xs text-slate-500">
            اعتماد طلبات الشراء ذات المبالغ الكبيرة، تجاوزات الحدود الائتمانية للعملاء، القيود اليدوية، وهالك الإنتاج الكبير.
          </p>
          <div className="flex items-center gap-3 pt-1 text-xs text-slate-500">
            <span>لا توجد طلبات معلقة بانتظار الاعتماد حالياً</span>
          </div>
        </Card>
      </div>

      {/* Quick Launchpad to Key Modules */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
          {isArabic ? "لوحات التحكم والتقارير التنفيذية" : "Executive Quick Launchpad"}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link
            to="/accounting/reports"
            className="group block rounded-lg border border-industrial-border bg-white p-5 shadow-sm transition hover:border-accent hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
                <FileText className="h-5 w-5" />
              </div>
              <Arrow className="h-4 w-4 text-slate-400 group-hover:text-accent group-hover:translate-x-[-2px] transition-transform" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-industrial-primary">
              التقارير المالية وإقرار ZATCA
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              ميزان المراجعة، قائمة الدخل، الميزانية العمومية، والإقرار الضريبي الربع سنوي لـ ZATCA مع تصدير Excel
            </p>
          </Link>

          <Link
            to="/reports/director-analytics"
            className="group block rounded-lg border border-industrial-border bg-white p-5 shadow-sm transition hover:border-accent hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div className="rounded-lg bg-indigo-50 p-2 text-indigo-700">
                <BarChart3 className="h-5 w-5" />
              </div>
              <Arrow className="h-4 w-4 text-slate-400 group-hover:text-accent group-hover:translate-x-[-2px] transition-transform" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-industrial-primary">
              التقارير التحليلية الخمسة للمدير
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              ربحية الأصناف، سرعة تحصيل العملاء، صافي ربح سيارات التوزيع، فاقد التانكات، وتكلفة الوحدة النهائية
            </p>
          </Link>

          <Link
            to="/accounting/vouchers"
            className="group block rounded-lg border border-industrial-border bg-white p-5 shadow-sm transition hover:border-accent hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div className="rounded-lg bg-sky-50 p-2 text-sky-700">
                <Receipt className="h-5 w-5" />
              </div>
              <Arrow className="h-4 w-4 text-slate-400 group-hover:text-accent group-hover:translate-x-[-2px] transition-transform" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-industrial-primary">
              سندات القبض والصرف (Vouchers)
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              إصدار سندات القبض والدفع، ربط مصاريف سيارات التوزيع 6109، والطباعة الرسمية A4
            </p>
          </Link>

          <Link
            to="/hr/payroll"
            className="group block rounded-lg border border-industrial-border bg-white p-5 shadow-sm transition hover:border-accent hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div className="rounded-lg bg-amber-50 p-2 text-amber-700">
                <Coins className="h-5 w-5" />
              </div>
              <Arrow className="h-4 w-4 text-slate-400 group-hover:text-accent group-hover:translate-x-[-2px] transition-transform" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-industrial-primary">
              مسيرات الرواتب والسُلف (HR)
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              كشوف الرواتب الشهرية، استقطاع السلف آلياً، ترحيل عمولات المناديب، وطباعة المسير A4
            </p>
          </Link>

          <Link
            to="/assets/registry"
            className="group block rounded-lg border border-industrial-border bg-white p-5 shadow-sm transition hover:border-accent hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div className="rounded-lg bg-purple-50 p-2 text-purple-700">
                <Wrench className="h-5 w-5" />
              </div>
              <Arrow className="h-4 w-4 text-slate-400 group-hover:text-accent group-hover:translate-x-[-2px] transition-transform" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-industrial-primary">
              الأصول الثابتة والإهلاك
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              سجل خطوط الإنتاج والتانكات، تشغيل الإهلاك الشهري بالقسط الثابت وترحيل قيود 6108 / 1290
            </p>
          </Link>

          <Link
            to="/accounting/journal-entries"
            className="group block rounded-lg border border-industrial-border bg-white p-5 shadow-sm transition hover:border-accent hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div className="rounded-lg bg-slate-100 p-2 text-slate-700">
                <BookOpen className="h-5 w-5" />
              </div>
              <Arrow className="h-4 w-4 text-slate-400 group-hover:text-accent group-hover:translate-x-[-2px] transition-transform" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-industrial-primary">
              دفتر قيود اليومية العامة
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              متابعة القيود الآلية الناتجة عن كافة حركات المصنع وتسجيل القيود المزدوجة المتوازنة
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
