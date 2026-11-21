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
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

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
    periodsCount: number;
    recentAuditsCount: number;
    activeTanksEmpty: number;
  }>({
    usersCount: 0,
    warehousesCount: 0,
    tanksCount: 0,
    accountsCount: 0,
    periodsCount: 0,
    recentAuditsCount: 0,
    activeTanksEmpty: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [
          { count: usersCount },
          { count: warehousesCount },
          { count: tanksCount, data: tanksData },
          { count: accountsCount },
          { count: periodsCount },
          { count: auditsCount },
        ] = await Promise.all([
          supabase.from("users_profile").select("*", { count: "exact", head: true }),
          supabase.from("warehouses").select("*", { count: "exact", head: true }),
          supabase.from("tanks").select("status", { count: "exact" }),
          supabase.from("accounts").select("*", { count: "exact", head: true }),
          supabase.from("fiscal_periods").select("*", { count: "exact", head: true }),
          supabase.from("audit_logs").select("*", { count: "exact", head: true }),
        ]);

        const emptyTanks = tanksData ? (tanksData as any[]).filter((t) => t.status === "empty").length : 0;

        setStats({
          usersCount: usersCount || 0,
          warehousesCount: warehousesCount || 0,
          tanksCount: tanksCount || 0,
          accountsCount: accountsCount || 0,
          periodsCount: periodsCount || 0,
          recentAuditsCount: auditsCount || 0,
          activeTanksEmpty: emptyTanks,
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
              <h1 className="text-xl sm:text-2xl font-bold text-industrial-primary">
                {isArabic ? `مرحباً، ${profile?.full_name}` : `Welcome, ${profile?.full_name}`}
              </h1>
              <Badge variant="emerald" className="text-xs">
                {isArabic ? "المرحلة 1: التأسيس نشطة" : "Phase 1: Foundation Active"}
              </Badge>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-slate-500">
              {isArabic
                ? "لوحة التحكم الرئيسية للمدير العام — إدارة منشأة تصنيع المنظفات، شجرة الحسابات، وصلاحيات النظام"
                : "Executive Operations Console — Detergent Factory Setup, Industrial COA & Security"}
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
        {/* Facilities / Tanks */}
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>{isArabic ? "التانكات والمستودعات" : "Facilities & Tanks"}</span>
              <Warehouse className="h-4 w-4 text-sky-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold tabular-nums">
              {loading ? <Skeleton className="h-8 w-16" /> : `${stats.tanksCount} / ${stats.warehousesCount}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-slate-500">
            {isArabic ? `${stats.tanksCount} تانك خلط • ${stats.warehousesCount} مستودع` : `${stats.tanksCount} tanks • ${stats.warehousesCount} warehouses`}
          </CardContent>
        </Card>

        {/* Users */}
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>{isArabic ? "فريق العمل والموظفون" : "Staff & Users"}</span>
              <Users className="h-4 w-4 text-emerald-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold tabular-nums">
              {loading ? <Skeleton className="h-8 w-12" /> : stats.usersCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-slate-500">
            {isArabic ? "أدوار مفروزة وصلاحيات صارمة" : "Locked RBAC roles"}
          </CardContent>
        </Card>

        {/* Chart of Accounts */}
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>{isArabic ? "شجرة الحسابات (COA)" : "Chart of Accounts"}</span>
              <BookOpen className="h-4 w-4 text-amber-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold tabular-nums">
              {loading ? <Skeleton className="h-8 w-12" /> : stats.accountsCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-slate-500">
            {isArabic ? "دليل محاسبي صناعي سعودي" : "Saudi Industrial COA"}
          </CardContent>
        </Card>

        {/* Audit Log */}
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>{isArabic ? "سجل الرقابة والأمان" : "Audit Log Records"}</span>
              <ShieldCheck className="h-4 w-4 text-purple-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold tabular-nums">
              {loading ? <Skeleton className="h-8 w-12" /> : stats.recentAuditsCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-slate-500">
            {isArabic ? "سجل تدقيق غير قابل للتعديل" : "Append-only security audit"}
          </CardContent>
        </Card>
      </div>

      {/* Quick Launchpad to Phase 1 Functional Modules */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
          {isArabic ? "وحدات المرحلة 1 المتاحة" : "Phase 1 Active Modules"}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link
            to="/settings/factory"
            className="group block rounded-lg border border-industrial-border bg-white p-5 shadow-sm transition hover:border-accent hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div className="rounded-lg bg-sky-50 p-2 text-accent">
                <Building2 className="h-5 w-5" />
              </div>
              <Arrow className="h-4 w-4 text-slate-400 group-hover:text-accent group-hover:translate-x-[-2px] transition-transform" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-industrial-primary">
              {t("factory.title")}
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              {t("factory.subtitle")}
            </p>
          </Link>

          <Link
            to="/settings/users"
            className="group block rounded-lg border border-industrial-border bg-white p-5 shadow-sm transition hover:border-accent hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
                <Users className="h-5 w-5" />
              </div>
              <Arrow className="h-4 w-4 text-slate-400 group-hover:text-accent group-hover:translate-x-[-2px] transition-transform" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-industrial-primary">
              {t("users.title")}
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              {t("users.subtitle")}
            </p>
          </Link>

          <Link
            to="/settings/facilities"
            className="group block rounded-lg border border-industrial-border bg-white p-5 shadow-sm transition hover:border-accent hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
                <Warehouse className="h-5 w-5" />
              </div>
              <Arrow className="h-4 w-4 text-slate-400 group-hover:text-accent group-hover:translate-x-[-2px] transition-transform" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-industrial-primary">
              {t("facilities.warehousesTitle")} & {t("facilities.tanksTitle")}
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              {isArabic
                ? "إدارة مستودعات الخامات، مواد التعبئة، التام، وسيارات التوزيع مع تانكات الخلط"
                : "Manage raw, packaging, finished goods & van warehouses with bulk tanks"}
            </p>
          </Link>

          <Link
            to="/accounting/coa"
            className="group block rounded-lg border border-industrial-border bg-white p-5 shadow-sm transition hover:border-accent hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div className="rounded-lg bg-amber-50 p-2 text-amber-600">
                <BookOpen className="h-5 w-5" />
              </div>
              <Arrow className="h-4 w-4 text-slate-400 group-hover:text-accent group-hover:translate-x-[-2px] transition-transform" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-industrial-primary">
              {t("coa.title")}
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              {t("coa.subtitle")}
            </p>
          </Link>

          <Link
            to="/accounting/periods"
            className="group block rounded-lg border border-industrial-border bg-white p-5 shadow-sm transition hover:border-accent hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div className="rounded-lg bg-rose-50 p-2 text-rose-600">
                <Calendar className="h-5 w-5" />
              </div>
              <Arrow className="h-4 w-4 text-slate-400 group-hover:text-accent group-hover:translate-x-[-2px] transition-transform" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-industrial-primary">
              {t("periods.title")}
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              {t("periods.subtitle")}
            </p>
          </Link>

          <Link
            to="/settings/audit-log"
            className="group block rounded-lg border border-industrial-border bg-white p-5 shadow-sm transition hover:border-accent hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div className="rounded-lg bg-slate-100 p-2 text-slate-700">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <Arrow className="h-4 w-4 text-slate-400 group-hover:text-accent group-hover:translate-x-[-2px] transition-transform" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-industrial-primary">
              {t("audit.title")}
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              {t("audit.subtitle")}
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
