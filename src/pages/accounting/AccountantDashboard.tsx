import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { BookOpen, Calendar, ArrowRight, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function AccountantDashboard() {
  const { profile } = useAuth();
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const Arrow = isArabic ? ArrowLeft : ArrowRight;

  const [stats, setStats] = useState({
    accountsCount: 0,
    openPeriodsCount: 0,
    lockedPeriodsCount: 0,
  });

  useEffect(() => {
    async function loadStats() {
      const [{ count: accCount }, { data: periods }] = await Promise.all([
        supabase.from("accounts").select("*", { count: "exact", head: true }),
        supabase.from("fiscal_periods").select("is_locked"),
      ]);

      const openCount = periods ? (periods as any[]).filter((p) => !p.is_locked).length : 0;
      const lockedCount = periods ? (periods as any[]).filter((p) => p.is_locked).length : 0;

      setStats({
        accountsCount: accCount || 0,
        openPeriodsCount: openCount,
        lockedPeriodsCount: lockedCount,
      });
    }

    loadStats();
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-industrial-border bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-industrial-primary">
                {isArabic ? `بوابة المحاسبة — ${profile?.full_name}` : `Accounting Portal — ${profile?.full_name}`}
              </h1>
              <Badge variant="emerald" className="text-xs">
                {t("roles.accountant")}
              </Badge>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-slate-500">
              {isArabic
                ? "متابعة شجرة الحسابات الصناعية، الفترات المالية والإقفالات المحاسبية"
                : "Manage Saudi industrial COA, fiscal periods and ledger lockouts"}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs">{t("nav.coa")}</CardDescription>
            <CardTitle className="text-2xl font-bold tabular-nums">
              {stats.accountsCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-slate-500">
            {isArabic ? "حساب في الدليل الموحد" : "Total registered accounts"}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs">{isArabic ? "فترات مالية مفتوحة" : "Open Periods"}</CardDescription>
            <CardTitle className="text-2xl font-bold text-emerald-600 tabular-nums">
              {stats.openPeriodsCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-slate-500">
            {isArabic ? "متاحة للتسجيل والقيود" : "Open for posting"}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs">{isArabic ? "فترات مقفلة" : "Locked Periods"}</CardDescription>
            <CardTitle className="text-2xl font-bold text-slate-600 tabular-nums">
              {stats.lockedPeriodsCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-slate-500">
            {isArabic ? "محمية من أي تعديل بأثر رجعي" : "Locked against retroactive entries"}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
      </div>
    </div>
  );
}
