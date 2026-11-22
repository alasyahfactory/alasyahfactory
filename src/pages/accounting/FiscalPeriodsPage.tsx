import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import type { FiscalPeriod } from "@/types/database";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Calendar,
  ArrowRight, Plus, Lock, Unlock, ShieldAlert, CheckCircle2 } from "lucide-react";

const periodSchema = z
  .object({
    period_name: z.string().min(3, "اسم الفترة مطلوب (مثال: الربع الأول 2026)"),
    start_date: z.string().min(1, "تاريخ البدء مطلوب"),
    end_date: z.string().min(1, "تاريخ الانتهاء مطلوب"),
  })
  .refine((data) => new Date(data.end_date) >= new Date(data.start_date), {
    message: "تاريخ الانتهاء يجب أن يكون مساوياً أو بعد تاريخ البدء",
    path: ["end_date"],
  });

type PeriodFormData = z.infer<typeof periodSchema>;

export function FiscalPeriodsPage() {
  const { user, role } = useAuth();
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const isOwner = role === "owner";

  const [periods, setPeriods] = useState<FiscalPeriod[]>([]);
  const [loading, setLoading] = useState(true);

  // Create Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Lock / Unlock Confirmation
  const [togglePeriodTarget, setTogglePeriodTarget] = useState<FiscalPeriod | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PeriodFormData>({
    resolver: zodResolver(periodSchema),
    defaultValues: {
      period_name: "",
      start_date: "",
      end_date: "",
    },
  });

  const loadPeriods = async () => {
    try {
      const { data, error } = await supabase
        .from("fiscal_periods")
        .select("*, locked_by_user:users_profile!locked_by(*)")
        .order("start_date", { ascending: false });

      if (error) throw error;
      setPeriods((data as FiscalPeriod[]) || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load periods";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPeriods();
  }, []);

  const onCreatePeriod = async (data: PeriodFormData) => {
    try {
      const { error } = await supabase.from("fiscal_periods").insert({
        period_name: data.period_name,
        start_date: data.start_date,
        end_date: data.end_date,
        is_locked: false,
      });

      if (error) throw error;

      if (user?.id) {
        await supabase.from("audit_logs").insert({
          user_id: user.id,
          action: "PERIOD_CREATED",
          table_name: "fiscal_periods",
          record_id: data.period_name,
          details: `Created fiscal period: ${data.period_name} (${data.start_date} to ${data.end_date})`,
        });
      }

      toast.success(isArabic ? "تم إنشاء الفترة المالية بنجاح" : "Fiscal period created");
      setIsCreateOpen(false);
      reset();
      loadPeriods();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error creating period";
      toast.error(msg);
    }
  };

  const handleToggleLock = async () => {
    if (!togglePeriodTarget || !user?.id) return;
    setIsToggling(true);

    const willLock = !togglePeriodTarget.is_locked;

    try {
      const { error } = await supabase
        .from("fiscal_periods")
        .update({
          is_locked: willLock,
          locked_at: willLock ? new Date().toISOString() : null,
          locked_by: willLock ? user.id : null,
        })
        .eq("id", togglePeriodTarget.id);

      if (error) throw error;

      // Write to audit_logs
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        action: willLock ? "FISCAL_PERIOD_LOCKED" : "FISCAL_PERIOD_UNLOCKED",
        table_name: "fiscal_periods",
        record_id: togglePeriodTarget.id,
        details: `Owner ${willLock ? "locked" : "unlocked"} fiscal period "${togglePeriodTarget.period_name}"`,
      });

      toast.success(
        willLock
          ? (isArabic ? "تم إقفال الفترة المالية بنجاح" : "Fiscal period locked")
          : (isArabic ? "تم فتح الفترة المالية" : "Fiscal period unlocked")
      );

      setTogglePeriodTarget(null);
      loadPeriods();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to toggle period lock";
      toast.error(msg);
    } finally {
      setIsToggling(false);
    }
  };


  // Full-page in-place Canvas for Creating Fiscal Period
  if (isCreateOpen) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto pb-16 animate-in fade-in duration-200">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3">
            <Button
              variant="tonal"
              size="sm"
              onClick={() => setIsCreateOpen(false)}
              className="gap-1.5"
            >
              <ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
              <span>العودة للفترات المالية</span>
            </Button>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-sky-600" />
                <span>{t("periods.createPeriod")}</span>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCreateOpen(false)}
              disabled={isSubmitting}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={isSubmitting}
              onClick={handleSubmit(onCreatePeriod)}
              className="bg-slate-900 hover:bg-slate-800 text-white min-h-[40px] px-6"
            >
              {isSubmitting ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </div>

        <Card className="shadow-sm">
          <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
            <CardTitle className="text-base font-semibold">إعدادات الفترة المحاسبية</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit(onCreatePeriod)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="period_name">{t("periods.periodName")}</Label>
                <Input
                  id="period_name"
                  placeholder="الربع الأول 2026 (Q1 2026)"
                  className="h-10"
                  disabled={isSubmitting}
                  {...register("period_name")}
                />
                {errors.period_name && (
                  <p className="text-xs text-rose-600">{errors.period_name.message}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="start_date">{t("periods.startDate")}</Label>
                  <Input
                    id="start_date"
                    type="date"
                    dir="ltr"
                    className="h-10 font-mono"
                    disabled={isSubmitting}
                    {...register("start_date")}
                  />
                  {errors.start_date && (
                    <p className="text-xs text-rose-600">{errors.start_date.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="end_date">{t("periods.endDate")}</Label>
                  <Input
                    id="end_date"
                    type="date"
                    dir="ltr"
                    className="h-10 font-mono"
                    disabled={isSubmitting}
                    {...register("end_date")}
                  />
                  {errors.end_date && (
                    <p className="text-xs text-rose-600">{errors.end_date.message}</p>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateOpen(false)}
                  disabled={isSubmitting}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-slate-900 hover:bg-slate-800 text-white min-h-[40px] px-6"
                >
                  {isSubmitting ? t("common.saving") : t("common.save")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-industrial-primary sm:text-2xl flex items-center gap-2">
            <Calendar className="h-6 w-6 text-rose-600" />
            <span>{t("periods.title")}</span>
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            {t("periods.subtitle")}
          </p>
        </div>

        {isOwner && (
          <Button
            onClick={() => {
              reset();
              setIsCreateOpen(true);
            }}
            className="bg-industrial-primary text-white"
          >
            <Plus className="me-2 h-4 w-4" />
            <span>{t("periods.createPeriod")}</span>
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base font-semibold">
            {isArabic ? "سجل الفترات المالية وحالة القفل" : "Fiscal Periods & Locking Registry"}
          </CardTitle>
          <CardDescription className="text-xs">
            {t("periods.lockConfirmDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : periods.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">
              {isArabic ? "لا توجد فترات مالية مضافة بعد" : "No fiscal periods found"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-industrial-border bg-slate-50/70 text-slate-600 font-semibold">
                    <th className="p-3 text-start">{t("periods.periodName")}</th>
                    <th className="p-3 text-start">{t("periods.startDate")}</th>
                    <th className="p-3 text-start">{t("periods.endDate")}</th>
                    <th className="p-3 text-start">{t("common.status")}</th>
                    <th className="p-3 text-start">{t("periods.lockedBy")}</th>
                    <th className="p-3 text-end">{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-industrial-border">
                  {periods.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-semibold text-slate-900">
                        {p.period_name}
                      </td>
                      <td className="p-3 font-mono tabular-nums text-slate-600" dir="ltr">
                        {p.start_date}
                      </td>
                      <td className="p-3 font-mono tabular-nums text-slate-600" dir="ltr">
                        {p.end_date}
                      </td>
                      <td className="p-3">
                        {p.is_locked ? (
                          <Badge variant="rose" className="text-[11px] gap-1">
                            <Lock className="h-3 w-3" />
                            <span>{t("common.locked")}</span>
                          </Badge>
                        ) : (
                          <Badge variant="emerald" className="text-[11px] gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>{t("common.open")}</span>
                          </Badge>
                        )}
                      </td>
                      <td className="p-3 text-xs text-slate-500">
                        {p.is_locked && p.locked_by_user ? (
                          <div>
                            <span className="font-semibold text-slate-800">
                              {p.locked_by_user.full_name}
                            </span>
                            {p.locked_at && (
                              <p className="text-[10px] text-slate-400 font-mono">
                                {new Date(p.locked_at).toLocaleDateString(isArabic ? "ar-SA" : "en-US")}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="p-3 text-end">
                        {isOwner && (
                          <Button
                            variant={p.is_locked ? "outline" : "destructive"}
                            size="sm"
                            onClick={() => setTogglePeriodTarget(p)}
                            className="text-xs"
                          >
                            {p.is_locked ? (
                              <>
                                <Unlock className="me-1 h-3.5 w-3.5" />
                                <span>{t("periods.unlockPeriod")}</span>
                              </>
                            ) : (
                              <>
                                <Lock className="me-1 h-3.5 w-3.5" />
                                <span>{t("periods.lockPeriod")}</span>
                              </>
                            )}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* CREATE PERIOD DIALOG */}

      {/* LOCK / UNLOCK ALERT DIALOG */}
      <AlertDialog
        open={!!togglePeriodTarget}
        onOpenChange={(open) => !open && setTogglePeriodTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {togglePeriodTarget?.is_locked ? (
                <>
                  <Unlock className="h-5 w-5 text-emerald-600" />
                  <span>{t("periods.unlockPeriod")}</span>
                </>
              ) : (
                <>
                  <Lock className="h-5 w-5 text-rose-600" />
                  <span>{t("periods.lockPeriod")}</span>
                </>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                {isArabic
                  ? `أنت على وشك ${togglePeriodTarget?.is_locked ? "فتح" : "إقفال"} الفترة المالية: "${togglePeriodTarget?.period_name}".`
                  : `You are about to ${togglePeriodTarget?.is_locked ? "unlock" : "lock"} period "${togglePeriodTarget?.period_name}".`}
              </p>
              <p className="rounded bg-slate-100 p-2 text-xs text-slate-700">
                {t("periods.lockConfirmDesc")}
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isToggling}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleToggleLock}
              disabled={isToggling}
              className={
                togglePeriodTarget?.is_locked
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-rose-600 hover:bg-rose-700 text-white"
              }
            >
              {isToggling ? t("common.loading") : t("common.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
