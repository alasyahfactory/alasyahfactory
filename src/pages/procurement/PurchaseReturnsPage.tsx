import { printDocumentHtml, saveDocumentPdfFromHtml, shareDocumentWhatsApp } from "@/utils/printAndPdf";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { PurchaseReturn, Supplier, Item, FifoLayer } from "@/types/database";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { 
  RotateCcw, 
  Search, 
  Plus, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  FileText, 
  ArrowLeftRight,
  Eye,
  ArrowRight,
  Printer,
  Download,
  Share2
} from "lucide-react";

export function PurchaseReturnsPage() {
  const { i18n } = useTranslation();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const isAr = i18n.language === "ar";

  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState<PurchaseReturn | null>(null);

  // Form State
  const [supplierId, setSupplierId] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [selectedLayerId, setSelectedLayerId] = useState("");
  const [claimedQty, setClaimedQty] = useState<number>(0);
  const [unitPriceExVat, setUnitPriceExVat] = useState<number>(0);
  const [defectReason, setDefectReason] = useState("");

  // 1. Fetch Returns
  const { data: returns = [], isLoading } = useQuery<PurchaseReturn[]>({
    queryKey: ["purchase_returns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_returns")
        .select(`
          *,
          supplier:suppliers(name_ar, name_en, tax_number),
          lines:purchase_return_lines(
            *,
            item:items(sku, name_ar, name_en, base_unit)
          )
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as PurchaseReturn[];
    },
  });

  // 2. Fetch Suppliers
  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["suppliers_active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").eq("is_active", true);
      if (error) throw error;
      return data as Supplier[];
    },
  });

  // 3. Fetch Items
  const { data: items = [] } = useQuery<Item[]>({
    queryKey: ["items_active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("items").select("*").eq("is_active", true);
      if (error) throw error;
      return data as Item[];
    },
  });

  // 4. Fetch FIFO Layers for chosen item
  const { data: layers = [] } = useQuery<FifoLayer[]>({
    queryKey: ["fifo_layers_for_return", selectedItemId],
    enabled: !!selectedItemId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fifo_layers")
        .select("*, warehouse:warehouses(name_ar)")
        .eq("item_id", selectedItemId)
        .order("layer_date", { ascending: false });
      if (error) throw error;
      return data as FifoLayer[];
    },
  });

  const selectedLayer = layers.find((l) => l.id === selectedLayerId);
  const selectedItem = items.find((i) => i.id === selectedItemId);

  // Auto-fill unit cost from selected layer
  const handleLayerSelect = (layerId: string) => {
    setSelectedLayerId(layerId);
    const layer = layers.find((l) => l.id === layerId);
    if (layer) {
      setUnitPriceExVat(layer.unit_cost_ex_vat);
    }
  };

  // Real-time calculations of compensation split
  const remainingInLayer = selectedLayer ? selectedLayer.remaining_qty : 0;
  const physicalDeductionQty = Math.min(claimedQty, remainingInLayer);
  const consumedCompensationQty = Math.max(0, claimedQty - remainingInLayer);

  const totalClaimedExVat = claimedQty * unitPriceExVat;
  const totalVatRefund = totalClaimedExVat * 0.15;
  const totalClaimedIncVat = totalClaimedExVat + totalVatRefund;

  const stockDeductedValue = physicalDeductionQty * unitPriceExVat;
  const consumedCompensationValue = consumedCompensationQty * unitPriceExVat;

  // Submit Debit Note
  const submitDebitNoteMutation = useMutation({
    mutationFn: async () => {
      if (!supplierId || !selectedItemId || claimedQty <= 0 || unitPriceExVat <= 0) {
        throw new Error("يرجى ملء جميع البيانات والكمية المطلوبة وسعر الوحدة");
      }

      const returnNumber = `DN-${new Date().toISOString().slice(0, 7).replace("-", "")}-${Math.floor(1000 + Math.random() * 9000)}`;

      // 1. Insert Return Header
      const { data: returnHeader, error: rErr } = await supabase
        .from("purchase_returns")
        .insert([
          {
            return_number: returnNumber,
            supplier_id: supplierId,
            total_claimed_ex_vat: totalClaimedExVat,
            total_vat_refund: totalVatRefund,
            total_claimed_inc_vat: totalClaimedIncVat,
            stock_deducted_value: stockDeductedValue,
            consumed_compensation_value: consumedCompensationValue,
            status: "draft",
            created_by: profile?.id,
            notes: defectReason,
          },
        ])
        .select()
        .single();

      if (rErr) throw rErr;

      // 2. Insert Line
      const { error: lineErr } = await supabase.from("purchase_return_lines").insert([
        {
          return_id: returnHeader.id,
          item_id: selectedItemId,
          fifo_layer_id: selectedLayerId || null,
          claimed_qty: claimedQty,
          remaining_in_stock_qty: physicalDeductionQty,
          consumed_qty: consumedCompensationQty,
          unit_price_ex_vat: unitPriceExVat,
          vat_rate: 15.0,
          total_ex_vat: totalClaimedExVat,
          vat_amount: totalVatRefund,
          total_inc_vat: totalClaimedIncVat,
          stock_deducted_amount: stockDeductedValue,
          compensation_amount: consumedCompensationValue,
          reason: defectReason,
        },
      ]);

      if (lineErr) throw lineErr;

      // 3. Atomically process return with compensation & post balanced Journal Entry
      const { data: rpcRes, error: rpcErr } = await supabase.rpc(
        "rpc_process_purchase_return_with_compensation",
        {
          p_return_id: returnHeader.id,
          p_created_by: profile?.id || returnHeader.id,
        }
      );

      if (rpcErr) throw rpcErr;

      return { returnNumber, rpcRes };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["purchase_returns"] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["fifo_layers"] });
      toast.success(
        isAr
          ? `تم ترحيل إشعار المدين ${res.returnNumber} والقيد المالي المتوازن بنجاح`
          : `Debit Note ${res.returnNumber} and balanced journal entry posted successfully`
      );
      setIsCreateOpen(false);
      setSupplierId("");
      setSelectedItemId("");
      setSelectedLayerId("");
      setClaimedQty(0);
      setUnitPriceExVat(0);
      setDefectReason("");
    },
    onError: (err: any) => {
      toast.error(err.message || "حدث خطأ أثناء ترحيل إشعار المدين");
    },
  });

  const filteredReturns = returns.filter((r) => {
    const q = searchQuery.toLowerCase();
    return (
      r.return_number.toLowerCase().includes(q) ||
      r.supplier?.name_ar.toLowerCase().includes(q)
    );
  });

  // In-Page Canvas View for Debit Note Creation (Eliminating modal popup)
  if (isCreateOpen) {
    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <Button
              variant="tonal"
              size="sm"
              onClick={() => setIsCreateOpen(false)}
              className="gap-1.5"
            >
              <ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
              <span>{isAr ? "العودة لإشعارات المدين" : "Back to Debit Notes"}</span>
            </Button>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-amber-600" />
                <span>{isAr ? "إصدار إشعار مدين مدمج للمورد (Debit Note)" : "Issue Integrated Debit Note"}</span>
              </h1>
              <p className="text-xs text-slate-500">
                {isAr ? "مطالبة المورد بكامل القيمة وفصل الخصم المخزني الفعلي عن تعويض الجزء المستهلك" : "Claim full batch value and split inventory from defect revenue"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              onClick={() => submitDebitNoteMutation.mutate()}
              disabled={submitDebitNoteMutation.isPending || !supplierId || claimedQty <= 0}
              className="bg-slate-900 hover:bg-slate-800 text-white min-h-[40px] px-5 gap-2"
            >
              {submitDebitNoteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              <span>{isAr ? "ترحيل إشعار المدين والقيد المزدوج" : "Post Debit Note"}</span>
            </Button>
          </div>
        </div>

        {/* Form Body in Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Form Fields Card */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-800">
                  {isAr ? "بيانات المورد والخامة المعيبة" : "Supplier & Defective Material Details"}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Supplier */}
                  <div className="space-y-1.5">
                    <Label htmlFor="dn_supplier">{isAr ? "المورد *" : "Supplier *"}</Label>
                    <select
                      id="dn_supplier"
                      value={supplierId}
                      onChange={(e) => setSupplierId(e.target.value)}
                      className="w-full h-9 rounded border border-slate-200 bg-white px-2 text-sm focus:ring-1 focus:ring-slate-900"
                    >
                      <option value="">{isAr ? "-- اختر المورد --" : "-- Select Supplier --"}</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name_ar}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Item */}
                  <div className="space-y-1.5">
                    <Label htmlFor="dn_item">{isAr ? "الصنف المعيب *" : "Defective Item *"}</Label>
                    <select
                      id="dn_item"
                      value={selectedItemId}
                      onChange={(e) => {
                        setSelectedItemId(e.target.value);
                        setSelectedLayerId("");
                      }}
                      className="w-full h-9 rounded border border-slate-200 bg-white px-2 text-sm focus:ring-1 focus:ring-slate-900"
                    >
                      <option value="">{isAr ? "-- اختر الصنف --" : "-- Select Item --"}</option>
                      {items.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.sku} - {it.name_ar}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Original Layer */}
                  <div className="space-y-1.5">
                    <Label htmlFor="dn_layer">{isAr ? "طبقة الـ FIFO الأصلية للباتش" : "Original FIFO Layer"}</Label>
                    <select
                      id="dn_layer"
                      value={selectedLayerId}
                      onChange={(e) => handleLayerSelect(e.target.value)}
                      disabled={!selectedItemId}
                      className="w-full h-9 rounded border border-slate-200 bg-white px-2 text-sm focus:ring-1 focus:ring-slate-900"
                    >
                      <option value="">{isAr ? "-- اختر باتش الطبقة --" : "-- Select Batch --"}</option>
                      {layers.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.batch_number} - متبقي {l.remaining_qty.toLocaleString("en-US")} {selectedItem?.base_unit === "gram" ? "جم" : "حبة"} (سعر: {l.unit_cost_ex_vat} ر.س)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Claimed Qty */}
                  <div className="space-y-1.5">
                    <Label htmlFor="dn_claimed">
                      {isAr ? "إجمالي الكمية المطالب بها بالكامل *" : "Total Claimed Qty *"}
                    </Label>
                    <Input
                      id="dn_claimed"
                      type="number"
                      min="0"
                      step="any"
                      value={claimedQty || ""}
                      onChange={(e) => setClaimedQty(Number(e.target.value))}
                      placeholder="0"
                      className="h-9 font-mono"
                    />
                  </div>

                  {/* Unit Price */}
                  <div className="space-y-1.5">
                    <Label htmlFor="dn_price">{isAr ? "سعر شراء الوحدة (بدون ضريبة) *" : "Unit Price (ex VAT) *"}</Label>
                    <Input
                      id="dn_price"
                      type="number"
                      min="0"
                      step="any"
                      value={unitPriceExVat || ""}
                      onChange={(e) => setUnitPriceExVat(Number(e.target.value))}
                      placeholder="0.00"
                      className="h-9 font-mono"
                    />
                  </div>

                  {/* Defect Reason */}
                  <div className="space-y-1.5">
                    <Label htmlFor="dn_reason">{isAr ? "سبب الإرجاع وملاحظات العيب" : "Defect Reason"}</Label>
                    <Input
                      id="dn_reason"
                      value={defectReason}
                      onChange={(e) => setDefectReason(e.target.value)}
                      placeholder={isAr ? "ترسيب، اختلاف تركيز، كسر أغطية..." : "Defective viscosity..."}
                      className="h-9"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Live Calculation Preview Card */}
            {claimedQty > 0 && unitPriceExVat > 0 && (
              <Card className="border-amber-200 bg-amber-50/30 shadow-sm">
                <CardHeader className="pb-3 border-b border-amber-100">
                  <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <ArrowLeftRight className="w-4 h-4 text-sky-600" />
                    <span>{isAr ? "المعالجة المحاسبية التلقائية وتوزيع المطالبة (SPEC Section 6.4)" : "Accounting & Stock Split:"}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-1">
                      <span className="text-slate-500 block font-medium">
                        {isAr ? "الجزء الفعلي المتبقي بالمستودع (يُخصم من المخزون 1131):" : "Physical Stock Deducted (1131):"}
                      </span>
                      <span className="text-base font-bold font-mono text-slate-900 block tabular-nums">
                        {physicalDeductionQty.toLocaleString("en-US")} {selectedItem?.base_unit === "gram" ? "جم" : "حبة"}
                      </span>
                      <span className="text-xs font-mono text-slate-500 block">
                        = {stockDeductedValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س
                      </span>
                    </div>

                    <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-1">
                      <span className="text-slate-500 block font-medium">
                        {isAr ? "الجزء المستهلك فعلياً (تعويض في 4201 دون مساس المخزون):" : "Consumed Defect Compensation (4201):"}
                      </span>
                      <span className="text-base font-bold font-mono text-emerald-700 block tabular-nums">
                        {consumedCompensationQty.toLocaleString("en-US")} {selectedItem?.base_unit === "gram" ? "جم" : "حبة"}
                      </span>
                      <span className="text-xs font-mono text-emerald-600 block">
                        = {consumedCompensationValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Side Column: Total & Submit */}
          <div className="space-y-6">
            <Card className="border-slate-200 shadow-sm sticky top-6">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-600" />
                  <span>{isAr ? "إجمالي المطالبة المالية" : "Total Claim"}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="p-4 bg-slate-900 text-white rounded-xl text-center space-y-1">
                  <span className="text-xs text-slate-400 block">
                    {isAr ? "كامل المبلغ المخصوم من ذمة المورد 2101 (شامل 15% ضريبة):" : "Total Deducted from Supplier (inc VAT):"}
                  </span>
                  <span className="text-2xl font-bold font-mono tabular-nums block text-amber-400">
                    {totalClaimedIncVat.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س
                  </span>
                </div>

                <div className="pt-2 space-y-2">
                  <Button
                    onClick={() => submitDebitNoteMutation.mutate()}
                    disabled={submitDebitNoteMutation.isPending || !supplierId || claimedQty <= 0}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white min-h-[46px] font-bold gap-2"
                  >
                    {submitDebitNoteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                    <span>{isAr ? "ترحيل إشعار المدين والقيد المزدوج" : "Post Debit Note"}</span>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setIsCreateOpen(false)}
                    className="w-full"
                  >
                    {isAr ? "إلغاء" : "Cancel"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  
  const getDebitNoteHtml = (dn: PurchaseReturn) => {
    const docTitle = `إشعار مدين للمورد - ${dn.return_number}`;
    const vat = Math.max(0, dn.total_claimed_inc_vat - (dn.stock_deducted_value + dn.consumed_compensation_value));
    return `
      <!DOCTYPE html>
      <html dir="${isAr ? "rtl" : "ltr"}" lang="${isAr ? "ar" : "en"}">
        <head>
          <meta charset="utf-8" />
          <title>${docTitle}</title>
          <style>
            @page { size: A4 portrait; margin: 12mm; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "IBM Plex Sans Arabic", sans-serif; color: #0f172a; background: #fff; margin: 0; padding: 0; font-size: 12px; }
            .header-grid { display: grid; grid-template-columns: 1fr auto 1fr; gap: 16px; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; }
            .badge { display: inline-block; padding: 4px 14px; background: #0f172a; color: #fff; font-weight: bold; font-size: 15px; border-radius: 4px; }
            .meta-card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px; background: #f8fafc; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { border: 1px solid #cbd5e1; background: #f1f5f9; padding: 8px; font-size: 11px; font-weight: bold; }
            td { border: 1px solid #cbd5e1; padding: 8px; font-size: 12px; }
            .tabular { font-family: monospace; font-variant-numeric: tabular-nums; }
            .totals-box { margin-top: 20px; margin-right: auto; width: 340px; border: 1px solid #cbd5e1; border-radius: 6px; background: #f8fafc; padding: 12px; font-size: 12px; }
            .totals-row { display: flex; justify-content: space-between; padding: 4px 0; }
            .totals-row.grand { border-top: 2px solid #0f172a; margin-top: 6px; padding-top: 8px; font-weight: bold; font-size: 14px; }
            .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 30px; margin-top: 40px; text-align: center; }
            .sig-box { border-top: 1px dashed #94a3b8; padding-top: 8px; font-size: 11px; }
          </style>
        </head>
        <body>
          <div class="header-grid">
            <div style="text-align: ${isAr ? "right" : "left"};">
              <div style="font-weight: bold; font-size: 15px;">مصنع الأسياح للمنتجات الكيميائية</div>
              <div style="font-size: 11px; color: #64748b;">سجل تجاري: 1010000000 | الرقم الضريبي: 300000000000003</div>
              <div style="font-size: 11px; color: #64748b;">إدارة المشتريات والمستودعات</div>
            </div>
            <div style="text-align: center;">
              <div class="badge">إشعار مدين للمورد (Debit Note)</div>
              <div style="font-size: 13px; font-family: monospace; font-weight: bold; margin-top: 4px;">${dn.return_number}</div>
            </div>
            <div style="text-align: ${isAr ? "left" : "right"}; direction: ltr;">
              <div style="font-weight: bold; font-size: 14px;">Al-Asyah Chemical Factory</div>
              <div style="font-size: 11px; color: #64748b;">Supplier Debit Note</div>
              <div style="font-size: 11px; color: #64748b;">Date: ${dn.return_date}</div>
            </div>
          </div>

          <div class="meta-card">
            <div><strong>المورد:</strong> <span>${dn.supplier?.name_ar || "-"}</span></div>
            <div><strong>رقم الإشعار:</strong> <span class="tabular font-bold">${dn.return_number}</span></div>
            <div><strong>تاريخ الإصدار:</strong> <span class="tabular">${dn.return_date}</span></div>
            <div><strong>سبب وملاحظات الإشعار:</strong> <span>${dn.notes || "مرتجع مواد خام / بضاعة غير مطابقة للمواصفات"}</span></div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 35px; text-align: center;">#</th>
                <th>البيان / الوصف</th>
                <th style="width: 110px; text-align: right;">المخصوم مخزنياً</th>
                <th style="width: 110px; text-align: right;">تعويض المستهلك</th>
                <th style="width: 130px; text-align: right;">الإجمالي شامل الضريبة</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="text-align: center;">1</td>
                <td><strong>مطالبة مرتجع مواد وتالف قبان لحساب المورد (${dn.supplier?.name_ar || "-"})</strong></td>
                <td class="tabular" style="text-align: right;">${dn.stock_deducted_value.toFixed(2)} ر.س</td>
                <td class="tabular" style="text-align: right;">${dn.consumed_compensation_value.toFixed(2)} ر.س</td>
                <td class="tabular font-bold" style="text-align: right;">${dn.total_claimed_inc_vat.toFixed(2)} ر.س</td>
              </tr>
            </tbody>
          </table>

          <div class="totals-box">
            <div class="totals-row">
              <span>المخصوم من المخزون (1131):</span>
              <span class="tabular">${dn.stock_deducted_value.toFixed(2)} ر.س</span>
            </div>
            <div class="totals-row">
              <span>تعويض المستهلك بالإنتاج (4201):</span>
              <span class="tabular">${dn.consumed_compensation_value.toFixed(2)} ر.س</span>
            </div>
            <div class="totals-row">
              <span>ضريبة القيمة المضافة المستردة (15%):</span>
              <span class="tabular">${vat.toFixed(2)} ر.س</span>
            </div>
            <div class="totals-row grand">
              <span>صافي المبلغ المخصوم من ذمة المورد (2101):</span>
              <span class="tabular">${dn.total_claimed_inc_vat.toFixed(2)} ر.س</span>
            </div>
          </div>

          <div class="signatures">
            <div class="sig-box">
              <div style="font-weight: bold; margin-bottom: 35px;">مسؤول المشتريات</div>
              <div>التوقيع: ............................</div>
            </div>
            <div class="sig-box">
              <div style="font-weight: bold; margin-bottom: 35px;">أمين المستودع</div>
              <div>التوقيع: ............................</div>
            </div>
            <div class="sig-box">
              <div style="font-weight: bold; margin-bottom: 35px;">اعتماد المدير المالي</div>
              <div>الختم والتوقيع: ............................</div>
            </div>
          </div>

          
        </body>
      </html>
    `;
  };

  const handlePrintDebitNote = (dn: PurchaseReturn) => {
    printDocumentHtml(getDebitNoteHtml(dn), `إشعار_مدين_${dn.return_number}`);
  };

  const handleSavePdfDebitNote = (dn: PurchaseReturn) => {
    saveDocumentPdfFromHtml(getDebitNoteHtml(dn), `إشعار_مدين_${dn.return_number}`);
  };

  const handleShareDebitNoteWhatsapp = (dn: PurchaseReturn) => {
    const text = encodeURIComponent(
      `*إشعار مدين للمورد (Debit Note) - مصنع الأسياح للكيماويات*\n` +
      `رقم الإشعار: ${dn.return_number}\n` +
      `المورد: ${dn.supplier?.name_ar || ''}\n` +
      `التاريخ: ${dn.return_date}\n` +
      `المخصوم مخزنياً: ${dn.stock_deducted_value.toFixed(2)} ر.س\n` +
      `إجمالي المطالبة شامل الضريبة: ${dn.total_claimed_inc_vat.toFixed(2)} ر.س\n` +
      `_إدارة المشتريات والمستودعات - مصنع الأسياح_`
    );
    shareDocumentWhatsApp(dn.supplier?.contact_phone, decodeURIComponent(text));
  };

  // In-Page Canvas View for Debit Note Details Inspection (Material Design 3)
  if (selectedReturn) {
    const vatAmount = selectedReturn.total_claimed_inc_vat - (selectedReturn.stock_deducted_value + selectedReturn.consumed_compensation_value);
    const handleShareWhatsapp = () => {
      const text = encodeURIComponent(
        `إشعار مدين للمورد (Debit Note)\n` +
        `رقم الإشعار: ${selectedReturn.return_number}\n` +
        `المورد: ${selectedReturn.supplier?.name_ar || ''}\n` +
        `تاريخ الإشعار: ${new Date(selectedReturn.return_date).toLocaleDateString("ar-SA")}\n` +
        `إجمالي المطالبة شامل الضريبة: ${selectedReturn.total_claimed_inc_vat.toLocaleString("en-US", { minimumFractionDigits: 2 })} ر.س\n` +
        `مصنع العاصية للمنتجات الكيميائية`
      );
      window.open(`https://wa.me/?text=${text}`, "_blank");
    };

    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* Top Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm print:hidden">
          <div className="flex items-center gap-3">
            <Button
              variant="tonal"
              size="sm"
              onClick={() => setSelectedReturn(null)}
              className="gap-1.5"
            >
              <ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
              <span>{isAr ? "العودة لسجل إشعارات المدين" : "Back to Debit Notes"}</span>
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold font-mono text-slate-900">
                  {selectedReturn.return_number}
                </h1>
                <Badge className="bg-emerald-600 text-white text-xs">
                  {isAr ? "إشعار مدين مرحّل" : "Posted Debit Note"}
                </Badge>
              </div>
              <p className="text-xs text-slate-500">
                {isAr ? "تفاصيل مطالبة المورد والأثر المخزني والمحاسبي المتكامل" : "Supplier claim details & integrated stock/accounting impact"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSavePdfDebitNote(selectedReturn)}
              className="gap-1.5"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              <span>{isAr ? "طباعة A4" : "Print A4"}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePrintDebitNote(selectedReturn)}
              className="gap-1.5"
            >
              <Download className="w-4 h-4 text-sky-600" />
              <span>{isAr ? "حفظ PDF" : "Save PDF"}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleShareDebitNoteWhatsapp(selectedReturn)}
              className="gap-1.5 text-emerald-700 hover:text-emerald-800"
            >
              <Share2 className="w-4 h-4 text-emerald-600" />
              <span>{isAr ? "مشاركة واتساب" : "WhatsApp"}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedReturn(null)}
            >
              {isAr ? "إغلاق" : "Close"}
            </Button>
          </div>
        </div>

        {/* Printable Document Container */}
        <div className="space-y-6">
          {/* Main Info Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-slate-200 shadow-sm md:col-span-2">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-800 flex items-center justify-between">
                  <span>{isAr ? "بيانات المورد والإشعار" : "Supplier & DN Information"}</span>
                  <span className="text-xs font-mono font-normal text-slate-500">
                    {new Date(selectedReturn.return_date).toLocaleDateString(isAr ? "ar-SA" : "en-US")}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-xs text-slate-500 block">{isAr ? "اسم المورد:" : "Supplier:"}</span>
                  <span className="font-bold text-slate-900 block">{selectedReturn.supplier?.name_ar}</span>
                  {selectedReturn.supplier?.name_en && (
                    <span className="text-xs text-slate-500 font-mono block">{selectedReturn.supplier?.name_en}</span>
                  )}
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">{isAr ? "الرقم الضريبي للمورد:" : "Supplier VAT #:"}</span>
                  <span className="font-mono text-slate-800 block">
                    {selectedReturn.supplier?.tax_number || (isAr ? "غير مسجل" : "N/A")}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">{isAr ? "تاريخ الإصدار والترحيل:" : "Posting Date:"}</span>
                  <span className="text-slate-800 font-mono block">
                    {new Date(selectedReturn.return_date).toLocaleDateString(isAr ? "ar-SA" : "en-US")}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">{isAr ? "الحالة المحاسبية:" : "Status:"}</span>
                  <span className="text-emerald-700 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isAr ? "قيد اليومية متوازن ومرحّل" : "Balanced & Posted"}</span>
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm bg-slate-900 text-white">
              <CardHeader className="pb-2 border-b border-slate-800">
                <CardTitle className="text-sm font-bold text-slate-200">
                  {isAr ? "صافي المطالبة المالية" : "Financial Claim Total"}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                <div>
                  <span className="text-xs text-slate-400 block">
                    {isAr ? "إجمالي المبلغ المخصوم من المورد:" : "Total Deducted (Inc VAT):"}
                  </span>
                  <span className="text-2xl font-bold font-mono text-amber-400 block tabular-nums">
                    {selectedReturn.total_claimed_inc_vat.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-800/80 space-y-1 text-xs">
                  <div className="flex justify-between text-slate-300">
                    <span>{isAr ? "خصم المخزون (1131):" : "Stock Part:"}</span>
                    <span className="font-mono">{selectedReturn.stock_deducted_value.toLocaleString("en-US", { minimumFractionDigits: 2 })} ر.س</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>{isAr ? "تعويض المستهلك (4201):" : "Compensation:"}</span>
                    <span className="font-mono">{selectedReturn.consumed_compensation_value.toLocaleString("en-US", { minimumFractionDigits: 2 })} ر.س</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>{isAr ? "ضريبة القيمة المضافة (15%):" : "VAT (15%):"}</span>
                    <span className="font-mono">{Math.max(0, vatAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })} ر.س</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Lines Table Card */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-800">
                {isAr ? "الأصناف المرتجعة والمطالب بها" : "Returned & Claimed Items"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="font-semibold">{isAr ? "الصنف" : "Item"}</TableHead>
                      <TableHead className="w-28 text-center font-semibold">{isAr ? "الكمية المطالب بها" : "Claimed Qty"}</TableHead>
                      <TableHead className="w-28 text-center font-semibold">{isAr ? "المخصوم مخزنياً" : "Deducted Stock"}</TableHead>
                      <TableHead className="w-28 text-center font-semibold">{isAr ? "تعويض استهلاك" : "Compensated Qty"}</TableHead>
                      <TableHead className="w-32 text-end font-semibold">{isAr ? "سعر الشراء (غير شامل)" : "Unit Price"}</TableHead>
                      <TableHead className="w-32 text-end font-semibold">{isAr ? "إجمالي المطالبة" : "Total Ex VAT"}</TableHead>
                      <TableHead className="font-semibold">{isAr ? "سبب العيب والملاحظات" : "Defect Reason"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedReturn.lines && selectedReturn.lines.length > 0 ? (
                      selectedReturn.lines.map((line) => (
                        <TableRow key={line.id}>
                          <TableCell>
                            <span className="font-medium text-slate-900 block">{line.item?.name_ar}</span>
                            <span className="text-xs font-mono text-slate-500 block">{line.item?.sku}</span>
                          </TableCell>
                          <TableCell className="text-center font-mono font-medium">
                            {line.claimed_qty.toLocaleString("en-US")} {line.item?.base_unit === "gram" ? "جم" : "حبة"}
                          </TableCell>
                          <TableCell className="text-center font-mono text-slate-700">
                            {line.remaining_in_stock_qty?.toLocaleString("en-US") || "0"}
                          </TableCell>
                          <TableCell className="text-center font-mono text-emerald-700 font-medium">
                            {line.consumed_qty?.toLocaleString("en-US") || "0"}
                          </TableCell>
                          <TableCell className="text-end font-mono">
                            {line.unit_price_ex_vat?.toLocaleString("en-US", { minimumFractionDigits: 2 })} ر.س
                          </TableCell>
                          <TableCell className="text-end font-mono font-bold text-slate-900">
                            {line.total_ex_vat?.toLocaleString("en-US", { minimumFractionDigits: 2 })} ر.س
                          </TableCell>
                          <TableCell className="text-xs text-slate-600">
                            {line.reason || (isAr ? "خامات معيبة / مطابقة المواصفات" : "Defective materials")}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-6 text-slate-500">
                          {isAr ? "لا توجد أسطر مفصلة" : "No item lines"}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Double-Entry Accounting Card (SPEC 6.4) */}
          <Card className="border-amber-200 bg-amber-50/20 shadow-sm">
            <CardHeader className="pb-3 border-b border-amber-100">
              <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <ArrowLeftRight className="w-4 h-4 text-sky-600" />
                <span>{isAr ? "الأثر المحاسبي المتوازن للإشعار المدين (قيد اليومية التلقائي)" : "Automated Double-Entry Journal Entry"}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden text-xs">
                <div className="grid grid-cols-12 bg-slate-100 p-2.5 font-semibold text-slate-700 border-b border-slate-200">
                  <div className="col-span-2">{isAr ? "رمز الحساب" : "Account Code"}</div>
                  <div className="col-span-6">{isAr ? "اسم الحساب / الشرح" : "Account Name / Memo"}</div>
                  <div className="col-span-2 text-end">{isAr ? "مدين (Debit)" : "Debit"}</div>
                  <div className="col-span-2 text-end">{isAr ? "دائن (Credit)" : "Credit"}</div>
                </div>

                {/* Line 1: 2101 Supplier Payable Debit */}
                <div className="grid grid-cols-12 p-2.5 border-b border-slate-100 items-center">
                  <div className="col-span-2 font-mono font-bold text-slate-800">2101</div>
                  <div className="col-span-6">
                    <span className="font-semibold text-slate-900 block">{isAr ? "ذمم الموردين (حساب المورد)" : "Accounts Payable"}</span>
                    <span className="text-slate-500 text-[11px] block">{isAr ? "خصم كامل قيمة المطالبة شاملة الضريبة" : "Full claim deduction inc VAT"}</span>
                  </div>
                  <div className="col-span-2 text-end font-mono font-bold text-sky-700">
                    {selectedReturn.total_claimed_inc_vat.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س
                  </div>
                  <div className="col-span-2 text-end font-mono text-slate-400">-</div>
                </div>

                {/* Line 2: 1131 Raw Materials Stock Credit */}
                <div className="grid grid-cols-12 p-2.5 border-b border-slate-100 items-center bg-slate-50/50">
                  <div className="col-span-2 font-mono font-bold text-slate-800">1131</div>
                  <div className="col-span-6">
                    <span className="font-semibold text-slate-900 block">{isAr ? "مخزون الخامات ومواد التعبئة" : "Raw Materials Inventory"}</span>
                    <span className="text-slate-500 text-[11px] block">{isAr ? "تخفيض تكلفة الكمية المرتجعة فعلياً من المستودع" : "Physical stock return reduction"}</span>
                  </div>
                  <div className="col-span-2 text-end font-mono text-slate-400">-</div>
                  <div className="col-span-2 text-end font-mono font-bold text-slate-900">
                    {selectedReturn.stock_deducted_value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س
                  </div>
                </div>

                {/* Line 3: 4201 Defect Compensation Revenue Credit */}
                {selectedReturn.consumed_compensation_value > 0 && (
                  <div className="grid grid-cols-12 p-2.5 border-b border-slate-100 items-center">
                    <div className="col-span-2 font-mono font-bold text-slate-800">4201</div>
                    <div className="col-span-6">
                      <span className="font-semibold text-emerald-800 block">{isAr ? "إيرادات تعويض عيوب خامات الموردين" : "Supplier Defect Compensation Revenue"}</span>
                      <span className="text-slate-500 text-[11px] block">{isAr ? "إثبات تعويض الجزء المستهلك بالإنتاج دون لمس المخزون" : "Consumed batch compensation without touching stock"}</span>
                    </div>
                    <div className="col-span-2 text-end font-mono text-slate-400">-</div>
                    <div className="col-span-2 text-end font-mono font-bold text-emerald-700">
                      {selectedReturn.consumed_compensation_value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س
                    </div>
                  </div>
                )}

                {/* Line 4: 2110 Input VAT Recoverable Credit */}
                <div className="grid grid-cols-12 p-2.5 items-center bg-slate-50/50">
                  <div className="col-span-2 font-mono font-bold text-slate-800">2110</div>
                  <div className="col-span-6">
                    <span className="font-semibold text-slate-900 block">{isAr ? "ضريبة القيمة المضافة المستردة (مدخلات)" : "Recoverable Input VAT"}</span>
                    <span className="text-slate-500 text-[11px] block">{isAr ? "تسوية الضريبة المستردة بنسبة 15%" : "15% Input VAT reversal"}</span>
                  </div>
                  <div className="col-span-2 text-end font-mono text-slate-400">-</div>
                  <div className="col-span-2 text-end font-mono font-bold text-slate-900">
                    {Math.max(0, vatAmount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {isAr ? "إشعارات المدين للموردين (المرتجع المدمج مع التعويض)" : "Debit Notes & Defect Compensation (DN)"}
          </h1>
          <p className="text-sm text-slate-500">
            {isAr
              ? "إرجاع الخامات المعيبة مع مطالبة المورد بكامل القيمة والضريبة، وفصل المتبقي مخزنياً عن تعويض الجزء المستهلك (4201)"
              : "Integrated debit note claiming full amount & VAT while splitting physical stock from defect compensation (4201)"}
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="bg-slate-900 text-white gap-2">
          <Plus className="w-4 h-4" />
          <span>{isAr ? "إصدار إشعار مدين جديد" : "New Debit Note"}</span>
        </Button>
      </div>

      {/* Info Banner */}
      <Card className="border-amber-200 bg-amber-50/50">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900 space-y-1">
            <p className="font-semibold">
              {isAr ? "المعيار الهندسي للإشعار المدين المدمج (SPEC.md Section 6.4):" : "Integrated Debit Note Standard:"}
            </p>
            <p className="text-amber-800 text-xs leading-relaxed">
              {isAr
                ? "إذا كانت الخامة معيبة وتم استهلاك جزء منها في الإنتاج، يتيح لك النظام مطالبة المورد بكامل الكمية. يتم خصم الجزء الموجود بالمخزن من طبقة الـ FIFO ومن حساب 1131، أما الجزء المستهلك فلا يمس المخزون بل يُقيد كإيراد تعويض في حساب 4201، ويُخصم كامل المبلغ + الضريبة من حساب المورد 2101 في قيد واحد متوازن."
                : "Allows claiming full batch value even if partially consumed: unconsumed part reduces stock (1131), consumed part records supplier defect compensation (4201), with total deducted from supplier payable (2101)."}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder={isAr ? "بحث برقم الإشعار أو المورد..." : "Search debit notes..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ps-9"
            />
          </div>
          <div className="text-xs text-slate-500 font-medium">
            {isAr ? `إجمالي الإشعارات: ${returns.length}` : `Total: ${returns.length}`}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            {isAr ? "سجل إشعارات المدين" : "Debit Notes Register"}
          </CardTitle>
          <CardDescription>
            {isAr ? "مطالبات الموردين والتعويضات المقيدة" : "Posted debit notes & compensation entries"}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="w-36 font-semibold">{isAr ? "رقم الإشعار" : "DN Number"}</TableHead>
                  <TableHead className="font-semibold">{isAr ? "المورد" : "Supplier"}</TableHead>
                  <TableHead className="w-32 font-semibold">{isAr ? "التاريخ" : "Date"}</TableHead>
                  <TableHead className="w-36 text-end font-semibold">{isAr ? "المخصوم مخزنياً (1131)" : "Stock Value"}</TableHead>
                  <TableHead className="w-36 text-end font-semibold">{isAr ? "تعويض المستهلك (4201)" : "Compensation"}</TableHead>
                  <TableHead className="w-36 text-end font-semibold">{isAr ? "إجمالي المطالبة شامل الضريبة" : "Total Claim (inc VAT)"}</TableHead>
                  <TableHead className="w-24 text-center font-semibold">{isAr ? "الحالة" : "Status"}</TableHead>
                  <TableHead className="w-36 text-center font-semibold">{isAr ? "الإجراءات" : "Actions"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24 ms-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24 ms-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-28 ms-auto" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-16 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-12 mx-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredReturns.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10 text-slate-500">
                      {isAr ? "لا توجد إشعارات مدين مسجلة" : "No debit notes found"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredReturns.map((dn) => (
                    <TableRow key={dn.id} className="hover:bg-slate-50/80">
                      <TableCell className="font-mono font-medium text-slate-900 tabular-nums">
                        {dn.return_number}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-slate-900 block">{dn.supplier?.name_ar}</span>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {new Date(dn.return_date).toLocaleDateString(isAr ? "ar-SA" : "en-US")}
                      </TableCell>
                      <TableCell className="text-end font-mono text-xs tabular-nums text-slate-700">
                        {dn.stock_deducted_value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س
                      </TableCell>
                      <TableCell className="text-end font-mono text-xs tabular-nums text-emerald-700 font-medium">
                        {dn.consumed_compensation_value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س
                      </TableCell>
                      <TableCell className="text-end font-mono font-bold tabular-nums text-slate-900">
                        {dn.total_claimed_inc_vat.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className="bg-emerald-600 text-white gap-1 text-xs">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{isAr ? "مرحّل" : "Posted"}</span>
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedReturn(dn)}
                            className="h-7 w-7 p-0 text-slate-500 hover:text-slate-900"
                            title={isAr ? "معاينة إشعار المدين" : "View"}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSavePdfDebitNote(dn)}
                            className="h-7 w-7 p-0 text-slate-600 hover:bg-slate-100"
                            title={isAr ? "طباعة A4" : "Print A4"}
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handlePrintDebitNote(dn)}
                            className="h-7 w-7 p-0 text-sky-700 hover:bg-sky-50"
                            title={isAr ? "حفظ PDF" : "Save PDF"}
                          >
                            <Download className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleShareDebitNoteWhatsapp(dn)}
                            className="h-7 w-7 p-0 text-emerald-600 hover:bg-emerald-50"
                            title={isAr ? "مشاركة واتساب" : "WhatsApp"}
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create Debit Note Dialog */}
    </div>
  );
}
