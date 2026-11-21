import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { PurchaseOrder, Supplier, Item, Warehouse, PurchaseOrderStatus } from "@/types/database";
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
  Plus, 
  ShoppingCart, 
  Search, 
  CheckCircle, 
  XCircle, 
  Trash2, 
  Loader2, 
  Eye, 
  Clock,
  Send
} from "lucide-react";

interface NewPoLine {
  item_id: string;
  ordered_qty: number;
  unit_price_ex_vat: number;
  notes: string;
}

export function PurchaseOrdersPage() {
  const { i18n } = useTranslation();
  const { profile, isOwner, isAccountant } = useAuth();
  const queryClient = useQueryClient();
  const isAr = i18n.language === "ar";

  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedPo, setSelectedPo] = useState<PurchaseOrder | null>(null);

  // New PO State
  const [supplierId, setSupplierId] = useState("");
  const [targetWarehouseId, setTargetWarehouseId] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<NewPoLine[]>([
    { item_id: "", ordered_qty: 0, unit_price_ex_vat: 0, notes: "" },
  ]);

  // 1. Fetch POs
  const { data: purchaseOrders = [], isLoading } = useQuery<PurchaseOrder[]>({
    queryKey: ["purchase_orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select(`
          *,
          supplier:suppliers(name_ar, name_en, tax_number),
          target_warehouse:warehouses(name_ar, name_en),
          creator:users_profile!purchase_orders_created_by_fkey(full_name),
          lines:purchase_order_lines(
            id, item_id, ordered_qty, received_qty, unit_price_ex_vat, vat_amount, total_inc_vat,
            item:items(sku, name_ar, name_en, base_unit)
          )
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as PurchaseOrder[];
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

  // 4. Fetch Warehouses
  const { data: warehouses = [] } = useQuery<Warehouse[]>({
    queryKey: ["warehouses_active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouses").select("*").eq("is_active", true);
      if (error) throw error;
      return data as Warehouse[];
    },
  });

  const addLine = () => {
    setLines([...lines, { item_id: "", ordered_qty: 0, unit_price_ex_vat: 0, notes: "" }]);
  };

  const removeLine = (index: number) => {
    if (lines.length > 1) {
      setLines(lines.filter((_, i) => i !== index));
    }
  };

  const updateLine = (index: number, field: keyof NewPoLine, value: any) => {
    const updated = [...lines];
    updated[index] = { ...updated[index], [field]: value };
    setLines(updated);
  };

  // Calculations for New PO
  const subtotal = lines.reduce((sum, l) => sum + (Number(l.ordered_qty) || 0) * (Number(l.unit_price_ex_vat) || 0), 0);
  const vatAmount = subtotal * 0.15;
  const totalAmount = subtotal + vatAmount;

  // Create PO Mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!supplierId) throw new Error("يرجى اختيار المورد");
      if (lines.length === 0 || lines.some((l) => !l.item_id || l.ordered_qty <= 0)) {
        throw new Error("يرجى التأكد من اختيار الصنف وإدخال كمية صحيحة لجميع البنود");
      }

      const poNumber = `PO-${new Date().toISOString().slice(0, 7).replace("-", "")}-${Math.floor(1000 + Math.random() * 9000)}`;

      // 1. Insert Header
      const { data: poHeader, error: poErr } = await supabase
        .from("purchase_orders")
        .insert([
          {
            po_number: poNumber,
            supplier_id: supplierId,
            target_warehouse_id: targetWarehouseId || null,
            expected_delivery_date: deliveryDate || null,
            status: "pending_approval",
            subtotal,
            tax_amount: vatAmount,
            total_amount: totalAmount,
            created_by: profile?.id,
            notes,
          },
        ])
        .select()
        .single();

      if (poErr) throw poErr;

      // 2. Insert Lines
      const lineRows = lines.map((l) => {
        const lineSub = Number(l.ordered_qty) * Number(l.unit_price_ex_vat);
        const lineVat = lineSub * 0.15;
        return {
          purchase_order_id: poHeader.id,
          item_id: l.item_id,
          ordered_qty: Number(l.ordered_qty),
          unit_price_ex_vat: Number(l.unit_price_ex_vat),
          vat_rate: 15.0,
          vat_amount: lineVat,
          total_ex_vat: lineSub,
          total_inc_vat: lineSub + lineVat,
          notes: l.notes || null,
        };
      });

      const { error: linesErr } = await supabase.from("purchase_order_lines").insert(lineRows);
      if (linesErr) throw linesErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase_orders"] });
      toast.success(isAr ? "تم إنشاء أمر الشراء وإرساله للاعتماد" : "Purchase order created successfully");
      setIsCreateOpen(false);
      setSupplierId("");
      setLines([{ item_id: "", ordered_qty: 0, unit_price_ex_vat: 0, notes: "" }]);
      setNotes("");
    },
    onError: (err: any) => {
      toast.error(err.message || "حدث خطأ أثناء إنشاء أمر الشراء");
    },
  });

  // Approve / Reject PO Mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, reason }: { id: string; status: PurchaseOrderStatus; reason?: string }) => {
      const { error } = await supabase
        .from("purchase_orders")
        .update({
          status,
          approved_by: profile?.id,
          approved_at: status === "approved" ? new Date().toISOString() : null,
          rejection_reason: reason || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["purchase_orders"] });
      toast.success(
        vars.status === "approved"
          ? isAr ? "تم اعتماد أمر الشراء بنجاح" : "Purchase order approved"
          : isAr ? "تم رفض أمر الشراء" : "Purchase order rejected"
      );
      setSelectedPo(null);
    },
    onError: (err: any) => {
      toast.error(err.message || "فشل تحديث حالة أمر الشراء");
    },
  });

  const getStatusBadge = (status: PurchaseOrderStatus) => {
    switch (status) {
      case "draft":
        return <Badge variant="outline" className="text-slate-500">مسودة</Badge>;
      case "pending_approval":
        return <Badge className="bg-amber-500 text-white gap-1"><Clock className="w-3 h-3" /> بانتظار الاعتماد</Badge>;
      case "approved":
        return <Badge className="bg-emerald-600 text-white gap-1"><CheckCircle className="w-3 h-3" /> معتمد</Badge>;
      case "rejected":
        return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" /> مرفوض</Badge>;
      case "partially_received":
        return <Badge className="bg-sky-600 text-white">مستلم جزئياً</Badge>;
      case "completed":
        return <Badge className="bg-slate-900 text-white">مكتمل بالكامل</Badge>;
      case "cancelled":
        return <Badge variant="outline" className="text-rose-500">ملغي</Badge>;
      default:
        return null;
    }
  };

  const filteredOrders = purchaseOrders.filter((po) => {
    const q = searchQuery.toLowerCase();
    return (
      po.po_number.toLowerCase().includes(q) ||
      po.supplier?.name_ar.toLowerCase().includes(q) ||
      (po.supplier?.name_en && po.supplier.name_en.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {isAr ? "أوامر الشراء والتوريد" : "Purchase Orders (PO)"}
          </h1>
          <p className="text-sm text-slate-500">
            {isAr
              ? "إنشاء طلبات الشراء، دورة الاعتمادات، واحتساب ضريبة القيمة المضافة 15% تمهيداً للاستلام الفعلي"
              : "Manage purchase orders, approval workflows, and 15% VAT calculation before goods receipt"}
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="bg-slate-900 text-white gap-2">
          <Plus className="w-4 h-4" />
          <span>{isAr ? "إنشاء أمر شراء جديد" : "New Purchase Order"}</span>
        </Button>
      </div>

      {/* Search and Counts */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder={isAr ? "بحث برقم الأمر أو اسم المورد..." : "Search by PO# or supplier..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ps-9"
            />
          </div>
          <div className="text-xs text-slate-500 font-medium">
            {isAr ? `إجمالي الأوامر: ${purchaseOrders.length}` : `Total POs: ${purchaseOrders.length}`}
          </div>
        </CardContent>
      </Card>

      {/* PO Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            {isAr ? "سجل أوامر الشراء" : "Purchase Orders Register"}
          </CardTitle>
          <CardDescription>
            {isAr ? "متابعة دورة الموافقات والاستلام للمشتريات" : "Track approval status and receipts"}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="w-36 font-semibold">{isAr ? "رقم الأمر" : "PO Number"}</TableHead>
                  <TableHead className="font-semibold">{isAr ? "المورد" : "Supplier"}</TableHead>
                  <TableHead className="w-32 font-semibold">{isAr ? "تاريخ الأمر" : "Date"}</TableHead>
                  <TableHead className="w-40 font-semibold">{isAr ? "المستودع المستهدف" : "Target Warehouse"}</TableHead>
                  <TableHead className="w-36 text-end font-semibold">{isAr ? "الإجمالي شامل الضريبة" : "Total (inc VAT)"}</TableHead>
                  <TableHead className="w-36 text-center font-semibold">{isAr ? "الحالة" : "Status"}</TableHead>
                  <TableHead className="w-24 text-center font-semibold">{isAr ? "معاينة" : "View"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-28 ms-auto" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-24 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-12 mx-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-slate-500">
                      {isAr ? "لا توجد أوامر شراء مسجلة" : "No purchase orders found"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOrders.map((po) => (
                    <TableRow key={po.id} className="hover:bg-slate-50/80">
                      <TableCell className="font-mono font-medium text-slate-900 tabular-nums">
                        {po.po_number}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-slate-900 block">
                          {isAr ? po.supplier?.name_ar : po.supplier?.name_en || po.supplier?.name_ar}
                        </span>
                        {po.supplier?.tax_number && (
                          <span className="text-xs font-mono text-slate-400 block tabular-nums">
                            {po.supplier.tax_number}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {new Date(po.order_date).toLocaleDateString(isAr ? "ar-SA" : "en-US")}
                      </TableCell>
                      <TableCell className="text-sm text-slate-700">
                        {po.target_warehouse?.name_ar || "-"}
                      </TableCell>
                      <TableCell className="text-end font-mono font-bold text-slate-900 tabular-nums">
                        {po.total_amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س
                      </TableCell>
                      <TableCell className="text-center">
                        {getStatusBadge(po.status)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedPo(po)}
                          className="gap-1 text-xs text-sky-700"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>{isAr ? "تفاصيل" : "View"}</span>
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

      {/* Create Purchase Order Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-sky-600" />
              <span>{isAr ? "إنشاء أمر شراء وتوريد جديد" : "Create Purchase Order"}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 pt-2">
            {/* Header Form */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div className="space-y-1.5">
                <Label htmlFor="supplier_select">{isAr ? "المورد *" : "Supplier *"}</Label>
                <select
                  id="supplier_select"
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

              <div className="space-y-1.5">
                <Label htmlFor="target_wh">{isAr ? "المستودع المستهدف" : "Target Warehouse"}</Label>
                <select
                  id="target_wh"
                  value={targetWarehouseId}
                  onChange={(e) => setTargetWarehouseId(e.target.value)}
                  className="w-full h-9 rounded border border-slate-200 bg-white px-2 text-sm focus:ring-1 focus:ring-slate-900"
                >
                  <option value="">{isAr ? "-- اختر المستودع --" : "-- Select Warehouse --"}</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name_ar}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="del_date">{isAr ? "تاريخ التوريد المتوقع" : "Expected Delivery Date"}</Label>
                <Input
                  id="del_date"
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>

            {/* Lines Grid */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">{isAr ? "بنود أمر الشراء" : "Order Items"}</Label>
                <Button type="button" size="sm" variant="outline" onClick={addLine} className="gap-1.5 text-xs">
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isAr ? "إضافة بند" : "Add Line"}</span>
                </Button>
              </div>

              <div className="border border-slate-200 rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 text-xs">
                      <TableHead className="font-semibold">{isAr ? "الصنف *" : "Item *"}</TableHead>
                      <TableHead className="w-36 text-end font-semibold">{isAr ? "الكمية المطلوبة *" : "Qty *"}</TableHead>
                      <TableHead className="w-36 text-end font-semibold">{isAr ? "سعر الوحدة (بدون ضريبة)" : "Unit Price (ex VAT)"}</TableHead>
                      <TableHead className="w-32 text-end font-semibold">{isAr ? "الإجمالي" : "Total (ex VAT)"}</TableHead>
                      <TableHead className="w-12 text-center"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line, idx) => {
                      const selectedItem = items.find((i) => i.id === line.item_id);
                      const lineTotal = (Number(line.ordered_qty) || 0) * (Number(line.unit_price_ex_vat) || 0);

                      return (
                        <TableRow key={idx}>
                          <TableCell>
                            <select
                              value={line.item_id}
                              onChange={(e) => updateLine(idx, "item_id", e.target.value)}
                              className="w-full text-xs h-8 rounded border border-slate-200 bg-white px-2 focus:ring-1 focus:ring-slate-900"
                            >
                              <option value="">{isAr ? "-- اختر الصنف --" : "-- Select Item --"}</option>
                              {items.map((it) => (
                                <option key={it.id} value={it.id}>
                                  {it.sku} - {it.name_ar} ({it.base_unit === "gram" ? "جرام" : "حبة"})
                                </option>
                              ))}
                            </select>
                            {selectedItem && (
                              <span className="text-[10px] text-slate-400 block mt-0.5">
                                {isAr ? "الوحدة: " : "Unit: "}{selectedItem.base_unit === "gram" ? "جرام (1 لتر = 1000 جم)" : "حبة"}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-end">
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              value={line.ordered_qty || ""}
                              onChange={(e) => updateLine(idx, "ordered_qty", e.target.value)}
                              className="h-8 text-xs text-end font-mono"
                              placeholder="0"
                            />
                          </TableCell>
                          <TableCell className="text-end">
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              value={line.unit_price_ex_vat || ""}
                              onChange={(e) => updateLine(idx, "unit_price_ex_vat", e.target.value)}
                              className="h-8 text-xs text-end font-mono"
                              placeholder="0.00"
                            />
                          </TableCell>
                          <TableCell className="text-end font-mono text-sm font-semibold tabular-nums text-slate-900">
                            {lineTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeLine(idx)}
                              disabled={lines.length === 1}
                              className="text-rose-500 hover:text-rose-700 h-8 w-8 p-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Totals Summary */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-50 p-4 rounded-lg border border-slate-200 gap-4">
              <div className="w-full sm:w-1/2 space-y-1.5">
                <Label htmlFor="po_notes">{isAr ? "ملاحظات أمر الشراء" : "Notes"}</Label>
                <Input
                  id="po_notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={isAr ? "شروط التسليم، مواصفات التعبئة..." : "Delivery terms..."}
                  className="h-8 text-xs bg-white"
                />
              </div>

              <div className="w-full sm:w-64 space-y-1.5 text-sm font-mono text-end">
                <div className="flex justify-between text-slate-600">
                  <span>{isAr ? "المجموع قبل الضريبة:" : "Subtotal:"}</span>
                  <span className="tabular-nums">{subtotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>{isAr ? "ضريبة القيمة المضافة (15%):" : "VAT (15%):"}</span>
                  <span className="tabular-nums">{vatAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س</span>
                </div>
                <div className="flex justify-between text-base font-bold text-slate-900 border-t border-slate-200 pt-1">
                  <span>{isAr ? "الإجمالي النهائي:" : "Grand Total:"}</span>
                  <span className="tabular-nums">{totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س</span>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-slate-100">
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !supplierId || totalAmount <= 0}
              className="bg-slate-900 text-white gap-2"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span>{isAr ? "إرسال أمر الشراء للاعتماد" : "Submit for Approval"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View PO Details and Approval Dialog */}
      <Dialog open={!!selectedPo} onOpenChange={(open) => !open && setSelectedPo(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="font-mono text-slate-900">{selectedPo?.po_number}</span>
              {selectedPo && getStatusBadge(selectedPo.status)}
            </DialogTitle>
          </DialogHeader>

          {selectedPo && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50 p-3 rounded text-xs">
                <div>
                  <span className="text-slate-400 block">{isAr ? "المورد:" : "Supplier:"}</span>
                  <span className="font-semibold text-slate-900 block">{selectedPo.supplier?.name_ar}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">{isAr ? "الرقم الضريبي:" : "Tax Number:"}</span>
                  <span className="font-mono text-slate-900 block tabular-nums">{selectedPo.supplier?.tax_number || "-"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">{isAr ? "تاريخ الطلب:" : "Order Date:"}</span>
                  <span className="text-slate-900 block">{new Date(selectedPo.order_date).toLocaleDateString(isAr ? "ar-SA" : "en-US")}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">{isAr ? "المستودع:" : "Warehouse:"}</span>
                  <span className="text-slate-900 block">{selectedPo.target_warehouse?.name_ar || "-"}</span>
                </div>
              </div>

              {/* Lines */}
              <div className="border border-slate-200 rounded overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 text-xs">
                      <TableHead>{isAr ? "الصنف" : "Item"}</TableHead>
                      <TableHead className="text-end">{isAr ? "الكمية المطلوبة" : "Ordered Qty"}</TableHead>
                      <TableHead className="text-end">{isAr ? "سعر الوحدة" : "Unit Price"}</TableHead>
                      <TableHead className="text-end">{isAr ? "الإجمالي شامل الضريبة" : "Total (inc VAT)"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedPo.lines?.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>
                          <span className="font-medium text-slate-900 block text-xs">
                            {line.item?.sku} - {isAr ? line.item?.name_ar : line.item?.name_en}
                          </span>
                        </TableCell>
                        <TableCell className="text-end font-mono tabular-nums text-xs">
                          {line.ordered_qty.toLocaleString("en-US")} {line.item?.base_unit === "gram" ? "جم" : "حبة"}
                        </TableCell>
                        <TableCell className="text-end font-mono tabular-nums text-xs">
                          {line.unit_price_ex_vat.toFixed(4)} ر.س
                        </TableCell>
                        <TableCell className="text-end font-mono font-semibold tabular-nums text-xs text-slate-900">
                          {line.total_inc_vat.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Total Card */}
              <div className="flex justify-between items-center p-3 bg-slate-900 text-white rounded">
                <span className="text-sm font-medium">{isAr ? "إجمالي أمر الشراء النهائي (شامل 15% ضريبة):" : "Grand Total (inc 15% VAT):"}</span>
                <span className="text-lg font-bold font-mono tabular-nums">
                  {selectedPo.total_amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س
                </span>
              </div>
            </div>
          )}

          <DialogFooter className="pt-4 border-t border-slate-100 flex items-center justify-between">
            <Button variant="outline" onClick={() => setSelectedPo(null)}>
              {isAr ? "إغلاق" : "Close"}
            </Button>

            {/* Approval Buttons for Owner or Accountant */}
            {(isOwner || isAccountant) && selectedPo?.status === "pending_approval" && (
              <div className="flex items-center gap-2">
                <Button
                  variant="destructive"
                  onClick={() => updateStatusMutation.mutate({ id: selectedPo.id, status: "rejected", reason: "تم الرفض بواسطة الإدارة" })}
                  disabled={updateStatusMutation.isPending}
                  className="gap-1.5"
                >
                  <XCircle className="w-4 h-4" />
                  <span>{isAr ? "رفض الأمر" : "Reject"}</span>
                </Button>

                <Button
                  onClick={() => updateStatusMutation.mutate({ id: selectedPo.id, status: "approved" })}
                  disabled={updateStatusMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>{isAr ? "اعتماد أمر الشراء" : "Approve PO"}</span>
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
