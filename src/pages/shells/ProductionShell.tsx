import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import type { Tank, MixingBatch, Formula, PackagingSpec, FactorySettings } from "@/types/database";
import { ThermalBatchLabel } from "@/components/manufacturing/ThermalBatchLabel";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Factory,
  Droplets,
  ClipboardCheck,
  Package,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Printer,
  Plus,
  XCircle,
  FlaskConical,
  Scale,
} from "lucide-react";

export function ProductionShell() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isArabic = i18n.language === "ar";

  // Active Tab
  const [activeTab, setActiveTab] = useState("tanks");

  // QC Gate Modal
  const [qcModalOpen, setQcModalOpen] = useState(false);
  const [qcTargetBatch, setQcTargetBatch] = useState<MixingBatch | null>(null);
  const [qcPh, setQcPh] = useState<number>(7.0);
  const [qcViscosity, setQcViscosity] = useState<number>(3000);
  const [qcOdorOk, setQcOdorOk] = useState<boolean>(true);
  const [qcColorOk, setQcColorOk] = useState<boolean>(true);
  const [qcNotes, setQcNotes] = useState("");

  // Start Batch Modal
  const [startBatchModalOpen, setStartBatchModalOpen] = useState(false);
  const [selectedFormulaId, setSelectedFormulaId] = useState("");
  const [selectedTankId, setSelectedTankId] = useState("");
  const [plannedBatchKg, setPlannedBatchKg] = useState<number>(5000);

  // Close Tank Modal
  const [closeTankModalOpen, setCloseTankModalOpen] = useState(false);
  const [closeTargetBatch, setCloseTargetBatch] = useState<MixingBatch | null>(null);
  const [actualYieldKg, setActualYieldKg] = useState<number>(0);

  // Packaging Modal
  const [packagingModalOpen, setPackagingModalOpen] = useState(false);
  const [pkgBatchId, setPkgBatchId] = useState("");
  const [pkgSpecId, setPkgSpecId] = useState("");
  const [unitsProduced, setUnitsProduced] = useState<number>(100);
  const [wastedBottles, setWastedBottles] = useState<number>(0);
  const [wastedStickers, setWastedStickers] = useState<number>(0);
  const [wastedCartons, setWastedCartons] = useState<number>(0);

  // Thermal Label Modal
  const [labelModalOpen, setLabelModalOpen] = useState(false);
  const [activeLabelData, setActiveLabelData] = useState<any>(null);

  // 1. Fetch Tanks
  const { data: tanks, isLoading: isTanksLoading } = useQuery<Tank[]>({
    queryKey: ["mobile-tanks"],
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
            formula:formulas(id, code, name_ar, name_en, target_ph_min, target_ph_max, target_viscosity_min, target_viscosity_max, bulk_item_id)
          )
        `)
        .order("tank_code");
      if (error) throw error;
      return (data || []) as unknown as Tank[];
    },
  });

  // 2. Fetch Batches for QC Tab
  const { data: batchesNeedingQc } = useQuery<MixingBatch[]>({
    queryKey: ["mobile-batches-qc"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mixing_batches")
        .select(`
          *,
          formula:formulas(id, code, name_ar, name_en, target_ph_min, target_ph_max, target_viscosity_min, target_viscosity_max),
          tank:tanks(id, tank_code, name)
        `)
        .in("qc_status", ["pending", "needs_rework"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as MixingBatch[];
    },
  });

  // 3. Fetch Approved Batches for Bottling Tab
  const { data: approvedBatches } = useQuery<MixingBatch[]>({
    queryKey: ["mobile-batches-approved"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mixing_batches")
        .select(`
          *,
          formula:formulas(id, code, name_ar, name_en, bulk_item_id),
          tank:tanks(id, tank_code, name)
        `)
        .eq("qc_status", "passed")
        .gt("remaining_qty_grams", 0)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as MixingBatch[];
    },
  });

  // 4. Fetch Formulas
  const { data: formulas } = useQuery<Formula[]>({
    queryKey: ["mobile-formulas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("formulas")
        .select("*")
        .eq("is_active", true)
        .order("name_ar");
      if (error) throw error;
      return data || [];
    },
  });

  // 5. Fetch Packaging Specs for selected batch
  const selectedBatchForPkg = approvedBatches?.find((b) => b.id === pkgBatchId);
  const bulkId = selectedBatchForPkg?.formula?.bulk_item_id;

  const { data: specs } = useQuery<PackagingSpec[]>({
    queryKey: ["mobile-specs", bulkId],
    queryFn: async () => {
      if (!bulkId) return [];
      const { data, error } = await supabase
        .from("packaging_specs")
        .select(`
          *,
          finished_good:items!packaging_specs_finished_good_id_fkey(id, sku, name_ar, name_en, shelf_life_months)
        `)
        .eq("bulk_item_id", bulkId)
        .eq("is_active", true);
      if (error) throw error;
      return (data || []) as unknown as PackagingSpec[];
    },
    enabled: !!bulkId,
  });

  // 6. Fetch Settings
  const { data: settings } = useQuery<FactorySettings | null>({
    queryKey: ["mobile-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("factory_settings")
        .select("*")
        .eq("id", 1)
        .single();
      if (error) return null;
      return data as FactorySettings;
    },
  });

  // Mutations
  const startBatchMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFormulaId || !selectedTankId || plannedBatchKg <= 0 || !user?.id) {
        throw new Error(isArabic ? "يرجى تعبئة جميع الحقول" : "Please fill all fields");
      }
      const { data, error } = await supabase.rpc("rpc_start_mixing_batch", {
        p_formula_id: selectedFormulaId,
        p_tank_id: selectedTankId,
        p_planned_qty_grams: plannedBatchKg * 1000,
        p_created_by: user.id,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(isArabic ? `تم بدء تشغيلة الخلط ${data?.batch_number || ""}` : "Batch started");
      queryClient.invalidateQueries({ queryKey: ["mobile-tanks"] });
      queryClient.invalidateQueries({ queryKey: ["mobile-batches-qc"] });
      setStartBatchModalOpen(false);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    },
  });

  const recordQcMutation = useMutation({
    mutationFn: async ({ status }: { status: "passed" | "needs_rework" }) => {
      if (!qcTargetBatch || !user?.id) throw new Error("Context missing");
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
      return status;
    },
    onSuccess: (status) => {
      toast.success(
        status === "passed"
          ? isArabic ? "تم اعتماد الجودة! التانك مصرح للتعبئة" : "QC Passed"
          : isArabic ? "تم تسجيل عدم المطابقة وإحالة الخلطة للإصلاح" : "Marked for rework"
      );
      queryClient.invalidateQueries({ queryKey: ["mobile-tanks"] });
      queryClient.invalidateQueries({ queryKey: ["mobile-batches-qc"] });
      queryClient.invalidateQueries({ queryKey: ["mobile-batches-approved"] });
      setQcModalOpen(false);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    },
  });

  const executePackagingMutation = useMutation({
    mutationFn: async () => {
      if (!pkgBatchId || !pkgSpecId || unitsProduced <= 0 || !user?.id) {
        throw new Error(isArabic ? "يرجى تعبئة الحقول المطلوبة" : "Missing fields");
      }
      const { data, error } = await supabase.rpc("rpc_execute_packaging_order", {
        p_batch_id: pkgBatchId,
        p_spec_id: pkgSpecId,
        p_units_produced: unitsProduced,
        p_wasted_bottles: wastedBottles,
        p_wasted_stickers: wastedStickers,
        p_wasted_cartons: wastedCartons,
        p_created_by: user.id,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(isArabic ? `تم تنفيذ أمر التعبئة ${data?.order_number || ""}` : "Packaging complete");
      queryClient.invalidateQueries({ queryKey: ["mobile-tanks"] });
      queryClient.invalidateQueries({ queryKey: ["mobile-batches-approved"] });
      setPackagingModalOpen(false);

      // Offer printing label immediately
      const chosenSpec = specs?.find((s) => s.id === pkgSpecId);
      if (chosenSpec) {
        setActiveLabelData({
          productNameAr: chosenSpec.finished_good?.name_ar || "",
          productNameEn: chosenSpec.finished_good?.name_en || "",
          batchNumber: selectedBatchForPkg?.batch_number || data?.order_number,
          sku: chosenSpec.finished_good?.sku || "",
          shelfLife: chosenSpec.finished_good?.shelf_life_months || 24,
        });
        setLabelModalOpen(true);
      }
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    },
  });

  const closeTankMutation = useMutation({
    mutationFn: async () => {
      if (!closeTargetBatch || !user?.id) throw new Error("Context missing");
      const { data, error } = await supabase.rpc("rpc_close_tank_with_actual_yield", {
        p_batch_id: closeTargetBatch.id,
        p_actual_yield_grams: actualYieldKg * 1000,
        p_closed_by: user.id,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(isArabic ? "تم إغلاق وتفريغ التانك" : "Tank closed & empty");
      queryClient.invalidateQueries({ queryKey: ["mobile-tanks"] });
      queryClient.invalidateQueries({ queryKey: ["mobile-batches-approved"] });
      setCloseTankModalOpen(false);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    },
  });

  return (
    <div className="space-y-4 max-w-lg mx-auto pb-16">
      {/* Mobile Top Header Banner */}
      <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/20 text-sky-400">
            <Factory className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight">صالة الإنتاج والتشغيل</h1>
            <p className="text-[11px] text-slate-300">بوابة مشرف الإنتاج الميدانية</p>
          </div>
        </div>
        <Badge variant="emerald" className="text-[10px] py-0.5">
          مرحلة 3 نشطة
        </Badge>
      </div>

      {/* Touch-Friendly Segmented Navigation Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-12 bg-slate-100 p-1 rounded-xl">
          <TabsTrigger value="tanks" className="rounded-lg text-xs font-bold min-h-[40px] flex items-center gap-1.5">
            <Droplets className="h-4 w-4" />
            <span>التانكات</span>
          </TabsTrigger>
          <TabsTrigger value="qc" className="rounded-lg text-xs font-bold min-h-[40px] flex items-center gap-1.5">
            <ClipboardCheck className="h-4 w-4" />
            <span>الجودة</span>
            {batchesNeedingQc && batchesNeedingQc.length > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] text-white">
                {batchesNeedingQc.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="bottling" className="rounded-lg text-xs font-bold min-h-[40px] flex items-center gap-1.5">
            <Package className="h-4 w-4" />
            <span>التعبئة</span>
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: Live Tanks & Batches */}
        <TabsContent value="tanks" className="space-y-3 mt-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">متابعة التانكات اللحظية:</span>
            <Button
              size="sm"
              onClick={() => setStartBatchModalOpen(true)}
              className="bg-sky-600 hover:bg-sky-700 text-white text-xs h-9"
            >
              <Plus className="me-1 h-3.5 w-3.5" />
              بدء خلط
            </Button>
          </div>

          {isTanksLoading ? (
            <Skeleton className="h-48 w-full rounded-xl" />
          ) : (
            <div className="space-y-3">
              {tanks?.map((tank) => {
                const currentKg = Math.round((tank.current_qty_grams || 0) / 1000);
                const capacityKg = tank.capacity_liters;
                const fillPct = Math.min(100, Math.round((currentKg / capacityKg) * 100));
                const b = tank.current_batch as MixingBatch | undefined;

                return (
                  <Card key={tank.id} className="border-industrial-border bg-white shadow-sm overflow-hidden">
                    <div className="p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-800">
                            {tank.tank_code}
                          </span>
                          <span className="font-bold text-sm text-slate-900">
                            {isArabic ? (tank.name_ar || tank.tank_code) : (tank.name_en || tank.tank_code)}
                          </span>
                        </div>
                        {tank.status === "empty" ? (
                          <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-500 bg-emerald-50">
                            فارغ
                          </Badge>
                        ) : tank.status === "ready_for_packaging" ? (
                          <Badge variant="emerald" className="text-[10px]">
                            معتمد للتعبئة
                          </Badge>
                        ) : tank.status === "rework" ? (
                          <Badge variant="purple" className="text-[10px]">
                            إصلاح خلطة
                          </Badge>
                        ) : (
                          <Badge variant="amber" className="text-[10px]">
                            قيد الخلط
                          </Badge>
                        )}
                      </div>

                      {/* Fill Progress Bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] font-mono text-slate-500">
                          <span>المحتوى:</span>
                          <span className="font-bold tabular-nums text-slate-800">
                            {currentKg} / {capacityKg} كجم ({fillPct}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2.5">
                          <div
                            className={`h-2.5 rounded-full ${
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

                      {/* Current Batch Information */}
                      {b ? (
                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs space-y-1">
                          <div className="flex justify-between font-mono">
                            <span className="text-slate-500">الباتش:</span>
                            <span className="font-bold text-sky-700">{b.batch_number}</span>
                          </div>
                          <div className="font-semibold text-slate-900 truncate">
                            {b.formula?.name_ar}
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-slate-200 text-[11px]">
                            <span className="text-slate-500">حالة الجودة:</span>
                            <span className="font-bold text-slate-800">
                              {b.qc_status === "passed"
                                ? "معتمد ومطابق"
                                : b.qc_status === "needs_rework"
                                ? "يحتاج إصلاح"
                                : "بانتظار الفحص"}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-2 text-slate-400 text-xs border border-dashed rounded-lg">
                          التانك فارغ ونظيف وجاهز
                        </div>
                      )}

                      {/* Action Buttons for Batch */}
                      {b && (
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setQcTargetBatch(b);
                              setQcPh(b.qc_ph || 7.0);
                              setQcViscosity(b.qc_viscosity || 3000);
                              setQcModalOpen(true);
                            }}
                            className="text-xs min-h-[40px] border-sky-300 text-sky-700 hover:bg-sky-50"
                          >
                            <ClipboardCheck className="me-1 h-3.5 w-3.5" />
                            فحص الجودة
                          </Button>

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setCloseTargetBatch(b);
                              setActualYieldKg(Math.round((b.remaining_qty_grams || 0) / 1000));
                              setCloseTankModalOpen(true);
                            }}
                            className="text-xs min-h-[40px] text-slate-600 hover:bg-slate-100"
                          >
                            <XCircle className="me-1 h-3.5 w-3.5" />
                            إغلاق التانك
                          </Button>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* TAB 2: Quality Gate (QC Gate) Testing */}
        <TabsContent value="qc" className="space-y-3 mt-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">بوابة فحص الجودة الإلزامية:</span>
          </div>

          {batchesNeedingQc?.length === 0 ? (
            <Card className="text-center py-8 border-dashed">
              <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-500 mb-2" />
              <h3 className="font-bold text-sm text-slate-800">لا توجد تشغيلات بانتظار الفحص</h3>
              <p className="text-xs text-slate-500 mt-1">جميع الخلطات النشطة تم فحصها أو لا يوجد خلط نشط</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {batchesNeedingQc?.map((batch) => (
                <Card key={batch.id} className="border-industrial-border bg-white shadow-sm p-3.5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="font-mono text-xs font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded">
                        {batch.batch_number}
                      </span>
                      <h4 className="font-bold text-sm text-slate-900 mt-1.5">{batch.formula?.name_ar}</h4>
                      <p className="text-xs text-slate-500">تانك: {batch.tank?.tank_code}</p>
                    </div>
                    {batch.qc_status === "needs_rework" ? (
                      <Badge variant="purple" className="text-[10px]">
                        يحتاج إصلاح
                      </Badge>
                    ) : (
                      <Badge variant="amber" className="text-[10px]">
                        بانتظار الفحص
                      </Badge>
                    )}
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-500">نطاق pH المستهدف:</span>
                      <span className="font-mono font-bold">{batch.formula?.target_ph_min} - {batch.formula?.target_ph_max}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">اللزوجة المستهدفة (cP):</span>
                      <span className="font-mono font-bold">{batch.formula?.target_viscosity_min} - {batch.formula?.target_viscosity_max}</span>
                    </div>
                  </div>

                  <Button
                    onClick={() => {
                      setQcTargetBatch(batch);
                      setQcPh(batch.qc_ph || 7.0);
                      setQcViscosity(batch.qc_viscosity || 3000);
                      setQcModalOpen(true);
                    }}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white min-h-[44px] text-xs font-bold"
                  >
                    <ClipboardCheck className="me-1.5 h-4 w-4" />
                    تسجيل نتائج الفحص المخبري
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* TAB 3: Bottling, Packaging & Thermal Labels */}
        <TabsContent value="bottling" className="space-y-3 mt-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">أوامر التعبئة والملصقات:</span>
            <Button
              size="sm"
              onClick={() => {
                if (!approvedBatches || approvedBatches.length === 0) {
                  toast.error("لا توجد تشغيلات معتمدة الجودة للتعبئة!");
                  return;
                }
                setPackagingModalOpen(true);
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9"
            >
              <Plus className="me-1 h-3.5 w-3.5" />
              أمر تعبئة
            </Button>
          </div>

          <div className="space-y-3">
            <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-xs space-y-1 text-slate-700">
              <span className="font-bold text-sky-900 block">التشغيلات المصرح بتعبئتها (QC Passed):</span>
              <p className="text-[11px] leading-relaxed">
                يسمح بتعبئة أحجام مختلفة (جركل 5L، عبوة 1L) من نفس التانك مع حفظ المتبقي لليوم التالي.
              </p>
            </div>

            {approvedBatches?.length === 0 ? (
              <Card className="text-center py-8 border-dashed">
                <AlertTriangle className="h-10 w-10 mx-auto text-amber-500 mb-2" />
                <h3 className="font-bold text-sm text-slate-800">لا توجد خلطات معتمدة جاهزة للتعبئة</h3>
                <p className="text-xs text-slate-500 mt-1">يجب أولاً فحص واعتماد الجودة (Passed) لأي تانك نشط</p>
              </Card>
            ) : (
              approvedBatches?.map((b) => (
                <Card key={b.id} className="border-industrial-border bg-white shadow-sm p-3.5 space-y-2.5">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-mono text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                        {b.batch_number}
                      </span>
                      <h4 className="font-bold text-sm text-slate-900 mt-1">{b.formula?.name_ar}</h4>
                      <p className="text-xs text-slate-500">تانك: {b.tank?.tank_code}</p>
                    </div>
                    <Badge variant="emerald" className="text-[10px]">
                      متبقي {Math.round(b.remaining_qty_grams / 1000)} كجم
                    </Badge>
                  </div>

                  <Button
                    onClick={() => {
                      setPkgBatchId(b.id);
                      setPackagingModalOpen(true);
                    }}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white min-h-[44px] text-xs font-bold"
                  >
                    <Package className="me-1.5 h-4 w-4" />
                    بدء تعبئة من هذا التانك
                  </Button>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* MODAL 1: QC Gate Input */}
      <Dialog open={qcModalOpen} onOpenChange={setQcModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-sky-600" />
              <span>فحص الجودة المخبري</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              باتش: {qcTargetBatch?.batch_number}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 my-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs font-semibold">pH المقاس *</Label>
                <Input
                  type="number"
                  step="0.05"
                  value={qcPh}
                  onChange={(e) => setQcPh(Number(e.target.value))}
                  className="mt-1 font-mono text-center text-sm"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">اللزوجة المقاسة (cP) *</Label>
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
                <Checkbox id="m_odor" checked={qcOdorOk} onCheckedChange={(c: any) => setQcOdorOk(!!c)} />
                <Label htmlFor="m_odor" className="text-xs cursor-pointer">الرائحة مطابقة للمواصفة</Label>
              </div>
              <div className="flex items-center space-x-2 space-x-reverse">
                <Checkbox id="m_color" checked={qcColorOk} onCheckedChange={(c: any) => setQcColorOk(!!c)} />
                <Label htmlFor="m_color" className="text-xs cursor-pointer">اللون والمظهر شفاف ومطابق</Label>
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold">ملاحظات الفاحص</Label>
              <Input
                value={qcNotes}
                onChange={(e) => setQcNotes(e.target.value)}
                placeholder="ملاحظات العينة..."
                className="mt-1 text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              disabled={recordQcMutation.isPending}
              onClick={() => recordQcMutation.mutate({ status: "needs_rework" })}
              className="border-purple-300 text-purple-700 min-h-[44px] flex-1 text-xs"
            >
              <RotateCcw className="me-1 h-3.5 w-3.5" />
              إحالة للإصلاح (Rework)
            </Button>
            <Button
              disabled={recordQcMutation.isPending}
              onClick={() => recordQcMutation.mutate({ status: "passed" })}
              className="bg-emerald-600 hover:bg-emerald-700 text-white min-h-[44px] flex-1 text-xs"
            >
              <CheckCircle2 className="me-1 h-3.5 w-3.5" />
              اعتماد الجودة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: Start Batch */}
      <Dialog open={startBatchModalOpen} onOpenChange={setStartBatchModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Droplets className="h-5 w-5 text-sky-600" />
              <span>بدء تشغيلة خلط بالتانك</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 my-2 text-xs">
            <div>
              <Label className="text-xs font-semibold">التانك *</Label>
              <Select value={selectedTankId} onValueChange={setSelectedTankId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="اختر تانك فارغ..." />
                </SelectTrigger>
                <SelectContent>
                  {tanks?.map((t) => (
                    <SelectItem key={t.id} value={t.id} disabled={t.status !== "empty"}>
                      {t.tank_code} - {isArabic ? t.name_ar : t.name_en} {t.status !== "empty" ? "(ممتلئ)" : "(فارغ)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-semibold">التركيبة *</Label>
              <Select
                value={selectedFormulaId}
                onValueChange={(val) => {
                  setSelectedFormulaId(val);
                  const f = formulas?.find((x) => x.id === val);
                  if (f) setPlannedBatchKg(f.batch_size_grams / 1000);
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="اختر التركيبة..." />
                </SelectTrigger>
                <SelectContent>
                  {formulas?.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name_ar}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-semibold">الوزن المخطط (كجم) *</Label>
              <Input
                type="number"
                value={plannedBatchKg}
                onChange={(e) => setPlannedBatchKg(Number(e.target.value))}
                min={100}
                className="mt-1 font-mono text-center font-bold"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              disabled={startBatchMutation.isPending || !selectedTankId || !selectedFormulaId}
              onClick={() => startBatchMutation.mutate()}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white min-h-[48px]"
            >
              {startBatchMutation.isPending ? "جاري البدء..." : "تأكيد وبدء الخلط"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 3: Close Tank */}
      <Dialog open={closeTankModalOpen} onOpenChange={setCloseTankModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <XCircle className="h-5 w-5 text-slate-700" />
              <span>إغلاق التانك والناتج الفعلي</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 my-2 text-xs">
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <span className="text-slate-500">المتبقي دفترياً بالتانك:</span>
              <span className="font-mono font-bold block text-sm mt-0.5">
                {Math.round((closeTargetBatch?.remaining_qty_grams || 0) / 1000)} كجم
              </span>
            </div>

            <div>
              <Label className="text-xs font-semibold">الناتج الفعلي المستخرج (كجم) *</Label>
              <Input
                type="number"
                value={actualYieldKg}
                onChange={(e) => setActualYieldKg(Number(e.target.value))}
                className="mt-1 font-mono text-center font-bold text-sm"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                الفارق يُرحّل كفاقد غسيل تانك وهالك تشغيل
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button
              disabled={closeTankMutation.isPending}
              onClick={() => closeTankMutation.mutate()}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white min-h-[48px]"
            >
              {closeTankMutation.isPending ? "جاري الإغلاق..." : "تأكيد إغلاق وتفريغ التانك"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 4: Packaging from Tank */}
      <Dialog open={packagingModalOpen} onOpenChange={setPackagingModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Package className="h-5 w-5 text-sky-600" />
              <span>أمر تعبئة من التانك</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 my-2 text-xs">
            <div>
              <Label className="text-xs font-semibold">التشغيلة المعتمدة *</Label>
              <Select value={pkgBatchId} onValueChange={setPkgBatchId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="اختر الباتش..." />
                </SelectTrigger>
                <SelectContent>
                  {approvedBatches?.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.batch_number} ({Math.round(b.remaining_qty_grams / 1000)} كجم متبقي)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {pkgBatchId && (
              <div>
                <Label className="text-xs font-semibold">المواصفة والحجم *</Label>
                <Select value={pkgSpecId} onValueChange={setPkgSpecId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="اختر الحجم..." />
                  </SelectTrigger>
                  <SelectContent>
                    {specs?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name_ar} ({s.volume_per_unit_grams / 1000} لتر)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label className="text-xs font-semibold">عدد العبوات المطلوبة *</Label>
              <Input
                type="number"
                value={unitsProduced}
                onChange={(e) => setUnitsProduced(Number(e.target.value))}
                min={1}
                className="mt-1 font-mono text-center font-bold"
              />
            </div>

            <div className="pt-2 border-t border-slate-200 space-y-1.5">
              <span className="font-semibold text-slate-700 block">هالك مواد التعبئة:</span>
              <div className="grid grid-cols-3 gap-1.5">
                <div>
                  <Label className="text-[10px] text-slate-500">هالك عبوات</Label>
                  <Input
                    type="number"
                    value={wastedBottles}
                    onChange={(e) => setWastedBottles(Number(e.target.value))}
                    min={0}
                    className="mt-0.5 font-mono text-center text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-slate-500">هالك استيكر</Label>
                  <Input
                    type="number"
                    value={wastedStickers}
                    onChange={(e) => setWastedStickers(Number(e.target.value))}
                    min={0}
                    className="mt-0.5 font-mono text-center text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-slate-500">هالك كراتين</Label>
                  <Input
                    type="number"
                    value={wastedCartons}
                    onChange={(e) => setWastedCartons(Number(e.target.value))}
                    min={0}
                    className="mt-0.5 font-mono text-center text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              disabled={executePackagingMutation.isPending || !pkgBatchId || !pkgSpecId}
              onClick={() => executePackagingMutation.mutate()}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white min-h-[48px]"
            >
              {executePackagingMutation.isPending ? "جاري التنفيذ..." : "تنفيذ التعبئة وترحيل المخزون"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 5: Thermal Batch Label */}
      <Dialog open={labelModalOpen} onOpenChange={setLabelModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Printer className="h-5 w-5 text-sky-600" />
              <span>طباعة ملصق الباتش الحراري</span>
            </DialogTitle>
          </DialogHeader>

          {activeLabelData && (
            <div className="flex flex-col items-center py-4">
              {(() => {
                const prodDate = new Date().toISOString().split("T")[0];
                const pDateObj = new Date(prodDate);
                pDateObj.setMonth(pDateObj.getMonth() + (activeLabelData.shelfLife || 24));
                const expDate = pDateObj.toISOString().split("T")[0];

                return (
                  <ThermalBatchLabel
                    productNameAr={activeLabelData.productNameAr}
                    productNameEn={activeLabelData.productNameEn}
                    batchNumber={activeLabelData.batchNumber}
                    productionDate={prodDate}
                    expiryDate={expDate}
                    sku={activeLabelData.sku}
                    widthMm={settings?.label_width_mm || 50}
                    heightMm={settings?.label_height_mm || 30}
                  />
                );
              })()}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setLabelModalOpen(false)}>
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
