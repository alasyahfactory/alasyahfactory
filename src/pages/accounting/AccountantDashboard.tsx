import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { BookOpen, Calendar, ArrowRight, ArrowLeft, FileText, Receipt, Shield, Sparkles } from "lucide-react";
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
    <div className="space-y-6 sm:space-y-8 animate-fade-in">
      {/* 2026 Accountant Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200/90 bg-gradient-to-br from-white via-slate-50/60 to-emerald-50/25 p-6 sm:p-8 shadow-card">
        <div className="pointer-events-none absolute -end-12 -top-12 h-64 w-64 rounded-full bg-emerald-500/5 blur-3xl" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white shadow-sm">
                <Sparkles className="h-3 w-3 text-emerald-400" />
                <span>{isArabic ? "الإدارة المالية والمحاسبية" : "Financial Accounting Hub"}</span>
              </span>
              <Badge variant="emerald" withDot className="text-xs">
                {t("roles.accountant")}
              </Badge>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {isArabic ? `بوابة المحاسبة — ${profile?.full_name}` : `Accounting Portal — ${profile?.full_name}`}
            </h1>

            <p className="text-xs sm:text-sm text-slate-500 max-w-2xl leading-relaxed">
              {isArabic
                ? "متابعة شجرة الحسابات الصناعية الموحدة، الفترات المالية المحمية، قيود اليومية المزدوجة، وإقرارات ZATCA الضريبية."
                : "Manage Saudi industrial COA, protected fiscal periods, balanced double-entry journals, and quarterly ZATCA declarations."}
            </p>
          </div>
        </div>
      </div>

      {/* 3 Modern Financial Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="stat-card-2026 accent-sky">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 tracking-tight">{t("nav.coa")}</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600 ring-1 ring-sky-200/80">
              <BookOpen className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="font-mono font-black text-3xl text-slate-900 tracking-tight tabular-nums">
              {stats.accountsCount}
            </div>
            <div className="mt-2 text-[11px] text-slate-500 font-medium">
              {isArabic ? "حساب مالي معتمد في الدليل الموحد" : "Total registered ledger accounts"}
            </div>
          </div>
        </div>

        <div className="stat-card-2026 accent-emerald">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 tracking-tight">{isArabic ? "فترات مالية مفتوحة" : "Open Periods"}</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200/80">
              <Calendar className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="font-mono font-black text-3xl text-emerald-700 tracking-tight tabular-nums">
              {stats.openPeriodsCount}
            </div>
            <div className="mt-2 text-[11px] text-emerald-700 font-semibold">
              {isArabic ? "متاحة للتسجيل والترحيل الفوري" : "Open for posting and ledger entries"}
            </div>
          </div>
        </div>

        <div className="stat-card-2026 accent-amber">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 tracking-tight">{isArabic ? "فترات مقفلة" : "Locked Periods"}</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-200/80">
              <Shield className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="font-mono font-black text-3xl text-slate-800 tracking-tight tabular-nums">
              {stats.lockedPeriodsCount}
            </div>
            <div className="mt-2 text-[11px] text-slate-500 font-medium">
              {isArabic ? "محمية من أي تعديل محاسبي بأثر رجعي" : "Locked against retroactive entries"}
            </div>
          </div>
        </div>
      </div>

      {/* Accounting Quick Action Hub */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
          {isArabic ? "المحاور المحاسبية الرئيسية" : "Core Ledger Hub"}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          <Link
            to="/accounting/coa"
            className="group block rounded-2xl border border-slate-200/80 bg-white p-5 shadow-subtle transition-all duration-200 hover:border-slate-300 hover:shadow-card-hover hover:-translate-y-0.5"
          >
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-200/70 transition-transform duration-200 group-hover:scale-105">
                <BookOpen className="h-5 w-5" />
              </div>
              <Arrow className="h-4 w-4 text-slate-400 group-hover:text-slate-900 group-hover:translate-x-[-3px] transition-all" />
            </div>
            <h3 className="mt-3.5 text-sm font-bold text-slate-900 group-hover:text-sky-600 transition-colors">
              {t("coa.title")}
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              {t("coa.subtitle")}
            </p>
          </Link>

          <Link
            to="/accounting/periods"
            className="group block rounded-2xl border border-slate-200/80 bg-white p-5 shadow-subtle transition-all duration-200 hover:border-slate-300 hover:shadow-card-hover hover:-translate-y-0.5"
          >
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-700 ring-1 ring-rose-200/70 transition-transform duration-200 group-hover:scale-105">
                <Calendar className="h-5 w-5" />
              </div>
              <Arrow className="h-4 w-4 text-slate-400 group-hover:text-slate-900 group-hover:translate-x-[-3px] transition-all" />
            </div>
            <h3 className="mt-3.5 text-sm font-bold text-slate-900 group-hover:text-sky-600 transition-colors">
              {t("periods.title")}
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              {t("periods.subtitle")}
            </p>
          </Link>

          <Link
            to="/accounting/journal-entries"
            className="group block rounded-2xl border border-slate-200/80 bg-white p-5 shadow-subtle transition-all duration-200 hover:border-slate-300 hover:shadow-card-hover hover:-translate-y-0.5"
          >
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-sky-200/70 transition-transform duration-200 group-hover:scale-105">
                <BookOpen className="h-5 w-5" />
              </div>
              <Arrow className="h-4 w-4 text-slate-400 group-hover:text-slate-900 group-hover:translate-x-[-3px] transition-all" />
            </div>
            <h3 className="mt-3.5 text-sm font-bold text-slate-900 group-hover:text-sky-600 transition-colors">
              قيود اليومية العامة
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              إنشاء ومراجعة القيود المزدوجة المتوازنة والقيود الآلية
            </p>
          </Link>

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
              القوائم المالية وإقرار ZATCA
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              ميزان المراجعة، الأرباح والخسائر، وقوائم المركز المالي
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
