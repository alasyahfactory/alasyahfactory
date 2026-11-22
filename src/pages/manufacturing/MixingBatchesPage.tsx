import { printDocumentHtml, saveDocumentPdfFromHtml, shareDocumentWhatsApp } from "@/utils/printAndPdf";
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import type { MixingBatch, Tank, Formula } from "@/types/database";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

import {
  Droplets,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ClipboardCheck,
  CheckSquare,
  XCircle,
  HelpCircle,
  Check,
  Printer,
  FileDown,
  Share2,
  FileText,
  Eye,
  ArrowRight,
} from "lucide-react";

export function MixingBatchesPage() {
  const { t, i18n } = useTranslation();
  const { user, isOwner } = useAuth();
  const queryClient = useQueryClient();
  const isArabic = i18n.language === "ar";

  const [searchTerm, setSearchTerm] = useState("");

  // Start Batch Modal State
  const [startBatchModalOpen, setStartBatchModalOpen] = useState(false);
  const [selectedFormulaId, setSelectedFormulaId] = useState("");
  const [selectedTankId, setSelectedTankId] = useState("");
  const [plannedBatchKg, setPlannedBatchKg] = useState<number>(5000);

  // QC Gate Modal State
  const [qcModalOpen, setQcModalOpen] = useState(false);
  const [qcTargetBatch, setQcTargetBatch] = useState<MixingBatch | null>(null);
  const [qcPh, setQcPh] = useState<number>(7.0);
  const [qcViscosity, setQcViscosity] = useState<number>(3000);
  const [qcOdorOk, setQcOdorOk] = useState<boolean>(true);
  const [qcColorOk, setQcColorOk] = useState<boolean>(true);
  const [qcNotes, setQcNotes] = useState("");

  // Close Tank Modal State
  const [closeTankModalOpen, setCloseTankModalOpen] = useState(false);
  const [closeTargetBatch, setCloseTargetBatch] = useState<MixingBatch | null>(null);
  const [actualYieldKg, setActualYieldKg] = useState<number>(0);
  const [selectedBatch, setSelectedBatch] = useState<MixingBatch | null>(null);

  // 1. Fetch Tanks with current batch
  const { data: tanks, isLoading: isTanksLoading } = useQuery<Tank[]>({
    queryKey: ["tanks-with-batches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tanks")
        .select(`
          *,
          current_batch:mixing_batches!tanks_current_batch_id_fkey(
            id,
            batch_number,
            planned_qty_grams,
            remaining_qty_grams,
            status,
            qc_status,
            formula:formulas(id, code, name_ar, name_en, target_ph_min, target_ph_max, target_viscosity_min, target_viscosity_max)
          )
        `)
        .order("tank_code");

      if (error) throw error;
      return (data || []) as unknown as Tank[];
    },
  });

  // 2. Fetch Mixing Batches list
  const { data: batches, isLoading: isBatchesLoading } = useQuery<MixingBatch[]>({
    queryKey: ["mixing-batches-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mixing_batches")
        .select(`
          *,
          formula:formulas(id, code, name_ar, name_en, target_ph_min, target_ph_max, target_viscosity_min, target_viscosity_max),
          tank:tanks(id, tank_code, name_ar, name_en, capacity_liters)
        `)
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) throw error;
      return (data || []) as unknown as MixingBatch[];
    },
  });

  // 3. Fetch Active Formulas for new batch
  const { data: formulas } = useQuery<Formula[]>({
    queryKey: ["formulas-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("formulas")
        .select("*")
        .eq("is_active", true)
        .order("name_ar");
      if (error) throw error;
      return data || [];
    },
    enabled: startBatchModalOpen,
  });

  // Start Mixing Batch Mutation (calls atomic rpc_start_mixing_batch)
  const startBatchMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFormulaId || !selectedTankId || plannedBatchKg <= 0) {
        throw new Error(isArabic ? "يرجى تعبئة جميع بيانات التشغيلة" : "Please fill all batch details");
      }
      if (!user?.id) throw new Error("User not authenticated");

      const plannedGrams = plannedBatchKg * 1000;

      const { data, error } = await supabase.rpc("rpc_start_mixing_batch", {
        p_formula_id: selectedFormulaId,
        p_tank_id: selectedTankId,
        p_planned_qty_grams: plannedGrams,
        p_created_by: user.id,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(
        isArabic
          ? `تم بدء تشغيلة الخلط ${data?.batch_number || ""} بنجاح وتم صرف الخامات وقيدها في حساب WIP 1133`
          : `Mixing batch started successfully. Chemicals consumed to WIP 1133.`
      );
      queryClient.invalidateQueries({ queryKey: ["tanks-with-batches"] });
      queryClient.invalidateQueries({ queryKey: ["mixing-batches-list"] });
      setStartBatchModalOpen(false);
      setSelectedFormulaId("");
      setSelectedTankId("");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    },
  });

  // QC Gate Test Mutation (calls atomic rpc_record_qc_test)
  const recordQcMutation = useMutation({
    mutationFn: async ({ status }: { status: "passed" | "needs_rework" }) => {
      if (!qcTargetBatch || !user?.id) throw new Error("Missing batch or user context");

      const { data, error } = await supabase.rpc("rpc_record_qc_test", {
        p_batch_id: qcTargetBatch.id,
        p_ph: qcPh,
        p_viscosity: qcViscosity,
        p_odor_ok: qcOdorOk,
        p_color_ok: qcColorOk,
        p_status: status,
        p_tested_by: user.id,
        p_notes: qcNotes || null,
      });

      if (error) throw error;
      return { data, status };
    },
    onSuccess: ({ status }) => {
      if (status === "passed") {
        toast.success(
          isArabic
            ? "تم اعتماد الجودة بنجاح! التانك الآن مفتوح ومصرح للتعبئة بأحجام مختلفة"
            : "QC Passed! Tank is approved and unlocked for bottling."
        );
      } else {
        toast.warning(
          isArabic
            ? "تم تسجيل عدم المطابقة وإحالة التانك للإصلاح (Rework)"
            : "Batch marked for rework. Packaging remains locked."
        );
      }
      queryClient.invalidateQueries({ queryKey: ["tanks-with-batches"] });
      queryClient.invalidateQueries({ queryKey: ["mixing-batches-list"] });
      setQcModalOpen(false);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    },
  });

  // Close Tank & Yield Variance Mutation (calls atomic rpc_close_tank_with_actual_yield)
  const closeTankMutation = useMutation({
    mutationFn: async () => {
      if (!closeTargetBatch || !user?.id) throw new Error("Missing context");

      const actualYieldGrams = actualYieldKg * 1000;

      const { data, error } = await supabase.rpc("rpc_close_tank_with_actual_yield", {
        p_batch_id: closeTargetBatch.id,
        p_actual_yield_grams: actualYieldGrams,
        p_closed_by: user.id,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(
        isArabic
          ? `تم إغلاق التانك بنجاح! فاقد التانك (${((data?.loss_grams || 0) / 1000).toFixed(1)} كجم) تم ترحيله لمصروف الهالك 6105 وأصبح التانك فارغاً`
          : `Tank closed successfully. Loss posted to 6105. Tank is now empty.`
      );
      queryClient.invalidateQueries({ queryKey: ["tanks-with-batches"] });
      queryClient.invalidateQueries({ queryKey: ["mixing-batches-list"] });
      setCloseTankModalOpen(false);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    },
  });

  // Helper to open QC modal
  const openQcDialog = (batch: MixingBatch) => {
    setQcTargetBatch(batch);
    setQcPh(batch.qc_ph || 7.0);
    setQcViscosity(batch.qc_viscosity || 3000);
    setQcOdorOk(batch.qc_odor_ok ?? true);
    setQcColorOk(batch.qc_color_ok ?? true);
    setQcNotes(batch.qc_notes || "");
    setQcModalOpen(true);
  };

  // Helper to open Close Tank modal
  const openCloseTankDialog = (batch: MixingBatch) => {
    setCloseTargetBatch(batch);
    const remainingKg = Math.round((batch.remaining_qty_grams || 0) / 1000);
    setActualYieldKg(remainingKg);
    setCloseTankModalOpen(true);
  };

  const getTankStatusBadge = (status: string) => {
    switch (status) {
      case "empty":
        return <Badge variant="outline" className="border-emerald-500 text-emerald-700 bg-emerald-50 text-[11px]">{t("facilities.tankStatus.empty")}</Badge>;
      case "mixing":
        return <Badge variant="amber" className="text-[11px]">{t("facilities.tankStatus.mixing")}</Badge>;
      case "pending_qc":
      case "qc_pending":
        return <Badge variant="outline" className="border-sky-500 text-sky-700 bg-sky-50 text-[11px]">{t("facilities.tankStatus.pending_qc")}</Badge>;
      case "ready_for_packaging":
        return <Badge variant="emerald" className="text-[11px]">{t("facilities.tankStatus.ready_for_packaging")}</Badge>;
      case "rework":
        return <Badge variant="purple" className="text-[11px]">{t("facilities.tankStatus.rework")}</Badge>;
      default:
        return <Badge variant="secondary" className="text-[11px]">{status}</Badge>;
    }
  };

  
  const getBatchSheetHtml = (batch: MixingBatch) => {
    const docTitle = `أمر خلط وتشغيل - ${batch.batch_number}`;
    const plannedKg = Math.round((batch.planned_qty_grams || 0) / 1000);
    const remainingKg = Math.round((batch.remaining_qty_grams || 0) / 1000);
    return `
      <!DOCTYPE html>
      <html dir="${isArabic ? "rtl" : "ltr"}" lang="${isArabic ? "ar" : "en"}">
        <head>
          <meta charset="utf-8" />
          <title>${docTitle}</title>
          <style>
            @page { size: A4 portrait; margin: 12mm; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "IBM Plex Sans Arabic", sans-serif; color: #0f172a; background: #fff; margin: 0; padding: 0; font-size: 12px; }
            .header-grid { display: grid; grid-template-columns: 1fr auto 1fr; gap: 16px; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; }
            .badge { display: inline-block; padding: 4px 14px; background: #0f172a; color: #fff; font-weight: bold; font-size: 15px; border-radius: 4px; }
            .meta-card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px; background: #f8fafc; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 12px; }
            .qc-card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px; margin-bottom: 20px; background: #fff; }
            .tabular { font-family: monospace; font-variant-numeric: tabular-nums; }
            .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 30px; margin-top: 40px; text-align: center; }
            .sig-box { border-top: 1px dashed #94a3b8; padding-top: 8px; font-size: 11px; }
          </style>
        </head>
        <body>
          <div class="header-grid">
            <div style="text-align: ${isArabic ? "right" : "left"};">
              <div style="font-weight: bold; font-size: 15px;">مصنع الأسياح للمنتجات الكيميائية</div>
              <div style="font-size: 11px; color: #64748b;">سجل تجاري: 1010000000 | الرقم الضريبي: 300000000000003</div>
              <div style="font-size: 11px; color: #64748b;">إدارة الإنتاج والخلط الكيميائي</div>
            </div>
            <div style="text-align: center;">
              <div class="badge">كرت تشغيل وتشغيل باتش خلط</div>
              <div style="font-size: 13px; font-family: monospace; font-weight: bold; margin-top: 4px;">${batch.batch_number}</div>
            </div>
            <div style="text-align: ${isArabic ? "left" : "right"}; direction: ltr;">
              <div style="font-weight: bold; font-size: 14px;">Al-Asyah Chemical Factory</div>
              <div style="font-size: 11px; color: #64748b;">Chemical Mixing Batch Traveler</div>
              <div style="font-size: 11px; color: #64748b;">Date: ${batch.created_at ? new Date(batch.created_at).toLocaleDateString("en-CA") : "-"}</div>
            </div>
          </div>

          <div class="meta-card">
            <div><strong>رقم الباتش:</strong> <span class="tabular font-bold">${batch.batch_number}</span></div>
            <div><strong>تانك التشغيل:</strong> ${batch.tank?.tank_code || "-"} (${batch.tank?.name || "-"})</div>
            <div><strong>التركيبة / المنتج:</strong> <strong>${batch.formula ? (isArabic ? batch.formula.name_ar : batch.formula.name_en) : "-"}</strong></div>
            <div><strong>كود المعادلة:</strong> <span class="tabular">${batch.formula?.code || "-"}</span></div>
            <div><strong>الكمية المخططة:</strong> <span class="tabular">${plannedKg.toLocaleString()}</span> كجم</div>
            <div><strong>الكمية المتبقية بالخلط:</strong> <span class="tabular">${remainingKg.toLocaleString()}</span> كجم</div>
            <div><strong>حالة الباتش:</strong> ${batch.status}</div>
            <div><strong>حالة الفحص المخبري (QC):</strong> ${batch.qc_status === "passed" ? "مطابق ومعتمد" : batch.qc_status === "needs_rework" ? "يحتاج تعديل وإصلاح" : "بانتظار الفحص"}</div>
          </div>

          <div class="qc-card">
            <h3 style="margin-top: 0; font-size: 13px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">نتائج الفحص وضبط الجودة (QC Gate Specifications)</h3>
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 10px; font-size: 12px;">
              <div><strong>الرقم الهيدروجيني (pH):</strong> <span class="tabular">${batch.qc_ph ?? "غير مسجل"}</span></div>
              <div><strong>اللزوجة (Viscosity cP):</strong> <span class="tabular">${batch.qc_viscosity ? batch.qc_viscosity.toLocaleString() + " cP" : "غير مسجل"}</span></div>
              <div><strong>مطابقة اللون:</strong> ${batch.qc_color_ok ? "مطابق ✓" : "غير مطابق ✗"}</div>
              <div><strong>مطابقة الرائحة:</strong> ${batch.qc_odor_ok ? "مطابق ✓" : "غير مطابق ✗"}</div>
            </div>
            ${batch.qc_notes ? `<div style="margin-top: 10px; font-size: 11px; color: #475569;"><strong>ملاحظات المختبر:</strong> ${batch.qc_notes}</div>` : ""}
          </div>

          <div class="signatures">
            <div class="sig-box">
              <div style="font-weight: bold; margin-bottom: 35px;">فني / مشغل الخلط</div>
              <div>التوقيع: ............................</div>
            </div>
            <div class="sig-box">
              <div style="font-weight: bold; margin-bottom: 35px;">كيميائي فحص الجودة (QC)</div>
              <div>التوقيع: ............................</div>
            </div>
            <div class="sig-box">
              <div style="font-weight: bold; margin-bottom: 35px;">مدير الإنتاج والمصنع</div>
              <div>الختم والتوقيع: ............................</div>
            </div>
          </div>

          
        </body>
      </html>
    `;
  };

  const handlePrintBatchSheet = (batch: MixingBatch) => {
    printDocumentHtml(getBatchSheetHtml(batch), `أمر_تشغيل_${batch.batch_number}`);
  };

  const handleSavePdfBatchSheet = (batch: MixingBatch) => {
    saveDocumentPdfFromHtml(getBatchSheetHtml(batch), `أمر_تشغيل_${batch.batch_number}`);
  };

  const handleShareWhatsapp = (batch: MixingBatch) => {
    const plannedKg = Math.round((batch.planned_qty_grams || 0) / 1000);
    const formulaName = batch.formula ? (isArabic ? batch.formula.name_ar : batch.formula.name_en) : "-";
    const msg = `*كرت تشغيل باتش خلط - مصنع الأسياح للكيماويات*
رقم الباتش: ${batch.batch_number}
المنتج / التركيبة: ${formulaName}
التانك: ${batch.tank?.tank_code || "-"}
الكمية المخططة: ${plannedKg.toLocaleString()} كجم
حالة الفحص المخبري (QC): ${batch.qc_status === "passed" ? "معتمد ومطابق" : batch.qc_status === "needs_rework" ? "يحتاج إصلاح" : "قيد الفحص"}
الحالة التشغيلية: ${batch.status}
_إدارة العمليات الصناعية والخلط - مصنع الأسياح_`;

    const encoded = encodeURIComponent(msg);
    const waUrl = `https://api.whatsapp.com/send?text=${encoded}`;
    window.open(waUrl, "_blank");
  };

  // Full-page in-place Canvas for Inspecting a Batch Traveler Sheet
  if (selectedBatch) {
    const plannedKg = Math.round((selectedBatch.planned_qty_grams || 0) / 1000);
    const remainingKg = Math.round((selectedBatch.remaining_qty_grams || 0) / 1000);
    const formulaName = selectedBatch.formula ? (isArabic ? selectedBatch.formula.name_ar : selectedBatch.formula.name_en) : "-";

    return (
      <div className="space-y-6 max-w-4xl mx-auto pb-16 animate-in fade-in duration-200">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3">
            <Button
              variant="tonal"
              size="sm"
              onClick={() => setSelectedBatch(null)}
              className="gap-1.5"
            >
              <ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
              <span>{isArabic ? "العودة للباتشات" : "Back"}</span>
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold font-mono text-slate-900">
                  {selectedBatch.batch_number}
                </h1>
                <Badge variant={selectedBatch.qc_status === "passed" ? "emerald" : "amber"}>
                  {selectedBatch.qc_status === "passed" ? "معتمد للتعبئة" : selectedBatch.qc_status}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {formulaName} | تانك: {selectedBatch.tank?.tank_code || "-"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSavePdfBatchSheet(selectedBatch)}
              className="gap-1.5 text-xs text-slate-700 hover:bg-slate-100 min-h-[38px]"
            >
              <Printer className="h-4 w-4 text-slate-600" />
              <span>{isArabic ? "طباعة A4" : "Print A4"}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePrintBatchSheet(selectedBatch)}
              className="gap-1.5 text-xs text-sky-700 hover:bg-sky-50 min-h-[38px]"
            >
              <FileDown className="h-4 w-4 text-sky-600" />
              <span>{isArabic ? "حفظ PDF" : "Save PDF"}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleShareWhatsapp(selectedBatch)}
              className="gap-1.5 text-xs text-emerald-700 hover:bg-emerald-50 min-h-[38px]"
            >
              <Share2 className="h-4 w-4 text-emerald-600" />
              <span>{isArabic ? "مشاركة واتساب" : "WhatsApp"}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedBatch(null)}
            >
              {isArabic ? "إغلاق" : "Close"}
            </Button>
          </div>
        </div>

        {/* Batch Information Details */}
        <Card className="border border-slate-200">
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center justify-between">
              <span>تفاصيل تشغيل الباتش ومواصفات الجودة</span>
              <span className="font-mono text-sm text-slate-500">{selectedBatch.batch_number}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100 text-sm">
              <div>
                <span className="text-xs text-slate-500 block">المنتج / التركيبة</span>
                <span className="font-bold text-slate-800">{formulaName}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">التانك المستخدم</span>
                <span className="font-bold font-mono text-slate-800">{selectedBatch.tank?.tank_code || "-"} ({selectedBatch.tank?.name || "-"})</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">الكمية المخططة</span>
                <span className="font-bold font-mono text-slate-800">{plannedKg.toLocaleString()} كجم</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">المتبقي بالخلط</span>
                <span className="font-bold font-mono text-slate-800">{remainingKg.toLocaleString()} كجم</span>
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl p-4 space-y-3">
              <h3 className="font-bold text-sm text-slate-800">بيانات الفحص المخبري (QC Gate)</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-xs text-slate-500 block">درجة الحموضة (pH)</span>
                  <span className="font-bold font-mono">{selectedBatch.qc_ph ?? "لم يُفحص"}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">اللزوجة (cP)</span>
                  <span className="font-bold font-mono">{selectedBatch.qc_viscosity ? `${selectedBatch.qc_viscosity.toLocaleString()} cP` : "لم يُفحص"}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">مطابقة الرائحة</span>
                  <span className="font-bold">{selectedBatch.qc_odor_ok ? "مطابق ✓" : "غير مطابق ✗"}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">مطابقة اللون</span>
                  <span className="font-bold">{selectedBatch.qc_color_ok ? "مطابق ✓" : "غير مطابق ✗"}</span>
                </div>
              </div>
              {selectedBatch.qc_notes && (
                <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100 mt-2">
                  <span className="font-bold block mb-1">ملاحظات الفاحص:</span>
                  {selectedBatch.qc_notes}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Droplets className="h-6 w-6 text-sky-600" />
            <span>{t("manufacturing.tanksOverview")}</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            {t("manufacturing.tanksSubtitle")}
          </p>
        </div>

        <Button
          onClick={() => setStartBatchModalOpen(true)}
          className="bg-slate-900 hover:bg-slate-800 text-white min-h-[44px]"
        >
          <Plus className="me-2 h-4 w-4" />
          <span>{t("manufacturing.startBatch")}</span>
        </Button>
      </div>

      {/* Visual Tanks Dashboard */}
      <div>
        <h2 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
          <span>تانكات الخلط والتشغيل الحية</span>
          <span className="text-xs font-normal text-slate-500">
            ({tanks?.length || 0} تانك)
          </span>
        </h2>

        {isTanksLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-64 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {tanks?.map((tank) => {
              const capacityKg = tank.capacity_liters; // 1L = 1Kg default
              const currentKg = Math.round((tank.current_qty_grams || 0) / 1000);
              const fillPct = Math.min(100, Math.round((currentKg / capacityKg) * 100));
              const currentBatch = tank.current_batch as MixingBatch | undefined;

              return (
                <Card
                  key={tank.id}
                  className="border-industrial-border bg-white shadow-sm flex flex-col justify-between overflow-hidden"
                >
                  <CardHeader className="p-3.5 pb-2 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                        {tank.tank_code}
                      </span>
                      {getTankStatusBadge(tank.status)}
                    </div>
                    <CardTitle className="text-sm font-bold text-slate-900 mt-1">
                      {isArabic ? (tank.name_ar || tank.tank_code) : (tank.name_en || tank.tank_code)}
                    </CardTitle>
                    <CardDescription className="text-[11px]">
                      السعة: <span className="font-mono font-bold">{tank.capacity_liters.toLocaleString()}</span> لتر
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="p-3.5 space-y-3">
                    {/* Visual Level Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] font-mono text-slate-600">
                        <span>المحتوى الحالي:</span>
                        <span className="font-bold tabular-nums text-slate-900">
                          {currentKg.toLocaleString()} / {capacityKg.toLocaleString()} كجم ({fillPct}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                        <div
                          className={`h-2.5 rounded-full transition-all duration-500 ${
                            tank.status === "empty"
                              ? "bg-slate-200"
                              : tank.status === "ready_for_packaging"
                              ? "bg-emerald-500"
                              : tank.status === "rework"
                              ? "bg-purple-500"
                              : "bg-sky-500"
                          }`}
                          style={{ width: `${tank.status === "empty" ? 0 : Math.max(5, fillPct)}%` }}
                        />
                      </div>
                    </div>

                    {/* Current Batch Info */}
                    {currentBatch ? (
                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-slate-400 font-medium">البـاتـش:</span>
                          <span className="font-mono font-bold text-sky-700 text-[11px]">
                            {currentBatch.batch_number}
                          </span>
                        </div>
                        <div className="text-[11px] font-semibold text-slate-800 truncate">
                          {currentBatch.formula ? (isArabic ? currentBatch.formula.name_ar : currentBatch.formula.name_en) : "-"}
                        </div>
                        <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[11px]">
                          <span className="text-slate-500">فحص الجودة:</span>
                          {currentBatch.qc_status === "passed" ? (
                            <span className="text-emerald-700 font-bold inline-flex items-center gap-1 text-[11px]">
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                              معتمد للتعبئة
                            </span>
                          ) : currentBatch.qc_status === "needs_rework" ? (
                            <span className="text-purple-700 font-bold inline-flex items-center gap-1 text-[11px]">
                              <AlertTriangle className="h-3 w-3 text-purple-600" />
                              إصلاح خلطة
                            </span>
                          ) : (
                            <span className="text-amber-700 font-bold inline-flex items-center gap-1 text-[11px]">
                              <HelpCircle className="h-3 w-3 text-amber-600" />
                              بانتظار الفحص
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-slate-50/70 p-3 rounded-lg border border-dashed text-center text-slate-400 text-xs">
                        التانك فارغ ونظيف وجاهز للتشغيل
                      </div>
                    )}

                    {/* Contextual Action Buttons */}
                    <div className="pt-1 flex flex-col gap-1.5">
                      {currentBatch && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openQcDialog(currentBatch)}
                            className="w-full text-xs min-h-[38px] border-sky-300 text-sky-700 hover:bg-sky-50"
                          >
                            <ClipboardCheck className="me-1.5 h-4 w-4 text-sky-600" />
                            <span>بوابة فحص الجودة (QC Gate)</span>
                          </Button>

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openCloseTankDialog(currentBatch)}
                            className="w-full text-xs min-h-[38px] text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                          >
                            <XCircle className="me-1.5 h-4 w-4 text-slate-500" />
                            <span>إغلاق التانك والناتج الفعلي</span>
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Batches Table List */}
      <Card className="border-industrial-border bg-white shadow-sm mt-8">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold text-slate-900">
              سجل تشغيلات الخلط (Mixing Batches History)
            </CardTitle>
            <CardDescription className="text-xs">
              متابعة جميع أوامر الخلط، أوزان التشغيل، وقرارات فحص الجودة
            </CardDescription>
          </div>
          <div className="relative w-64">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="بحث برقم الباتش..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="ps-8 h-8 text-xs bg-slate-50"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div
            className="table-accessible-wrapper heavy-section-deferred"
            tabIndex={0}
            role="region"
            aria-label={isArabic ? "سجل تشغيلات الخلط الكيميائي" : "Chemical Mixing Batches Register"}
          >
            <table className="w-full text-xs text-start">
              <caption className="sr-only">
                {isArabic ? "قائمة أوامر وتشغيلات الخلط الكيميائي" : "Chemical Mixing Batches List"}
              </caption>
              <thead className="bg-slate-100 text-slate-700 border-y border-slate-200 font-semibold sticky top-0 z-10">
                <tr>
                  <th scope="col" className="py-2.5 px-3">{t("manufacturing.batchNumber")}</th>
                  <th scope="col" className="py-2.5 px-3">التركيبة الكيميائية</th>
                  <th scope="col" className="py-2.5 px-3">التانك</th>
                  <th scope="col" className="py-2.5 px-3 text-end">{t("manufacturing.plannedQty")}</th>
                  <th scope="col" className="py-2.5 px-3 text-end">{t("manufacturing.bulkRemainingInTank")}</th>
                  <th scope="col" className="py-2.5 px-3 text-center">{t("manufacturing.qcStatus")}</th>
                  <th scope="col" className="py-2.5 px-3 text-center">{t("common.status")}</th>
                  <th scope="col" className="py-2.5 px-3 text-center">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isBatchesLoading ? (
                  [1, 2, 3].map((i) => (
                    <tr key={i}>
                      <td colSpan={8} className="py-4 px-3">
                        <Skeleton className="h-6 w-full" />
                      </td>
                    </tr>
                  ))
                ) : batches?.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      لا توجد تشغيلات خلط سابقة
                    </td>
                  </tr>
                ) : (
                  batches
                    ?.filter((b) => b.batch_number.toLowerCase().includes(searchTerm.toLowerCase()))
                    .map((batch) => {
                      const plannedKg = Math.round(batch.planned_qty_grams / 1000);
                      const remainingKg = Math.round((batch.remaining_qty_grams || 0) / 1000);

                      return (
                        <tr key={batch.id} className="hover:bg-slate-50/80">
                          <td className="py-2.5 px-3 font-mono font-bold">
                            <button
                              type="button"
                              onClick={() => setSelectedBatch(batch)}
                              className="text-sky-700 hover:text-sky-900 hover:underline flex items-center gap-1 cursor-pointer"
                              title={isArabic ? "معاينة كرت تشغيل الباتش" : "View Traveler"}
                            >
                              <FileText className="h-3.5 w-3.5" />
                              <span>{batch.batch_number}</span>
                            </button>
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-900">
                            {batch.formula ? (isArabic ? batch.formula.name_ar : batch.formula.name_en) : "-"}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-700">
                            {batch.tank?.tank_code || "-"}
                          </td>
                          <td className="py-2.5 px-3 text-end font-mono tabular-nums">
                            {plannedKg.toLocaleString()} كجم
                          </td>
                          <td className="py-2.5 px-3 text-end font-mono tabular-nums font-bold text-slate-800">
                            {remainingKg.toLocaleString()} كجم
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {batch.qc_status === "passed" ? (
                              <Badge variant="emerald" className="text-[10px] py-0">
                                معتمد للتعبئة
                              </Badge>
                            ) : batch.qc_status === "needs_rework" ? (
                              <Badge variant="purple" className="text-[10px] py-0">
                                يحتاج إصلاح
                              </Badge>
                            ) : (
                              <Badge variant="amber" className="text-[10px] py-0">
                                بانتظار الفحص
                              </Badge>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="font-mono text-[11px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                              {batch.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {batch.status !== "closed" && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => openQcDialog(batch)}
                                    className="h-7 text-xs text-sky-700 hover:bg-sky-50 px-2"
                                  >
                                    فحص الجودة
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => openCloseTankDialog(batch)}
                                    className="h-7 text-xs text-slate-600 hover:bg-slate-100 px-2"
                                  >
                                    إغلاق
                                  </Button>
                                </>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedBatch(batch)}
                                className="h-7 w-7 p-0 text-slate-500 hover:text-slate-900"
                                title={isArabic ? "معاينة كرت الباتش" : "View Batch"}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleSavePdfBatchSheet(batch)}
                                className="h-7 w-7 p-0 text-slate-600 hover:bg-slate-100"
                                title={isArabic ? "طباعة كرت التشغيل A4" : "Print A4"}
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handlePrintBatchSheet(batch)}
                                className="h-7 w-7 p-0 text-sky-700 hover:bg-sky-50"
                                title={isArabic ? "حفظ PDF" : "Save PDF"}
                              >
                                <FileDown className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleShareWhatsapp(batch)}
                                className="h-7 w-7 p-0 text-emerald-600 hover:bg-emerald-50"
                                title={isArabic ? "مشاركة واتساب" : "WhatsApp"}
                              >
                                <Share2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
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

      {/* 1. Start Mixing Batch Dialog */}
      <Dialog open={startBatchModalOpen} onOpenChange={setStartBatchModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Droplets className="h-5 w-5 text-sky-600" />
              <span>{t("manufacturing.startBatch")}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              اختر تانك فارغ والتركيبة المطلوبة لبدء صرف المواد الخام واحتساب التكاليف في WIP
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-2 text-xs">
            <div>
              <Label className="text-xs font-semibold">{t("manufacturing.selectTank")} *</Label>
              <Select value={selectedTankId} onValueChange={setSelectedTankId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="اختر تانك متاح..." />
                </SelectTrigger>
                <SelectContent>
                  {tanks?.map((tank) => (
                    <SelectItem
                      key={tank.id}
                      value={tank.id}
                      disabled={tank.status !== "empty"}
                    >
                      {tank.tank_code} - {isArabic ? tank.name_ar : tank.name_en} ({tank.capacity_liters} لتر)
                      {tank.status !== "empty" ? " [غير فارغ]" : " [فارغ ومتاح]"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-[10px] text-slate-500 mt-1 block">
                {t("manufacturing.tankMustBeEmpty")}
              </span>
            </div>

            <div>
              <Label className="text-xs font-semibold">{t("manufacturing.selectFormula")} *</Label>
              <Select
                value={selectedFormulaId}
                onValueChange={(val) => {
                  setSelectedFormulaId(val);
                  const f = formulas?.find((x) => x.id === val);
                  if (f) setPlannedBatchKg(f.batch_size_grams / 1000);
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="اختر تركيبة الخلط..." />
                </SelectTrigger>
                <SelectContent>
                  {formulas?.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {isArabic ? f.name_ar : f.name_en} ({f.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-semibold">{t("manufacturing.plannedQty")} (كجم) *</Label>
              <Input
                type="number"
                value={plannedBatchKg}
                onChange={(e) => setPlannedBatchKg(Number(e.target.value))}
                min={100}
                className="mt-1 font-mono tabular-nums"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setStartBatchModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={startBatchMutation.isPending}
              onClick={() => startBatchMutation.mutate()}
              className="bg-slate-900 hover:bg-slate-800 text-white min-h-[44px]"
            >
              {startBatchMutation.isPending ? t("common.saving") : "بدء الخلط وصرف الخامات"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2. Quality Gate (QC Gate) Modal */}
      <Dialog open={qcModalOpen} onOpenChange={setQcModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-sky-600" />
              <span>{t("manufacturing.qcGateTitle")}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {t("manufacturing.qcGateSubtitle")} • باتش: {qcTargetBatch?.batch_number}
            </DialogDescription>
          </DialogHeader>

          {qcTargetBatch && (
            <div className="space-y-4 my-2 text-xs">
              {/* Formula Target Benchmark */}
              {qcTargetBatch.formula && (
                <div className="bg-sky-50/70 p-3 rounded-lg border border-sky-100 space-y-1">
                  <span className="font-semibold text-sky-900 block text-xs">
                    المعايير المرجعية للتركيبة ({qcTargetBatch.formula.code}):
                  </span>
                  <div className="flex items-center justify-between text-slate-700">
                    <span>نطاق pH المستهدف:</span>
                    <span className="font-mono font-bold">
                      {qcTargetBatch.formula.target_ph_min} - {qcTargetBatch.formula.target_ph_max}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-700">
                    <span>اللزوجة المستهدفة (cP):</span>
                    <span className="font-mono font-bold">
                      {qcTargetBatch.formula.target_viscosity_min} - {qcTargetBatch.formula.target_viscosity_max}
                    </span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold">{t("manufacturing.testedPh")} *</Label>
                  <Input
                    type="number"
                    step="0.05"
                    value={qcPh}
                    onChange={(e) => setQcPh(Number(e.target.value))}
                    className="mt-1 font-mono text-center text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">{t("manufacturing.testedViscosity")} *</Label>
                  <Input
                    type="number"
                    step="50"
                    value={qcViscosity}
                    onChange={(e) => setQcViscosity(Number(e.target.value))}
                    className="mt-1 font-mono text-center text-sm"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-200">
                <div className="flex items-center space-x-2 space-x-reverse">
                  <Checkbox
                    id="odor_check"
                    checked={qcOdorOk}
                    onCheckedChange={(c: any) => setQcOdorOk(!!c)}
                  />
                  <Label htmlFor="odor_check" className="text-xs cursor-pointer">
                    {t("manufacturing.odorOk")}
                  </Label>
                </div>

                <div className="flex items-center space-x-2 space-x-reverse">
                  <Checkbox
                    id="color_check"
                    checked={qcColorOk}
                    onCheckedChange={(c: any) => setQcColorOk(!!c)}
                  />
                  <Label htmlFor="color_check" className="text-xs cursor-pointer">
                    {t("manufacturing.colorOk")}
                  </Label>
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold">{t("common.notes")}</Label>
                <Input
                  value={qcNotes}
                  onChange={(e) => setQcNotes(e.target.value)}
                  placeholder="ملاحظات فحص الجودة المخبري..."
                  className="mt-1"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              disabled={recordQcMutation.isPending}
              onClick={() => recordQcMutation.mutate({ status: "needs_rework" })}
              className="border-purple-300 text-purple-700 hover:bg-purple-50 min-h-[44px]"
            >
              <RotateCcw className="me-1.5 h-4 w-4" />
              <span>{t("manufacturing.qcNeedsRework")}</span>
            </Button>

            <Button
              disabled={recordQcMutation.isPending}
              onClick={() => recordQcMutation.mutate({ status: "passed" })}
              className="bg-emerald-600 hover:bg-emerald-700 text-white min-h-[44px]"
            >
              <CheckCircle2 className="me-1.5 h-4 w-4" />
              <span>{t("manufacturing.qcPassed")}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 3. Close Tank & Yield Variance Modal */}
      <Dialog open={closeTankModalOpen} onOpenChange={setCloseTankModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <XCircle className="h-5 w-5 text-slate-700" />
              <span>{t("manufacturing.closeTank")}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {t("manufacturing.closeTankSubtitle")}
            </DialogDescription>
          </DialogHeader>

          {closeTargetBatch && (
            <div className="space-y-4 my-2 text-xs">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">رقم الباتش:</span>
                  <span className="font-mono font-bold">{closeTargetBatch.batch_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">الكمية المتبقية بالتانك:</span>
                  <span className="font-mono font-bold">
                    {Math.round((closeTargetBatch.remaining_qty_grams || 0) / 1000)} كجم
                  </span>
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold">{t("manufacturing.actualYield")} (كجم) *</Label>
                <Input
                  type="number"
                  value={actualYieldKg}
                  onChange={(e) => setActualYieldKg(Number(e.target.value))}
                  className="mt-1 font-mono text-center font-bold text-sm"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  الفرق بين المتبقي والناتج الفعلي سيُحتسب كفاقد غسيل تانك وهالك تشغيل
                </span>
              </div>

              <div className="p-2.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[11px] leading-relaxed">
                {t("manufacturing.yieldLossPosted")}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseTankModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={closeTankMutation.isPending}
              onClick={() => closeTankMutation.mutate()}
              className="bg-slate-900 hover:bg-slate-800 text-white min-h-[44px]"
            >
              {closeTankMutation.isPending ? t("common.saving") : "تأكيد إغلاق وتفريغ التانك"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
