import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import type { PackagingOrder, MixingBatch, PackagingSpec, FactorySettings } from "@/types/database";
import { ThermalBatchLabel } from "@/components/manufacturing/ThermalBatchLabel";

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

import {
  Package,
  Plus,
  Search,
  Printer,
  AlertTriangle,
  CheckCircle2,
  Box,
  Layers,
  Droplets,
  Calendar,
} from "lucide-react";

export function PackagingOrdersPage() {
  const { t, i18n } = useTranslation();
  const { user, isOwner, profile } = useAuth();
  const queryClient = useQueryClient();
  const isArabic = i18n.language === "ar";

  const [searchTerm, setSearchTerm] = useState("");

  // New Packaging Order Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [selectedSpecId, setSelectedSpecId] = useState("");
  const [unitsProduced, setUnitsProduced] = useState<number>(100);
  const [wastedBottles, setWastedBottles] = useState<number>(0);
  const [wastedStickers, setWastedStickers] = useState<number>(0);
  const [wastedCartons, setWastedCartons] = useState<number>(0);
  const [wastedNotes, setWastedNotes] = useState("");

  // Thermal Label Print Modal State
  const [labelModalOpen, setLabelModalOpen] = useState(false);
  const [selectedOrderForLabel, setSelectedOrderForLabel] = useState<PackagingOrder | null>(null);

  const canViewCosts = isOwner || profile?.can_view_costs === true;

  // 1. Fetch Packaging Orders list
  const { data: orders, isLoading: isOrdersLoading } = useQuery<PackagingOrder[]>({
    queryKey: ["packaging-orders-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("packaging_orders")
        .select(`
          *,
          mixing_batch:mixing_batches!packaging_orders_mixing_batch_id_fkey(
            id,
            batch_number,
            status,
            qc_status,
            tank:tanks(id, tank_code, name_ar, name_en)
          ),
          packaging_spec:packaging_specs!packaging_orders_packaging_spec_id_fkey(
            id,
            code,
            name_ar,
            name_en,
            volume_per_unit_grams,
            pieces_per_carton
          ),
          target_fg_item:items!packaging_orders_target_fg_item_id_fkey(
            id,
            sku,
            name_ar,
            name_en,
            shelf_life_months
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as PackagingOrder[];
    },
  });

  // 2. Fetch Active Approved Batches (Strict QC Gate: qc_status = 'passed')
  const { data: approvedBatches } = useQuery<MixingBatch[]>({
    queryKey: ["batches-qc-passed"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mixing_batches")
        .select(`
          *,
          formula:formulas(id, code, name_ar, name_en, bulk_item_id),
          tank:tanks(id, tank_code, name_ar, name_en)
        `)
        .eq("qc_status", "passed")
        .gt("remaining_qty_grams", 0)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as MixingBatch[];
    },
    enabled: createModalOpen,
  });

  // 3. Fetch Packaging Specs compatible with chosen batch
  const selectedBatch = approvedBatches?.find((b) => b.id === selectedBatchId);
  const bulkItemId = selectedBatch?.formula?.bulk_item_id;

  const { data: compatibleSpecs } = useQuery<PackagingSpec[]>({
    queryKey: ["packaging-specs-compatible", bulkItemId],
    queryFn: async () => {
      if (!bulkItemId) return [];
      const { data, error } = await supabase
        .from("packaging_specs")
        .select(`
          *,
          finished_good:items!packaging_specs_finished_good_id_fkey(id, sku, name_ar, name_en)
        `)
        .eq("bulk_item_id", bulkItemId)
        .eq("is_active", true);

      if (error) throw error;
      return (data || []) as unknown as PackagingSpec[];
    },
    enabled: !!bulkItemId,
  });

  // 4. Fetch Factory Settings for Thermal Label sizes
  const { data: settings } = useQuery<FactorySettings | null>({
    queryKey: ["factory-settings-thermal"],
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

  // Calculate live filling metrics
  const selectedSpec = compatibleSpecs?.find((s) => s.id === selectedSpecId);
  const totalBulkNeededGrams = selectedSpec ? unitsProduced * selectedSpec.volume_per_unit_grams : 0;
  const totalBulkNeededKg = (totalBulkNeededGrams / 1000).toFixed(1);
  const remainingBulkInTankKg = selectedBatch ? (selectedBatch.remaining_qty_grams / 1000).toFixed(1) : "0";
  const calculatedCartons = selectedSpec ? Math.floor(unitsProduced / selectedSpec.pieces_per_carton) : 0;
  const isBulkSufficient = selectedBatch ? selectedBatch.remaining_qty_grams >= totalBulkNeededGrams : true;

  // Execute Packaging Order Mutation (calls atomic rpc_execute_packaging_order)
  const executePackagingMutation = useMutation({
    mutationFn: async () => {
      if (!selectedBatchId || !selectedSpecId || unitsProduced <= 0) {
        throw new Error(isArabic ? "يرجى تعبئة الحقول المطلوبة" : "Please fill required fields");
      }
      if (!user?.id) throw new Error("User not authenticated");

      if (!isBulkSufficient) {
        throw new Error(
          isArabic
            ? `الكمية المتبقية بالتانك (${remainingBulkInTankKg} كجم) غير كافية لتعبئة المطلوب (${totalBulkNeededKg} كجم)`
            : "Insufficient bulk liquid remaining in tank"
        );
      }

      const { data, error } = await supabase.rpc("rpc_execute_packaging_order", {
        p_batch_id: selectedBatchId,
        p_spec_id: selectedSpecId,
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
      toast.success(
        isArabic
          ? `تم تنفيذ أمر التعبئة ${data?.order_number || ""} بنجاح وإضافة المنتج التام لمخزون FIFO!`
          : `Packaging order executed successfully and finished goods added to FIFO inventory!`
      );
      queryClient.invalidateQueries({ queryKey: ["packaging-orders-list"] });
      queryClient.invalidateQueries({ queryKey: ["tanks-with-batches"] });
      queryClient.invalidateQueries({ queryKey: ["batches-qc-passed"] });
      setCreateModalOpen(false);
      // Reset form
      setSelectedBatchId("");
      setSelectedSpecId("");
      setUnitsProduced(100);
      setWastedBottles(0);
      setWastedStickers(0);
      setWastedCartons(0);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    },
  });

  const openLabelDialog = (order: PackagingOrder) => {
    setSelectedOrderForLabel(order);
    setLabelModalOpen(true);
  };

  const filteredOrders = orders?.filter((o) => {
    const term = searchTerm.toLowerCase();
    const batchNum = o.mixing_batch?.batch_number?.toLowerCase() || "";
    const fgName = o.target_fg_item?.name_ar?.toLowerCase() || "";
    return o.order_number.toLowerCase().includes(term) || batchNum.includes(term) || fgName.includes(term);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Package className="h-6 w-6 text-sky-600" />
            <span>{t("manufacturing.packagingTitle")}</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            {t("manufacturing.packagingSubtitle")}
          </p>
        </div>

        <Button
          onClick={() => setCreateModalOpen(true)}
          className="bg-slate-900 hover:bg-slate-800 text-white min-h-[44px]"
        >
          <Plus className="me-2 h-4 w-4" />
          <span>{t("manufacturing.createPackagingOrder")}</span>
        </Button>
      </div>

      {/* Orders Table */}
      <Card className="border-industrial-border bg-white shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold text-slate-900">
              أوامر التعبئة المنفذة
            </CardTitle>
            <CardDescription className="text-xs">
              سجل التعبئة المتعددة من التانك، تتبع كراتين المنتج التام، وهالك العبوات والملصقات
            </CardDescription>
          </div>
          <div className="relative w-64">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="بحث برقم الأمر أو المنتج..."
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
            aria-label={isArabic ? "سجل أوامر التعبئة والتغليف" : "Packaging Orders Register"}
          >
            <table className="w-full text-xs text-start">
              <caption className="sr-only">
                {isArabic ? "قائمة أوامر التعبئة والتغليف المكتملة والجارية" : "Packaging Orders List"}
              </caption>
              <thead className="bg-slate-100 text-slate-700 border-y border-slate-200 font-semibold sticky top-0 z-10">
                <tr>
                  <th scope="col" className="py-2.5 px-3">{t("manufacturing.orderNumber")}</th>
                  <th scope="col" className="py-2.5 px-3">{t("common.date")}</th>
                  <th scope="col" className="py-2.5 px-3">التشغيلة / التانك</th>
                  <th scope="col" className="py-2.5 px-3">{t("manufacturing.finishedGood")}</th>
                  <th scope="col" className="py-2.5 px-3 text-end">{t("manufacturing.unitsProduced")}</th>
                  <th scope="col" className="py-2.5 px-3 text-end">{t("manufacturing.cartonsProduced")}</th>
                  <th scope="col" className="py-2.5 px-3 text-end">السائل المستهلك</th>
                  <th scope="col" className="py-2.5 px-3 text-center">الهالك</th>
                  {canViewCosts && <th scope="col" className="py-2.5 px-3 text-end">تكلفة الوحدة</th>}
                  <th scope="col" className="py-2.5 px-3 text-center">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isOrdersLoading ? (
                  [1, 2, 3].map((i) => (
                    <tr key={i}>
                      <td colSpan={canViewCosts ? 10 : 9} className="py-4 px-3">
                        <Skeleton className="h-6 w-full" />
                      </td>
                    </tr>
                  ))
                ) : filteredOrders?.length === 0 ? (
                  <tr>
                    <td colSpan={canViewCosts ? 10 : 9} className="py-8 text-center text-slate-400">
                      لا توجد أوامر تعبئة منفذة حتى الآن
                    </td>
                  </tr>
                ) : (
                  filteredOrders?.map((order) => {
                    const bulkKg = (order.bulk_consumed_grams / 1000).toFixed(1);
                    const hasWaste = order.wasted_bottles > 0 || order.wasted_stickers > 0 || order.wasted_cartons > 0;

                    return (
                      <tr key={order.id} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-3 font-mono font-bold text-sky-700">
                          {order.order_number}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-600">
                          {order.packaging_date}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-mono font-bold text-slate-800 block">
                            {order.mixing_batch?.batch_number}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {order.mixing_batch?.tank?.tank_code}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900">
                          {order.target_fg_item ? (isArabic ? order.target_fg_item.name_ar : order.target_fg_item.name_en) : "-"}
                        </td>
                        <td className="py-2.5 px-3 text-end font-mono tabular-nums font-bold text-slate-900">
                          {order.units_produced.toLocaleString()} عبوة
                        </td>
                        <td className="py-2.5 px-3 text-end font-mono tabular-nums text-slate-800">
                          {order.cartons_produced.toLocaleString()} كرتون
                        </td>
                        <td className="py-2.5 px-3 text-end font-mono tabular-nums text-slate-700">
                          {bulkKg} كجم
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {hasWaste ? (
                            <Badge variant="amber" className="text-[10px] py-0">
                              {order.wasted_bottles}ع / {order.wasted_stickers}س / {order.wasted_cartons}ك
                            </Badge>
                          ) : (
                            <span className="text-slate-400 text-[11px]">-</span>
                          )}
                        </td>
                        {canViewCosts && (
                          <td className="py-2.5 px-3 text-end font-mono tabular-nums text-emerald-700 font-bold">
                            {order.unit_cost.toFixed(2)} ر.س
                          </td>
                        )}
                        <td className="py-2.5 px-3 text-center">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openLabelDialog(order)}
                            className="h-7 text-xs border-slate-300 text-slate-700 hover:bg-slate-100 px-2"
                          >
                            <Printer className="me-1 h-3.5 w-3.5 text-sky-600" />
                            <span>الملصق</span>
                          </Button>
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

      {/* 1. Create Packaging Order Dialog */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Package className="h-5 w-5 text-sky-600" />
              <span>{t("manufacturing.createPackagingOrder")}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              اختر تشغيلة معتمدة الجودة لتعبئة المنتج التام وخصم العبوات ومواد التغليف
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-2 text-xs">
            {/* Step 1: Select Approved Batch (Strict QC Gate) */}
            <div>
              <Label className="text-xs font-semibold">تشغيلة الخلط المعتمدة (QC Passed) *</Label>
              <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="اختر تشغيلة معتمدة..." />
                </SelectTrigger>
                <SelectContent>
                  {approvedBatches?.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.batch_number} - {isArabic ? b.formula?.name_ar : b.formula?.name_en} ({b.tank?.tank_code} - متبقي {Math.round(b.remaining_qty_grams / 1000)} كجم)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {approvedBatches?.length === 0 && (
                <div className="flex items-center gap-1.5 text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200 mt-2 text-[11px]">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>
                    لا توجد تشغيلات خلط حاصلة على اعتماد الجودة (Passed). يجب فحص واعتماد الجودة من شاشة التانكات أولاً.
                  </span>
                </div>
              )}
            </div>

            {/* Step 2: Select Packaging Spec */}
            {selectedBatch && (
              <div>
                <Label className="text-xs font-semibold">مواصفة وحجم التعبئة *</Label>
                <Select value={selectedSpecId} onValueChange={setSelectedSpecId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="اختر مواصفة التعبئة (الحجم / المنتج)..." />
                  </SelectTrigger>
                  <SelectContent>
                    {compatibleSpecs?.map((spec) => (
                      <SelectItem key={spec.id} value={spec.id}>
                        {isArabic ? spec.name_ar : spec.name_en} ({spec.code}) - {spec.volume_per_unit_grams / 1000} لتر
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Step 3: Quantities and Calculations */}
            {selectedSpec && (
              <div className="space-y-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-semibold">{t("manufacturing.unitsProduced")} *</Label>
                    <Input
                      type="number"
                      value={unitsProduced}
                      onChange={(e) => setUnitsProduced(Number(e.target.value))}
                      min={1}
                      className="mt-1 font-mono text-center font-bold"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">{t("manufacturing.cartonsProduced")}</Label>
                    <div className="mt-1 h-9 rounded-md border border-slate-200 bg-white flex items-center justify-center font-mono font-bold text-slate-800">
                      {calculatedCartons} كرتون
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-200">
                  <span className="text-slate-600">السائل السائب المطلوب سحبه:</span>
                  <span className={`font-mono font-bold tabular-nums ${isBulkSufficient ? "text-emerald-700" : "text-rose-600"}`}>
                    {totalBulkNeededKg} كجم (المتبقي بالتانك: {remainingBulkInTankKg} كجم)
                  </span>
                </div>

                {!isBulkSufficient && (
                  <div className="text-rose-600 font-semibold text-[11px] flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    الكمية المطلوبة تتجاوز المتبقي في التانك!
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Spoilage Tracking (Bottles, Stickers, Cartons) */}
            <div className="pt-2 border-t border-slate-200 space-y-2">
              <span className="font-bold text-slate-800 text-xs block">
                تسجيل هالك مواد التعبئة (لخصم المخزون والرقابة):
              </span>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-[11px] text-slate-600">{t("manufacturing.wastedBottles")}</Label>
                  <Input
                    type="number"
                    value={wastedBottles}
                    onChange={(e) => setWastedBottles(Number(e.target.value))}
                    min={0}
                    className="mt-1 font-mono text-center text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-slate-600">{t("manufacturing.wastedStickers")}</Label>
                  <Input
                    type="number"
                    value={wastedStickers}
                    onChange={(e) => setWastedStickers(Number(e.target.value))}
                    min={0}
                    className="mt-1 font-mono text-center text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-slate-600">{t("manufacturing.wastedCartons")}</Label>
                  <Input
                    type="number"
                    value={wastedCartons}
                    onChange={(e) => setWastedCartons(Number(e.target.value))}
                    min={0}
                    className="mt-1 font-mono text-center text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={
                executePackagingMutation.isPending ||
                !selectedBatch ||
                !selectedSpec ||
                !isBulkSufficient ||
                unitsProduced <= 0
              }
              onClick={() => executePackagingMutation.mutate()}
              className="bg-slate-900 hover:bg-slate-800 text-white min-h-[44px]"
            >
              {executePackagingMutation.isPending ? t("common.saving") : "تنفيذ التعبئة وترحيل المخزون"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2. Print Thermal Label Dialog */}
      <Dialog open={labelModalOpen} onOpenChange={setLabelModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Printer className="h-5 w-5 text-sky-600" />
              <span>{t("manufacturing.printLabel")}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              معاينة وطباعة ملصق الباركود الحراري وفق أبعاد المصنع المحددة ({settings?.label_width_mm || 50} × {settings?.label_height_mm || 30} مم)
            </DialogDescription>
          </DialogHeader>

          {selectedOrderForLabel && (
            <div className="flex flex-col items-center py-4">
              {(() => {
                const prodDate = selectedOrderForLabel.packaging_date || new Date().toISOString().split("T")[0];
                const shelfLife = selectedOrderForLabel.target_fg_item?.shelf_life_months || 24;
                
                // Calculate automated expiry date
                const pDateObj = new Date(prodDate);
                pDateObj.setMonth(pDateObj.getMonth() + shelfLife);
                const expiryDate = pDateObj.toISOString().split("T")[0];

                return (
                  <ThermalBatchLabel
                    productNameAr={selectedOrderForLabel.target_fg_item?.name_ar || ""}
                    productNameEn={selectedOrderForLabel.target_fg_item?.name_en || ""}
                    batchNumber={selectedOrderForLabel.mixing_batch?.batch_number || selectedOrderForLabel.order_number}
                    productionDate={prodDate}
                    expiryDate={expiryDate}
                    sku={selectedOrderForLabel.target_fg_item?.sku || ""}
                    widthMm={settings?.label_width_mm || 50}
                    heightMm={settings?.label_height_mm || 30}
                  />
                );
              })()}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setLabelModalOpen(false)}>
              {t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
