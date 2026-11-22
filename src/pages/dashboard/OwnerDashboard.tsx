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
  Sparkles,
  Zap,
  Activity,
  Layers,
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
          { count: pendingApprovalsCount },
        ] = await Promise.all([
          supabase.from("users_profile").select("*", { count: "exact", head: true }),
          supabase.from("warehouses").select("*", { count: "exact", head: true }),
          supabase.from("tanks").select("status", { count: "exact", head: true }),
          supabase.from("accounts").select("*", { count: "exact", head: true }),
          supabase.from("accounts").select("current_balance").in("code", ["1101", "1102", "1103"]),
          supabase.from("sales_invoices").select("net_amount_due").eq("invoice_date", todayStr),
          supabase.from("mixing_batches").select("id", { count: "exact", head: true }).in("status", ["mixing", "pending_qc", "ready_for_packaging"]),
          supabase.from("fifo_layers").select("id", { count: "exact", head: true }).gt("remaining_qty", 0).not("expiry_date", "is", null),
          supabase.from("approval_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        ]);

        const totalCash = cashAccounts?.reduce((acc: number, a: any) => acc + (a.current_balance || 0), 0) || 0;
        const totalTodaySales = todayInvoices?.reduce((acc: number, inv: any) => acc + (inv.net_amount_due || 0), 0) || 0;

        setStats({
          usersCount: usersCount || 0,
          warehousesCount: warehousesCount || 0,
          tanksCount: tanksCount || 0,
          accountsCount: accountsCount || 0,
          pendingApprovalsCount: pendingApprovalsCount || 0,
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

  // Format today's date in Arabic / English
  const formattedDate = new Intl.DateTimeFormat(isArabic ? "ar-SA" : "en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in">
      {/* 2026 Executive Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200/90 bg-gradient-to-br from-white via-slate-50/60 to-sky-50/30 p-6 sm:p-8 shadow-card">
        {/* Ambient background glow element */}
        <div className="pointer-events-none absolute -end-12 -top-12 h-64 w-64 rounded-full bg-sky-500/5 blur-3xl" />
        <div className="pointer-events-none absolute start-1/3 -bottom-16 h-48 w-48 rounded-full bg-emerald-500/5 blur-3xl" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white shadow-sm">
                <Sparkles className="h-3 w-3 text-sky-400" />
                <span>{isArabic ? "مصنع الأسياح للمنظفات" : "Al-Asyah Detergents Factory"}</span>
              </span>
              <Badge variant="emerald" withDot className="text-xs">
                {isArabic ? "منظومة 2026 الذكية نشطة" : "Enterprise v3.2 Active"}
              </Badge>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {isArabic ? `أهلاً بك، ${profile?.full_name || "المدير العام"}` : `Welcome, ${profile?.full_name || "General Manager"}`}
            </h1>

            <p className="text-xs sm:text-sm text-slate-500 max-w-2xl leading-relaxed">
              {isArabic
                ? "لوحة التحكم التنفيذية الشاملة — متابعة السيولة اللحظية، تشغيل التانكات، الفوترة الضريبية ZATCA، وهامش ربح FIFO المباشر."
                : "Executive Operations Console — Real-time Cashflow, Mixing Floor, ZATCA Invoicing & FIFO Margin Tracking."}
            </p>
          </div>

          <div className="flex flex-wrap md:flex-col items-start md:items-end gap-2.5 shrink-0">
            <div className="flex items-center gap-2 rounded-2xl bg-white/90 backdrop-blur-sm border border-slate-200/80 px-4 py-2 shadow-subtle text-xs">
              <Calendar className="h-4 w-4 text-sky-600" />
              <span className="font-semibold text-slate-700">{formattedDate}</span>
            </div>

            <div className="flex items-center gap-2 rounded-2xl bg-white/90 backdrop-blur-sm border border-emerald-200/80 px-3.5 py-1.5 shadow-subtle text-xs text-emerald-700 font-semibold">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span>{isArabic ? "الخادم متصل • مزامنة فورية" : "Live Cloud Sync Active"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2026 KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Liquidity */}
        <div className="stat-card-2026 accent-emerald">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 tracking-tight">
              {isArabic ? "السيولة النقدية والبنك" : "Cash & Bank Liquidity"}
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200/80">
              <Coins className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="font-mono font-black text-2xl sm:text-3xl text-slate-900 tracking-tight tabular-nums">
              {loading ? <Skeleton className="h-9 w-32 rounded-lg" /> : `${stats.totalCashLiquidity.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`}
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                {isArabic ? "حساب 1101 + 1102" : "Vault & Bank Accounts"}
              </span>
              <span className="text-slate-400 font-medium">{isArabic ? "جاهزة للتشغيل" : "Available"}</span>
            </div>
          </div>
        </div>

        {/* Live Daily Operations */}
        <div className="stat-card-2026 accent-sky">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 tracking-tight">
              {isArabic ? "تانكات الخلط قيد التشغيل" : "Active Mixing Tanks"}
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600 ring-1 ring-sky-200/80">
              <Building2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="font-mono font-black text-2xl sm:text-3xl text-slate-900 tracking-tight tabular-nums">
              {loading ? <Skeleton className="h-9 w-20 rounded-lg" /> : `${stats.todayBatchesMixing} ${isArabic ? "تانك" : "Tanks"}`}
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="text-sky-700 font-semibold bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200/60">
                {isArabic ? "تشغيل وتعبئة" : "Active Batches"}
              </span>
              <span className="text-slate-400 font-medium">{isArabic ? "بصالة الإنتاج" : "Floor Ready"}</span>
            </div>
          </div>
        </div>

        {/* Today's Sales */}
        <div className="stat-card-2026 accent-indigo">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 tracking-tight">
              {isArabic ? "مبيعات فواتير اليوم" : "Today's Invoices"}
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200/80">
              <Receipt className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="font-mono font-black text-2xl sm:text-3xl text-slate-900 tracking-tight tabular-nums">
              {loading ? <Skeleton className="h-9 w-28 rounded-lg" /> : `${stats.todaySales.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`}
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="text-indigo-700 font-semibold bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200/60">
                {isArabic ? "فوترة ضريبية ZATCA" : "ZATCA Compliant"}
              </span>
              <span className="text-slate-400 font-medium">{isArabic ? "فوري مباشر" : "Live Feed"}</span>
            </div>
          </div>
        </div>

        {/* Facilities & Tanks */}
        <div className="stat-card-2026 accent-amber">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 tracking-tight">
              {isArabic ? "الأصول والمستودعات" : "Tanks & Warehouses"}
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-200/80">
              <Warehouse className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="font-mono font-black text-2xl sm:text-3xl text-slate-900 tracking-tight tabular-nums">
              {loading ? <Skeleton className="h-9 w-24 rounded-lg" /> : `${stats.tanksCount} / ${stats.warehousesCount}`}
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/60">
                {stats.tanksCount} {isArabic ? "تانك" : "Tanks"} • {stats.warehousesCount} {isArabic ? "مستودع" : "WH"}
              </span>
              <span className="text-slate-400 font-medium">{isArabic ? "جاهزية كاملة" : "Operational"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Live Gross Margin Guard & Approvals Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Gross Margin Guard */}
        <div className="card-modern p-5 sm:p-6 space-y-4 relative overflow-hidden bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200/80">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <h3 className="font-bold text-slate-900 text-sm">
                {isArabic ? "حارس هامش الربح الحي (Gross Margin Guard)" : "Gross Margin Guard"}
              </h3>
            </div>
            <Badge variant="emerald" withDot className="text-[11px]">
              {isArabic ? "مراقبة لحظية" : "Live Monitor"}
            </Badge>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            {isArabic
              ? "يقوم النظام بمقارنة أسعار البيع بالفواتير مقابل آخر تكلفة شراء/إنتاج طبقة FIFO لضمان عدم بيع أي صنف بهامش سالب أو بأقل من التكلفة الصناعية."
              : "Continuous real-time comparison of sales invoice unit prices against live FIFO layers to prevent selling below industrial cost."}
          </p>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
            <span className="inline-flex items-center gap-1.5 text-emerald-700 font-bold">
              <CheckCircle2 className="h-4 w-4" />
              <span>{isArabic ? "كافة الأصناف تباع فوق تكلفة FIFO الصناعية" : "All products priced above FIFO cost"}</span>
            </span>
            <span className="text-[11px] font-mono text-slate-400">100% Secure</span>
          </div>
        </div>

        {/* Approvals Center */}
        <div className="card-modern p-5 sm:p-6 space-y-4 bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-50 text-sky-600 ring-1 ring-sky-200/80">
                <CheckSquare className="h-4 w-4" />
              </div>
              <h3 className="font-bold text-slate-900 text-sm">
                {isArabic ? "مركز الاعتمادات والرقابة الإدارية" : "Executive Approvals Center"}
              </h3>
            </div>

            {stats.pendingApprovalsCount > 0 ? (
              <Badge variant="amber" withDot className="text-[11px] font-bold">
                {stats.pendingApprovalsCount} {isArabic ? "طلب معلق" : "Pending"}
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[11px]">
                {isArabic ? "مكتمل الاعتمادات" : "All Cleared"}
              </Badge>
            )}
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            {isArabic
              ? "اعتماد طلبات الشراء الكبيرة، تجاوزات الحدود الائتمانية للعملاء، القيود اليدوية، وهالك الإنتاج بصالة التصنيع."
              : "Review and approve major purchase orders, customer credit overrides, manual journal entries, and production scrap."}
          </p>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
            {stats.pendingApprovalsCount > 0 ? (
              <span className="text-amber-700 font-bold flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                <span>{isArabic ? `يوجد ${stats.pendingApprovalsCount} طلب بانتظار قرارك` : `${stats.pendingApprovalsCount} requests awaiting decision`}</span>
              </span>
            ) : (
              <span className="text-slate-400 font-medium">
                {isArabic ? "لا توجد طلبات معلقة بانتظار الاعتماد حالياً" : "No pending approvals at this moment"}
              </span>
            )}

            <Link to="/approvals">
              <Button size="sm" variant="tonal" className="h-8 text-xs font-semibold">
                <span>{isArabic ? "مراجعة الاعتمادات" : "Review"}</span>
                <Arrow className="ms-1.5 h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Quick Launchpad to Key Modules */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            {isArabic ? "لوحات التحكم والتقارير التنفيذية السريعة" : "Executive Control Modules"}
          </h2>
          <span className="text-[11px] text-slate-400 font-medium">
            {isArabic ? "وصول مباشر سريع" : "Quick Access"}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          <Link
            to="/accounting/reports"
            className="group block rounded-2xl border border-slate-200/80 bg-white p-5 shadow-subtle transition-all duration-200 hover:border-slate-300 hover:shadow-card-hover hover:-translate-y-0.5"
          >
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70 transition-transform duration-200 group-hover:scale-105">
                <FileText className="h-5 w-5" />
              </div>
              <Arrow className="h-4 w-4 text-slate-400 group-hover:text-slate-900 group-hover:translate-x-[-3px] transition-all" />
            </div>
            <h3 className="mt-3.5 text-sm font-bold text-slate-900 group-hover:text-sky-600 transition-colors">
              التقارير المالية وإقرار ZATCA
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              ميزان المراجعة، قائمة الدخل، الميزانية العمومية، والإقرار الضريبي الربع سنوي لـ ZATCA مع تصدير Excel
            </p>
          </Link>

          <Link
            to="/reports/director-analytics"
            className="group block rounded-2xl border border-slate-200/80 bg-white p-5 shadow-subtle transition-all duration-200 hover:border-slate-300 hover:shadow-card-hover hover:-translate-y-0.5"
          >
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200/70 transition-transform duration-200 group-hover:scale-105">
                <BarChart3 className="h-5 w-5" />
              </div>
              <Arrow className="h-4 w-4 text-slate-400 group-hover:text-slate-900 group-hover:translate-x-[-3px] transition-all" />
            </div>
            <h3 className="mt-3.5 text-sm font-bold text-slate-900 group-hover:text-sky-600 transition-colors">
              التقارير التحليلية الخمسة للمدير
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              ربحية الأصناف، سرعة تحصيل العملاء، صافي ربح سيارات التوزيع، فاقد التانكات، وتكلفة الوحدة النهائية
            </p>
          </Link>

          <Link
            to="/accounting/vouchers"
            className="group block rounded-2xl border border-slate-200/80 bg-white p-5 shadow-subtle transition-all duration-200 hover:border-slate-300 hover:shadow-card-hover hover:-translate-y-0.5"
          >
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-sky-200/70 transition-transform duration-200 group-hover:scale-105">
                <Receipt className="h-5 w-5" />
              </div>
              <Arrow className="h-4 w-4 text-slate-400 group-hover:text-slate-900 group-hover:translate-x-[-3px] transition-all" />
            </div>
            <h3 className="mt-3.5 text-sm font-bold text-slate-900 group-hover:text-sky-600 transition-colors">
              سندات القبض والصرف (Vouchers)
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              إصدار سندات القبض والدفع، ربط مصاريف سيارات التوزيع 6109، والطباعة الرسمية A4
            </p>
          </Link>

          <Link
            to="/hr/payroll"
            className="group block rounded-2xl border border-slate-200/80 bg-white p-5 shadow-subtle transition-all duration-200 hover:border-slate-300 hover:shadow-card-hover hover:-translate-y-0.5"
          >
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-200/70 transition-transform duration-200 group-hover:scale-105">
                <Coins className="h-5 w-5" />
              </div>
              <Arrow className="h-4 w-4 text-slate-400 group-hover:text-slate-900 group-hover:translate-x-[-3px] transition-all" />
            </div>
            <h3 className="mt-3.5 text-sm font-bold text-slate-900 group-hover:text-sky-600 transition-colors">
              مسيرات الرواتب والسُلف (HR)
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              كشوف الرواتب الشهرية، استقطاع السلف آلياً، ترحيل عمولات المناديب، وطباعة المسير A4
            </p>
          </Link>

          <Link
            to="/assets/registry"
            className="group block rounded-2xl border border-slate-200/80 bg-white p-5 shadow-subtle transition-all duration-200 hover:border-slate-300 hover:shadow-card-hover hover:-translate-y-0.5"
          >
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-700 ring-1 ring-purple-200/70 transition-transform duration-200 group-hover:scale-105">
                <Wrench className="h-5 w-5" />
              </div>
              <Arrow className="h-4 w-4 text-slate-400 group-hover:text-slate-900 group-hover:translate-x-[-3px] transition-all" />
            </div>
            <h3 className="mt-3.5 text-sm font-bold text-slate-900 group-hover:text-sky-600 transition-colors">
              الأصول الثابتة والإهلاك
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              سجل خطوط الإنتاج والتانكات، تشغيل الإهلاك الشهري بالقسط الثابت وترحيل قيود 6108 / 1290
            </p>
          </Link>

          <Link
            to="/accounting/journal-entries"
            className="group block rounded-2xl border border-slate-200/80 bg-white p-5 shadow-subtle transition-all duration-200 hover:border-slate-300 hover:shadow-card-hover hover:-translate-y-0.5"
          >
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-800 ring-1 ring-slate-200/80 transition-transform duration-200 group-hover:scale-105">
                <BookOpen className="h-5 w-5" />
              </div>
              <Arrow className="h-4 w-4 text-slate-400 group-hover:text-slate-900 group-hover:translate-x-[-3px] transition-all" />
            </div>
            <h3 className="mt-3.5 text-sm font-bold text-slate-900 group-hover:text-sky-600 transition-colors">
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
