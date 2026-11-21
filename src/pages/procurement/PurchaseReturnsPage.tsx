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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
  Eye
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
                  <TableHead className="w-20 text-center font-semibold">{isAr ? "معاينة" : "View"}</TableHead>
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
                        <Button variant="ghost" size="sm" onClick={() => setSelectedReturn(dn)} className="text-xs text-sky-700">
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
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
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-amber-600" />
              <span>{isAr ? "إصدار إشعار مدين مدمج للمورد (Debit Note)" : "Issue Integrated Debit Note"}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 pt-2">
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

            {/* Live Calculation Preview Card */}
            {claimedQty > 0 && unitPriceExVat > 0 && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <ArrowLeftRight className="w-4 h-4 text-sky-600" />
                  <span>{isAr ? "المعالجة المحاسبية التلقائية وتوزيع المطالبة:" : "Accounting & Stock Split:"}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-white border border-slate-200 rounded">
                    <span className="text-slate-500 block">{isAr ? "الجزء الفعلي المتبقي بالمستودع (يُخصم من المخزون 1131):" : "Physical Stock Deducted (1131):"}</span>
                    <span className="text-sm font-bold font-mono text-slate-900 block mt-1 tabular-nums">
                      {physicalDeductionQty.toLocaleString("en-US")} {selectedItem?.base_unit === "gram" ? "جم" : "حبة"}
                      {" = "}
                      {stockDeductedValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س
                    </span>
                  </div>

                  <div className="p-3 bg-white border border-slate-200 rounded">
                    <span className="text-slate-500 block">{isAr ? "الجزء المستهلك فعلياً (تعويض في 4201 دون مساس المخزون):" : "Consumed Defect Compensation (4201):"}</span>
                    <span className="text-sm font-bold font-mono text-emerald-700 block mt-1 tabular-nums">
                      {consumedCompensationQty.toLocaleString("en-US")} {selectedItem?.base_unit === "gram" ? "جم" : "حبة"}
                      {" = "}
                      {consumedCompensationValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س
                    </span>
                  </div>
                </div>

                {/* Final Claim */}
                <div className="flex justify-between items-center p-3 bg-slate-900 text-white rounded text-xs font-mono">
                  <span>{isAr ? "كامل المبلغ المخصوم من ذمة المورد 2101 (شامل 15% ضريبة):" : "Total Deducted from Supplier (inc VAT):"}</span>
                  <span className="text-base font-bold tabular-nums">
                    {totalClaimedIncVat.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س
                  </span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="pt-4 border-t border-slate-100">
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              onClick={() => submitDebitNoteMutation.mutate()}
              disabled={submitDebitNoteMutation.isPending || !supplierId || claimedQty <= 0}
              className="bg-slate-900 text-white gap-2"
            >
              {submitDebitNoteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              <span>{isAr ? "ترحيل إشعار المدين والقيد المزدوج" : "Post Debit Note"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
