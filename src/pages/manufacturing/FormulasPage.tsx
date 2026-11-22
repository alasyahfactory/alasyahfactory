import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import type { Formula, FormulaLine, Item } from "@/types/database";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  FlaskConical,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Layers,
  ChevronRight,
  ShoppingCart,
  Trash2,
  Droplet,
  ArrowRight,
} from "lucide-react";

interface PreCheckItem {
  item_id: string;
  sku: string;
  name_ar: string;
  name_en: string;
  base_unit: string;
  required_qty: number;
  available_stock: number;
  missing_qty: number;
  is_sufficient: boolean;
}

interface PreCheckResponse {
  success: boolean;
  formula_id: string;
  planned_batch_size: number;
  can_produce: boolean;
  items: PreCheckItem[];
}

export function FormulasPage() {
  const { t, i18n } = useTranslation();
  const { isOwner, profile, user } = useAuth();
  const queryClient = useQueryClient();
  const isArabic = i18n.language === "ar";

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFormula, setSelectedFormula] = useState<Formula | null>(null);

  // Pre-check modal state
  const [preCheckModalOpen, setPreCheckModalOpen] = useState(false);
  const [preCheckFormula, setPreCheckFormula] = useState<Formula | null>(null);
  const [plannedBatchKg, setPlannedBatchKg] = useState<number>(5000);
  const [preCheckResult, setPreCheckResult] = useState<PreCheckResponse | null>(null);
  const [isCheckingPreProd, setIsCheckingPreProd] = useState(false);
  const [isCreatingPO, setIsCreatingPO] = useState(false);

  // New formula modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [formulaCode, setFormulaCode] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [bulkItemId, setBulkItemId] = useState("");
  const [batchSizeKg, setBatchSizeKg] = useState<number>(5000);
  const [targetPhMin, setTargetPhMin] = useState<number>(6.5);
  const [targetPhMax, setTargetPhMax] = useState<number>(7.5);
  const [targetViscosityMin, setTargetViscosityMin] = useState<number>(2500);
  const [targetViscosityMax, setTargetViscosityMax] = useState<number>(3500);
  const [instructions, setInstructions] = useState("");

  const [formulaLines, setFormulaLines] = useState<
    Array<{ item_id: string; qty_kg: number; step: number; instructions: string }>
  >([]);

  // Permissions: can view secret chemical formulas
  const canViewFormulaDetails = isOwner || profile?.can_view_formulas === true;

  // 1. Fetch Formulas with Lines
  const { data: formulas, isLoading } = useQuery<Formula[]>({
    queryKey: ["formulas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("formulas")
        .select(`
          *,
          bulk_item:items!formulas_bulk_item_id_fkey(id, sku, name_ar, name_en),
          formula_lines(
            id,
            formula_id,
            item_id,
            qty_grams,
            percentage,
            addition_step,
            instructions,
            item:items(id, sku, name_ar, name_en, base_unit, current_stock)
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as Formula[];
    },
  });

  // 2. Fetch Bulk & Raw Items for Create Dialog
  const { data: rawItems } = useQuery<Item[]>({
    queryKey: ["items-raw-materials"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .eq("item_type", "raw_material")
        .eq("is_active", true)
        .order("name_ar");
      if (error) throw error;
      return data || [];
    },
    enabled: createModalOpen,
  });

  const { data: bulkItems } = useQuery<Item[]>({
    queryKey: ["items-bulk-tanks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .eq("item_type", "bulk_in_tank")
        .eq("is_active", true)
        .order("name_ar");
      if (error) throw error;
      return data || [];
    },
    enabled: createModalOpen,
  });

  // Execute Pre-Production Check via RPC
  const handleRunPreCheck = async (formula: Formula, batchKg: number) => {
    setIsCheckingPreProd(true);
    setPreCheckResult(null);
    try {
      const batchGrams = batchKg * 1000;
      const { data, error } = await supabase.rpc("rpc_pre_production_check", {
        p_formula_id: formula.id,
        p_batch_size_grams: batchGrams,
      });

      if (error) throw error;
      setPreCheckResult(data as unknown as PreCheckResponse);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(isArabic ? `فشل فحص التوفر: ${msg}` : `Feasibility check failed: ${msg}`);
    } finally {
      setIsCheckingPreProd(false);
    }
  };

  const openPreCheckDialog = (formula: Formula) => {
    setPreCheckFormula(formula);
    const defaultKg = formula.batch_size_grams ? formula.batch_size_grams / 1000 : 5000;
    setPlannedBatchKg(defaultKg);
    setPreCheckModalOpen(true);
    handleRunPreCheck(formula, defaultKg);
  };

  // Convert Shortages to Draft PO
  const handleCreateDraftPO = async () => {
    if (!preCheckResult || !user?.id) return;
    const missingItems = preCheckResult.items.filter((it) => !it.is_sufficient && it.missing_qty > 0);
    if (missingItems.length === 0) return;

    setIsCreatingPO(true);
    try {
      // Find a default supplier
      const { data: suppliers } = await supabase
        .from("suppliers")
        .select("id")
        .eq("is_active", true)
        .limit(1);

      const supplierId = suppliers?.[0]?.id;
      if (!supplierId) {
        throw new Error(
          isArabic
            ? "لا يوجد مورد معتمد في النظام لربط أمر الشراء"
            : "No active supplier found to attach purchase order"
        );
      }

      // Generate PO number
      const poNumber = `PO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

      // Insert Purchase Order
      const { data: po, error: poErr } = await supabase
        .from("purchase_orders")
        .insert({
          po_number: poNumber,
          supplier_id: supplierId,
          order_date: new Date().toISOString().split("T")[0],
          status: "draft",
          notes: `أمر شراء تلقائي لتغطية نواقص خلطة ${preCheckFormula?.name_ar || ""} (باتش ${plannedBatchKg} كجم)`,
          created_by: user.id,
        })
        .select()
        .single();

      if (poErr) throw poErr;

      // Insert PO Lines
      const lines = missingItems.map((item) => ({
        po_id: po.id,
        item_id: item.item_id,
        ordered_qty: Math.ceil(item.missing_qty),
        unit_price_ex_vat: 5.0, // placeholder unit cost
        total_price_ex_vat: Math.ceil(item.missing_qty) * 5.0,
      }));

      const { error: lineErr } = await supabase.from("purchase_order_lines").insert(lines);
      if (lineErr) throw lineErr;

      toast.success(
        isArabic
          ? `تم إنشاء مسودة أمر الشراء ${poNumber} بنجاح`
          : `Draft PO ${poNumber} created successfully`
      );
      setPreCheckModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setIsCreatingPO(false);
    }
  };

  // Create Formula Mutation
  const createFormulaMutation = useMutation({
    mutationFn: async () => {
      if (!formulaCode || !nameAr) {
        throw new Error(isArabic ? "يرجى تعبئة الحقول الإلزامية" : "Required fields missing");
      }
      if (formulaLines.length === 0) {
        throw new Error(isArabic ? "يرجى إضافة مكون واحد على الأقل" : "At least one ingredient required");
      }

      const totalBatchGrams = batchSizeKg * 1000;

      // 1. Insert formula
      const { data: formulaData, error: fErr } = await supabase
        .from("formulas")
        .insert({
          code: formulaCode,
          name_ar: nameAr,
          name_en: nameEn || nameAr,
          bulk_item_id: bulkItemId || null,
          batch_size_grams: totalBatchGrams,
          target_ph_min: targetPhMin,
          target_ph_max: targetPhMax,
          target_viscosity_min: targetViscosityMin,
          target_viscosity_max: targetViscosityMax,
          instructions,
        })
        .select()
        .single();

      if (fErr) throw fErr;

      // 2. Insert formula lines
      const lines = formulaLines.map((line) => {
        const qtyGrams = line.qty_kg * 1000;
        const pct = (qtyGrams / totalBatchGrams) * 100;
        return {
          formula_id: formulaData.id,
          item_id: line.item_id,
          qty_grams: qtyGrams,
          percentage: Number(pct.toFixed(2)),
          addition_step: line.step,
          instructions: line.instructions || null,
        };
      });

      const { error: lErr } = await supabase.from("formula_lines").insert(lines);
      if (lErr) throw lErr;

      return formulaData;
    },
    onSuccess: () => {
      toast.success(isArabic ? "تم حفظ تركيبة الخلط بنجاح" : "Formula created successfully");
      queryClient.invalidateQueries({ queryKey: ["formulas"] });
      setCreateModalOpen(false);
      // Reset form
      setFormulaCode("");
      setNameAr("");
      setNameEn("");
      setFormulaLines([]);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    },
  });

  const filteredFormulas = formulas?.filter((f) => {
    const term = searchTerm.toLowerCase();
    return (
      f.code.toLowerCase().includes(term) ||
      f.name_ar.toLowerCase().includes(term) ||
      f.name_en.toLowerCase().includes(term)
    );
  });

  // In-Page Canvas View for Formula Creation (Eliminating modal popup)
  if (createModalOpen) {
    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <Button
              variant="tonal"
              size="sm"
              onClick={() => setCreateModalOpen(false)}
              className="gap-1.5"
            >
              <ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
              <span>{isArabic ? "العودة لقائمة التركيبات" : "Back to Formulas"}</span>
            </Button>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
                <FlaskConical className="h-5 w-5 text-sky-600" />
                <span>{t("manufacturing.createFormula")}</span>
              </h1>
              <p className="text-xs text-slate-500">
                أدخل بيانات الخلطة الكيميائية ونسب المواد ونطاقات الفحص المخبري
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setCreateModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={createFormulaMutation.isPending}
              onClick={() => createFormulaMutation.mutate()}
              className="bg-slate-900 hover:bg-slate-800 text-white min-h-[40px] px-5 font-semibold"
            >
              {createFormulaMutation.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </div>

        {/* Form Body in Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Formula Metadata Card */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-800">بيانات التركيبة الأساسية</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs font-semibold">{t("manufacturing.formulaCode")} *</Label>
                    <Input
                      placeholder="مثال: BOM-DW-5T"
                      value={formulaCode}
                      onChange={(e) => setFormulaCode(e.target.value)}
                      className="mt-1 font-mono"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">{t("manufacturing.formulaNameAr")} *</Label>
                    <Input
                      placeholder="صابون سائل للأيدي 5 طن"
                      value={nameAr}
                      onChange={(e) => setNameAr(e.target.value)}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">{t("manufacturing.formulaNameEn")}</Label>
                    <Input
                      placeholder="Hand Soap 5T Bulk"
                      value={nameEn}
                      onChange={(e) => setNameEn(e.target.value)}
                      className="mt-1 font-sans"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold">{t("manufacturing.batchSizeKg")} *</Label>
                    <Input
                      type="number"
                      value={batchSizeKg}
                      onChange={(e) => setBatchSizeKg(Number(e.target.value))}
                      min={100}
                      step={500}
                      className="mt-1 font-mono tabular-nums text-center font-bold"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">{t("manufacturing.bulkItem")}</Label>
                    <Select value={bulkItemId} onValueChange={setBulkItemId}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="اختر السائل السائب المستهدف..." />
                      </SelectTrigger>
                      <SelectContent>
                        {bulkItems?.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {isArabic ? item.name_ar : item.name_en} ({item.sku})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quality Specs Card */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-800">معايير الجودة والفحص المخبري (QC Ranges)</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div>
                    <Label className="text-xs font-semibold">{t("manufacturing.phMin")}</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={targetPhMin}
                      onChange={(e) => setTargetPhMin(Number(e.target.value))}
                      className="mt-1 font-mono text-center bg-white"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">{t("manufacturing.phMax")}</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={targetPhMax}
                      onChange={(e) => setTargetPhMax(Number(e.target.value))}
                      className="mt-1 font-mono text-center bg-white"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">{t("manufacturing.viscMin")}</Label>
                    <Input
                      type="number"
                      value={targetViscosityMin}
                      onChange={(e) => setTargetViscosityMin(Number(e.target.value))}
                      className="mt-1 font-mono text-center bg-white"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">{t("manufacturing.viscMax")}</Label>
                    <Input
                      type="number"
                      value={targetViscosityMax}
                      onChange={(e) => setTargetViscosityMax(Number(e.target.value))}
                      className="mt-1 font-mono text-center bg-white"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-semibold">{t("manufacturing.instructions")}</Label>
                  <Input
                    placeholder="تعليمات التشغيل: ترتيب الإضافة وسرعة الخلاط ودرجة الحرارة..."
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Formula Lines Card */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold text-slate-800">
                    {t("manufacturing.rawMaterialsLines")}
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 mt-0.5">
                    إدراج المواد الخام مع تحديد خطوة الإضافة والوزن بالكيلوجرام
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() =>
                    setFormulaLines([
                      ...formulaLines,
                      { item_id: "", qty_kg: 50, step: formulaLines.length + 1, instructions: "" },
                    ])
                  }
                  className="text-xs text-sky-700 border-sky-300 hover:bg-sky-50"
                >
                  <Plus className="me-1 h-3.5 w-3.5" />
                  {t("manufacturing.addLine")}
                </Button>
              </CardHeader>
              <CardContent className="pt-4">
                {formulaLines.length === 0 ? (
                  <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-xl text-slate-400">
                    <FlaskConical className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600">لا توجد مواد مضافة بعد</p>
                    <p className="text-xs text-slate-400 mt-1">اضغط زر "إضافة مادة خام" أعلاه لتحديد نسب التركيبة</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {formulaLines.map((line, idx) => (
                      <div
                        key={idx}
                        className="flex flex-col sm:flex-row sm:items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200"
                      >
                        <div className="w-full sm:w-24">
                          <Label className="text-[11px] text-slate-500 mb-1 block">الخطوة</Label>
                          <Input
                            type="number"
                            value={line.step}
                            onChange={(e) => {
                              const updated = [...formulaLines];
                              updated[idx].step = Number(e.target.value);
                              setFormulaLines(updated);
                            }}
                            className="font-mono text-center bg-white"
                          />
                        </div>

                        <div className="flex-1">
                          <Label className="text-[11px] text-slate-500 mb-1 block">المادة الخام *</Label>
                          <Select
                            value={line.item_id}
                            onValueChange={(val) => {
                              const updated = [...formulaLines];
                              updated[idx].item_id = val;
                              setFormulaLines(updated);
                            }}
                          >
                            <SelectTrigger className="bg-white">
                              <SelectValue placeholder="اختر المادة الخام..." />
                            </SelectTrigger>
                            <SelectContent>
                              {rawItems?.map((item) => (
                                <SelectItem key={item.id} value={item.id}>
                                  {isArabic ? item.name_ar : item.name_en} ({item.sku})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="w-full sm:w-32">
                          <Label className="text-[11px] text-slate-500 mb-1 block">الوزن (كجم) *</Label>
                          <Input
                            type="number"
                            value={line.qty_kg || ""}
                            onChange={(e) => {
                              const updated = [...formulaLines];
                              updated[idx].qty_kg = Number(e.target.value);
                              setFormulaLines(updated);
                            }}
                            className="font-mono tabular-nums bg-white text-center font-bold"
                          />
                        </div>

                        <div className="pt-5 sm:pt-4">
                          <Button
                            size="icon"
                            variant="ghost"
                            type="button"
                            onClick={() => {
                              const updated = formulaLines.filter((_, i) => i !== idx);
                              setFormulaLines(updated);
                            }}
                            className="text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Side Column: Summary */}
          <div className="space-y-6">
            <Card className="border-slate-200 shadow-sm sticky top-6">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-800">إجمالي التركيبة</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2.5">
                  <div className="flex justify-between text-slate-600">
                    <span>حجم التشغيلة المستهدف:</span>
                    <span className="font-mono font-bold text-slate-900">{batchSizeKg} كجم</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>مجموع أوزان المواد المضافة:</span>
                    <span className="font-mono font-bold text-sky-700">
                      {formulaLines.reduce((sum, l) => sum + (l.qty_kg || 0), 0)} كجم
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-2 text-slate-600">
                    <span>عدد المواد في الخلطة:</span>
                    <span className="font-mono font-bold text-slate-900">{formulaLines.length}</span>
                  </div>
                </div>

                <div className="pt-2 space-y-2">
                  <Button
                    disabled={createFormulaMutation.isPending}
                    onClick={() => createFormulaMutation.mutate()}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white min-h-[46px] font-bold"
                  >
                    {createFormulaMutation.isPending ? t("common.saving") : t("common.save")}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setCreateModalOpen(false)}
                    className="w-full"
                  >
                    {t("common.cancel")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }


  // Full-page in-place Canvas for Formula Specification Sheet
  if (selectedFormula) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto pb-16 animate-in fade-in duration-200">
        {/* Top Header Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3">
            <Button
              variant="tonal"
              size="sm"
              onClick={() => setSelectedFormula(null)}
              className="gap-1.5"
            >
              <ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
              <span>العودة لدليل التركيبات</span>
            </Button>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <FlaskConical className="h-5 w-5 text-sky-600" />
                <span>{isArabic ? selectedFormula.name_ar : selectedFormula.name_en}</span>
                <span className="font-mono text-xs text-slate-500 font-normal">
                  ({selectedFormula.code})
                </span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                المواصفات الكيميائية الدقيقة، نسب المواد الخام وخطوات الإضافة المعيارية
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelectedFormula(null)}>
              {t("common.close")}
            </Button>
          </div>
        </div>

        {/* Chem Specs Quick Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="p-4 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
            <span className="text-xs text-slate-500 block mb-1">{t("manufacturing.batchSize")}</span>
            <span className="text-xl font-black font-mono text-slate-900 dark:text-slate-100">
              {(selectedFormula.batch_size_grams / 1000).toLocaleString()} كجم
            </span>
          </Card>
          <Card className="p-4 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
            <span className="text-xs text-slate-500 block mb-1">{t("manufacturing.targetPh")}</span>
            <span className="text-xl font-black font-mono text-sky-700">
              {selectedFormula.target_ph_min} - {selectedFormula.target_ph_max}
            </span>
          </Card>
          <Card className="p-4 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
            <span className="text-xs text-slate-500 block mb-1">{t("manufacturing.targetViscosity")}</span>
            <span className="text-xl font-black font-mono text-emerald-700">
              {selectedFormula.target_viscosity_min} - {selectedFormula.target_viscosity_max} cPs
            </span>
          </Card>
          <Card className="p-4 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
            <span className="text-xs text-slate-500 block mb-1">الكثافة القياسية</span>
            <span className="text-xl font-black font-mono text-amber-700">
              {selectedFormula.density || 1.0} كجم/لتر
            </span>
          </Card>
        </div>

        {/* Operating Instructions */}
        {selectedFormula.instructions && (
          <Card className="shadow-sm border-sky-100 bg-sky-50/30 dark:bg-slate-900">
            <CardHeader className="pb-2 border-b border-sky-100 dark:border-slate-800">
              <CardTitle className="text-sm font-semibold text-sky-900 dark:text-sky-300">
                تعليمات الخلط والملاحظات الصناعية:
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-3 text-xs leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-line">
              {selectedFormula.instructions}
            </CardContent>
          </Card>
        )}

        {/* BOM Ingredients Table Card */}
        <Card className="shadow-sm overflow-hidden">
          <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">جدول المكونات وخطوات الإضافة المعيارية (BOM)</CardTitle>
            <span className="text-xs font-mono text-slate-500">
              {selectedFormula.formula_lines?.length} مكونات كيميائية
            </span>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 font-semibold">
                  <tr>
                    <th className="py-3 px-3 text-start">الخطوة</th>
                    <th className="py-3 px-3 text-start">المادة الكيميائية</th>
                    <th className="py-3 px-3 text-end">الوزن القياسي (كجم)</th>
                    <th className="py-3 px-3 text-end">النسبة المئوية (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {selectedFormula.formula_lines?.map((line: FormulaLine, idx: number) => (
                    <tr key={line.id || idx} className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-3 font-mono font-bold text-slate-500">
                        #{line.addition_step}
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-800 dark:text-slate-200">
                        {line.item ? (isArabic ? line.item.name_ar : line.item.name_en) : line.item_id}
                      </td>
                      <td className="py-3 px-3 text-end font-mono tabular-nums">
                        {canViewFormulaDetails ? (
                          `${(line.qty_grams / 1000).toLocaleString()} كجم`
                        ) : (
                          <span className="text-slate-400 font-normal">*** محمي ***</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-end font-mono tabular-nums font-bold text-sky-700">
                        {canViewFormulaDetails ? (
                          `${line.percentage}%`
                        ) : (
                          <span className="text-slate-400 font-normal">***</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Bottom Actions */}
        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => setSelectedFormula(null)}>
            {t("common.close")}
          </Button>
        </div>
      </div>
    );
  }

  // Full-page in-place Canvas for Pre-Production Stock Sufficiency Check
  if (preCheckModalOpen && preCheckFormula) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto pb-16 animate-in fade-in duration-200">
        {/* Top Header Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3">
            <Button
              variant="tonal"
              size="sm"
              onClick={() => {
                setPreCheckModalOpen(false);
                setPreCheckFormula(null);
                setPreCheckResult(null);
              }}
              className="gap-1.5"
            >
              <ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
              <span>العودة لدليل التركيبات</span>
            </Button>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <FlaskConical className="h-5 w-5 text-sky-600" />
                <span>{t("manufacturing.preCheckTitle")}</span>
                <span className="font-mono text-xs text-slate-500 font-normal">
                  ({isArabic ? preCheckFormula.name_ar : preCheckFormula.name_en})
                </span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {t("manufacturing.preCheckDesc")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {preCheckResult && !preCheckResult.can_produce && (
              <Button
                variant="default"
                disabled={isCreatingPO}
                onClick={handleCreateDraftPO}
                className="bg-amber-600 hover:bg-amber-700 text-white min-h-[40px] px-4 font-semibold"
              >
                <ShoppingCart className="me-2 h-4 w-4" />
                <span>{isCreatingPO ? t("common.loading") : t("manufacturing.createPoForMissing")}</span>
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => {
                setPreCheckModalOpen(false);
                setPreCheckFormula(null);
                setPreCheckResult(null);
              }}
            >
              {t("common.close")}
            </Button>
          </div>
        </div>

        {/* Batch Weight Input & Overall Result */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-2 border-slate-200 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-800">حجم التشغيلة المراد فحص كفايتها</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <Label className="text-xs font-semibold text-slate-700">
                    {isArabic ? "حجم التشغيلة المطلوب فحصها (كجم):" : "Target Batch Weight (Kg):"}
                  </Label>
                  <Input
                    type="number"
                    value={plannedBatchKg}
                    onChange={(e) => setPlannedBatchKg(Number(e.target.value))}
                    min={100}
                    step={100}
                    className="font-mono tabular-nums text-sm bg-white mt-1"
                  />
                </div>
                <div className="pt-5">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={isCheckingPreProd}
                    onClick={() => preCheckFormula && handleRunPreCheck(preCheckFormula, plannedBatchKg)}
                    className="min-h-[40px] px-5 font-semibold"
                  >
                    {isCheckingPreProd ? t("common.loading") : isArabic ? "إعادة الفحص الآني" : "Re-Check"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm flex flex-col justify-center items-center p-6 text-center">
            <span className="text-xs text-slate-500 block mb-2 font-medium">النتيجة الإجمالية للجاهزية</span>
            {preCheckResult ? (
              preCheckResult.can_produce ? (
                <Badge variant="emerald" className="py-1.5 px-4 text-sm font-bold">
                  <CheckCircle2 className="me-1.5 h-4 w-4" />
                  {t("manufacturing.canProduce")}
                </Badge>
              ) : (
                <Badge variant="rose" className="py-1.5 px-4 text-sm font-bold">
                  <AlertTriangle className="me-1.5 h-4 w-4" />
                  {t("manufacturing.cannotProduce")}
                </Badge>
              )
            ) : (
              <span className="text-xs text-slate-400">جاري احتساب الأرصدة...</span>
            )}
          </Card>
        </div>

        {/* Raw Materials Sufficiency Table */}
        {preCheckResult && (
          <Card className="border-slate-200 shadow-sm overflow-hidden">
            <CardHeader className="py-3 px-4 border-b border-slate-100 bg-slate-50">
              <CardTitle className="text-sm font-bold text-slate-800">
                تقرير فحص توافر الخامات بالمستودعات
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-start">
                  <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">{t("common.code")}</th>
                      <th className="py-2.5 px-3">{isArabic ? "المادة الخام" : "Material"}</th>
                      <th className="py-2.5 px-3 text-end">{isArabic ? "المطلوب (كجم)" : "Required"}</th>
                      <th className="py-2.5 px-3 text-end">{isArabic ? "المتاح بالمخزن" : "Stock"}</th>
                      <th className="py-2.5 px-3 text-end">{isArabic ? "العجز" : "Shortage"}</th>
                      <th className="py-2.5 px-3 text-center">{t("common.status")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preCheckResult.items.map((item) => {
                      const reqKg = (item.required_qty / 1000).toFixed(2);
                      const stockKg = (item.available_stock / 1000).toFixed(2);
                      const missKg = (item.missing_qty / 1000).toFixed(2);

                      return (
                        <tr
                          key={item.item_id}
                          className={item.is_sufficient ? "hover:bg-slate-50" : "bg-rose-50/50"}
                        >
                          <td className="py-2.5 px-3 font-mono font-medium text-slate-600">
                            {item.sku}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-900">
                            {isArabic ? item.name_ar : item.name_en}
                          </td>
                          <td className="py-2.5 px-3 text-end font-mono tabular-nums">{reqKg}</td>
                          <td className="py-2.5 px-3 text-end font-mono tabular-nums text-slate-700">
                            {stockKg}
                          </td>
                          <td className="py-2.5 px-3 text-end font-mono tabular-nums font-bold text-rose-600">
                            {Number(missKg) > 0 ? missKg : "-"}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {item.is_sufficient ? (
                              <span className="inline-flex items-center text-emerald-700 text-[11px] font-semibold">
                                <CheckCircle2 className="h-3.5 w-3.5 me-1 text-emerald-600" />
                                متاح
                              </span>
                            ) : (
                              <span className="inline-flex items-center text-rose-700 text-[11px] font-semibold">
                                <AlertTriangle className="h-3.5 w-3.5 me-1 text-rose-600" />
                                عجز
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <FlaskConical className="h-6 w-6 text-sky-600" />
            <span>{t("manufacturing.formulasTitle")}</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            {t("manufacturing.formulasSubtitle")}
          </p>
        </div>

        {isOwner && (
          <Button
            onClick={() => setCreateModalOpen(true)}
            className="bg-slate-900 hover:bg-slate-800 text-white min-h-[44px]"
          >
            <Plus className="me-2 h-4 w-4" />
            <span>{t("manufacturing.createFormula")}</span>
          </Button>
        )}
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder={isArabic ? "بحث بكود أو اسم التركيبة..." : "Search by code or name..."}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="ps-9 bg-white"
        />
      </div>

      {/* Grid of Formulas */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      ) : filteredFormulas?.length === 0 ? (
        <Card className="text-center py-12 border-dashed">
          <FlaskConical className="h-12 w-12 mx-auto text-slate-300 mb-3" />
          <h3 className="font-semibold text-slate-700">
            {isArabic ? "لا توجد تركيبات مسجلة" : "No formulas found"}
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            {isArabic
              ? "يمكنك إنشاء تركيبة خلط جديدة لتحديد نسب المواد والوزن المستهدف"
              : "Create a new formula to specify chemicals, ratios, and batch size"}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFormulas?.map((formula) => {
            const linesCount = formula.formula_lines?.length || 0;
            const batchKg = (formula.batch_size_grams / 1000).toLocaleString();

            return (
              <Card
                key={formula.id}
                className="border-industrial-border bg-white shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono text-xs font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-100">
                        {formula.code}
                      </span>
                      <CardTitle className="text-base font-bold mt-2 text-slate-900">
                        {isArabic ? formula.name_ar : formula.name_en}
                      </CardTitle>
                      <CardDescription className="text-xs line-clamp-1 mt-0.5">
                        {isArabic ? formula.name_en : formula.name_ar}
                      </CardDescription>
                    </div>
                    <Badge variant={formula.is_active ? "emerald" : "outline"} className="text-[10px]">
                      {formula.is_active ? t("common.active") : t("common.inactive")}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 pt-0">
                  <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <div>
                      <span className="text-slate-500 block text-[11px]">{t("manufacturing.batchSize")}</span>
                      <span className="font-bold tabular-nums text-slate-800">{batchKg} كجم</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">{t("manufacturing.targetPh")}</span>
                      <span className="font-bold tabular-nums text-slate-800">
                        {formula.target_ph_min} - {formula.target_ph_max}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">{t("manufacturing.targetViscosity")}</span>
                      <span className="font-bold tabular-nums text-slate-800">
                        {formula.target_viscosity_min} - {formula.target_viscosity_max}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">المكونات الكيميائية</span>
                      <span className="font-bold tabular-nums text-slate-800">{linesCount} خامات</span>
                    </div>
                  </div>

                  {!canViewFormulaDetails && (
                    <div className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 p-2 rounded border border-amber-100">
                      <Lock className="h-3.5 w-3.5 shrink-0" />
                      <span>{t("manufacturing.secretFormulaMasked")}</span>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="pt-2 flex items-center gap-2 border-t border-slate-100">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openPreCheckDialog(formula)}
                      className="flex-1 text-xs border-sky-300 text-sky-700 hover:bg-sky-50 min-h-[38px]"
                    >
                      <CheckCircle2 className="me-1.5 h-3.5 w-3.5 text-sky-600" />
                      <span>{t("manufacturing.preCheck")}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedFormula(formula)}
                      className="text-xs text-slate-600 hover:text-slate-900 min-h-[38px]"
                    >
                      <span>{t("common.details")}</span>
                      <ChevronRight className="ms-1 h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
