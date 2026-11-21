import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { PurchaseReceipt, PurchaseOrder, Supplier, Item, Warehouse } from "@/types/database";
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
  Truck, 
  Scale, 
  Search, 
  CheckCircle2, 
  Loader2, 
  Layers, 
  FileCheck2, 
  Calendar,
  Eye
} from "lucide-react";

interface ReceiptLineItem {
  item_id: string;
  weight_kg: number;
  received_qty: number;
  unit_cost_ex_vat: number;
  batch_number: string;
  production_date: string;
  expiry_date: string;
  notes: string;
}

export function PurchaseReceiptsPage() {
  const { i18n } = useTranslation();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const isAr = i18n.language === "ar";

  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<PurchaseReceipt | null>(null);

  // New Receipt Form State
  const [poId, setPoId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [supplierDnNumber, setSupplierDnNumber] = useState("");
  const [freightCost, setFreightCost] = useState(0);
  const [notes, setNotes] = useState("");
  const [receiptLines, setReceiptLines] = useState<ReceiptLineItem[]>([
    {
      item_id: "",
      weight_kg: 0,
      received_qty: 0,
      unit_cost_ex_vat: 0,
      batch_number: `BATCH-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-01`,
      production_date: new Date().toISOString().slice(0, 10),
      expiry_date: new Date(Date.now() + 365 * 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      notes: "",
    },
  ]);

  // 1. Fetch Receipts
  const { data: receipts = [], isLoading } = useQuery<PurchaseReceipt[]>({
    queryKey: ["purchase_receipts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_receipts")
        .select(`
          *,
          supplier:suppliers(name_ar, name_en, tax_number),
          warehouse:warehouses(name_ar, name_en),
          receiver:users_profile!purchase_receipts_received_by_fkey(full_name),
          lines:purchase_receipt_lines(
            id, item_id, weight_kg, received_qty, unit_cost_ex_vat, batch_number, expiry_date,
            item:items(sku, name_ar, name_en, base_unit)
          )
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as PurchaseReceipt[];
    },
  });

  // 2. Fetch Approved POs
  const { data: approvedPos = [] } = useQuery<PurchaseOrder[]>({
    queryKey: ["approved_pos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select(`
          *,
          supplier:suppliers(id, name_ar, name_en),
          lines:purchase_order_lines(
            id, item_id, ordered_qty, received_qty, unit_price_ex_vat,
            item:items(sku, name_ar, name_en, base_unit, default_warehouse_id)
          )
        `)
        .in("status", ["approved", "partially_received"]);
      if (error) throw error;
      return data as PurchaseOrder[];
    },
  });

  // 3. Fetch Suppliers & Items & Warehouses
  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["suppliers_active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").eq("is_active", true);
      if (error) throw error;
      return data as Supplier[];
    },
  });

  const { data: items = [] } = useQuery<Item[]>({
    queryKey: ["items_active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("items").select("*").eq("is_active", true);
      if (error) throw error;
      return data as Item[];
    },
  });

  const { data: warehouses = [] } = useQuery<Warehouse[]>({
    queryKey: ["warehouses_active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouses").select("*").eq("is_active", true);
      if (error) throw error;
      return data as Warehouse[];
    },
  });

  // Auto-populate when PO is selected
  const handlePoSelect = (selectedPoId: string) => {
    setPoId(selectedPoId);
    if (!selectedPoId) return;

    const po = approvedPos.find((p) => p.id === selectedPoId);
    if (po) {
      setSupplierId(po.supplier_id);
      if (po.target_warehouse_id) setWarehouseId(po.target_warehouse_id);

      if (po.lines && po.lines.length > 0) {
        const prefilledLines: ReceiptLineItem[] = po.lines.map((l, idx) => {
          const remainingToReceive = l.ordered_qty - (l.received_qty || 0);
          const isGram = l.item?.base_unit === "gram";
          return {
            item_id: l.item_id,
            weight_kg: isGram ? remainingToReceive / 1000 : 0,
            received_qty: remainingToReceive,
            unit_cost_ex_vat: l.unit_price_ex_vat,
            batch_number: `BATCH-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-0${idx + 1}`,
            production_date: new Date().toISOString().slice(0, 10),
            expiry_date: new Date(Date.now() + 365 * 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
            notes: "",
          };
        });
        setReceiptLines(prefilledLines);
      }
    }
  };

  const updateLineItem = (index: number, field: keyof ReceiptLineItem, value: any) => {
    const updated = [...receiptLines];
    const current = { ...updated[index], [field]: value };

    // Auto-calculate grams if scale weight in KG changes for chemical items
    if (field === "weight_kg") {
      const itm = items.find((i) => i.id === current.item_id);
      if (itm?.base_unit === "gram") {
        current.received_qty = Number(value) * 1000;
      }
    }

    updated[index] = current;
    setReceiptLines(updated);
  };

  const addLine = () => {
    setReceiptLines([
      ...receiptLines,
      {
        item_id: "",
        weight_kg: 0,
        received_qty: 0,
        unit_cost_ex_vat: 0,
        batch_number: `BATCH-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-0${receiptLines.length + 1}`,
        production_date: new Date().toISOString().slice(0, 10),
        expiry_date: new Date(Date.now() + 365 * 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        notes: "",
      },
    ]);
  };

  // Submit Receipt & Call rpc_receive_fifo
  const createReceiptMutation = useMutation({
    mutationFn: async () => {
      if (!supplierId || !warehouseId) throw new Error("يرجى اختيار المورد والمستودع المستلم");
      if (receiptLines.length === 0 || receiptLines.some((l) => !l.item_id || l.received_qty <= 0)) {
        throw new Error("يرجى التأكد من اختيار الصنف وإدخال الكمية المستلمة لجميع البنود");
      }

      const receiptNumber = `GRN-${new Date().toISOString().slice(0, 7).replace("-", "")}-${Math.floor(1000 + Math.random() * 9000)}`;

      // 1. Insert Receipt Header
      const { data: receiptHeader, error: rErr } = await supabase
        .from("purchase_receipts")
        .insert([
          {
            receipt_number: receiptNumber,
            purchase_order_id: poId || null,
            supplier_id: supplierId,
            warehouse_id: warehouseId,
            status: "completed",
            supplier_dn_number: supplierDnNumber || null,
            received_by: profile?.id,
            freight_cost: freightCost || 0,
            notes,
          },
        ])
        .select()
        .single();

      if (rErr) throw rErr;

      // 2. Insert Receipt Lines
      const linePayload = receiptLines.map((l) => ({
        receipt_id: receiptHeader.id,
        item_id: l.item_id,
        weight_kg: Number(l.weight_kg) || null,
        received_qty: Number(l.received_qty),
        unit_cost_ex_vat: Number(l.unit_cost_ex_vat),
        batch_number: l.batch_number,
        production_date: l.production_date || null,
        expiry_date: l.expiry_date || null,
        notes: l.notes || null,
      }));

      const { error: linesErr } = await supabase.from("purchase_receipt_lines").insert(linePayload);
      if (linesErr) throw linesErr;

      // 3. Atomically invoke rpc_receive_fifo to build FIFO layers & settle negative queue
      const { data: rpcRes, error: rpcErr } = await supabase.rpc("rpc_receive_fifo", {
        p_receipt_id: receiptHeader.id,
        p_created_by: profile?.id || receiptHeader.id,
      });

      if (rpcErr) throw rpcErr;

      // 4. Update PO status if linked
      if (poId) {
        await supabase.from("purchase_orders").update({ status: "completed" }).eq("id", poId);
      }

      return { receiptNumber, rpcRes };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["purchase_receipts"] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["fifo_layers"] });
      queryClient.invalidateQueries({ queryKey: ["purchase_orders"] });
      toast.success(
        isAr
          ? `تم استلام البضاعة بنجاح وتوليد طبقات الـ FIFO (سند استلام ${res.receiptNumber})`
          : `Goods received and FIFO layers created successfully (${res.receiptNumber})`
      );
      setIsCreateOpen(false);
      setPoId("");
      setSupplierId("");
      setSupplierDnNumber("");
      setReceiptLines([]);
    },
    onError: (err: any) => {
      toast.error(err.message || "حدث خطأ أثناء استلام البضاعة");
    },
  });

  const filteredReceipts = receipts.filter((r) => {
    const q = searchQuery.toLowerCase();
    return (
      r.receipt_number.toLowerCase().includes(q) ||
      r.supplier?.name_ar.toLowerCase().includes(q) ||
      (r.supplier_dn_number && r.supplier_dn_number.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {isAr ? "سندات استلام المشتريات (بالوزن الفعلي)" : "Goods Receipt Notes (GRN)"}
          </h1>
          <p className="text-sm text-slate-500">
            {isAr
              ? "استلام الشحنات وتوثيق وزن الميزان الفعلي (كجم) وتوليد طبقات الـ FIFO تلقائياً مع الباتش والصلاحية"
              : "Weigh incoming raw materials on scale, verify batch numbers, and generate FIFO layers"}
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="bg-slate-900 text-white gap-2">
          <Scale className="w-4 h-4" />
          <span>{isAr ? "استلام شحنة جديدة" : "Receive Goods"}</span>
        </Button>
      </div>

      {/* Search Bar */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder={isAr ? "بحث برقم السند أو اسم المورد أو البوليصة..." : "Search receipts..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ps-9"
            />
          </div>
          <div className="text-xs text-slate-500 font-medium">
            {isAr ? `إجمالي الاستلامات: ${receipts.length}` : `Total Receipts: ${receipts.length}`}
          </div>
        </CardContent>
      </Card>

      {/* Receipts Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            {isAr ? "سجل سندات الاستلام المخزني" : "Goods Receipts Register"}
          </CardTitle>
          <CardDescription>
            {isAr ? "الاستلامات المنفذة والمثبتة في طبقات التكلفة" : "Completed receipts with FIFO layers"}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="w-36 font-semibold">{isAr ? "رقم السند" : "GRN #"}</TableHead>
                  <TableHead className="font-semibold">{isAr ? "المورد" : "Supplier"}</TableHead>
                  <TableHead className="w-36 font-semibold">{isAr ? "المستودع المستلم" : "Warehouse"}</TableHead>
                  <TableHead className="w-32 font-semibold">{isAr ? "تاريخ الاستلام" : "Date"}</TableHead>
                  <TableHead className="w-36 font-semibold">{isAr ? "رقم بوليصة المورد" : "Supplier DN"}</TableHead>
                  <TableHead className="w-28 text-center font-semibold">{isAr ? "الحالة" : "Status"}</TableHead>
                  <TableHead className="w-24 text-center font-semibold">{isAr ? "تفاصيل" : "View"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-12 mx-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredReceipts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-slate-500">
                      {isAr ? "لا توجد سندات استلام مسجلة بعد" : "No goods receipts found"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredReceipts.map((rec) => (
                    <TableRow key={rec.id} className="hover:bg-slate-50/80">
                      <TableCell className="font-mono font-medium text-slate-900 tabular-nums">
                        {rec.receipt_number}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-slate-900 block">{rec.supplier?.name_ar}</span>
                      </TableCell>
                      <TableCell className="text-sm text-slate-700">
                        {rec.warehouse?.name_ar}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {new Date(rec.receipt_date).toLocaleDateString(isAr ? "ar-SA" : "en-US")}
                      </TableCell>
                      <TableCell className="font-mono text-sm tabular-nums text-slate-600">
                        {rec.supplier_dn_number || "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className="bg-emerald-600 text-white gap-1 text-xs">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{isAr ? "مستلم ومرحّل" : "Completed"}</span>
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedReceipt(rec)}
                          className="gap-1 text-xs text-sky-700"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>{isAr ? "معاينة" : "View"}</span>
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

      {/* Create Goods Receipt Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scale className="w-5 h-5 text-sky-600" />
              <span>{isAr ? "سند استلام بضاعة بالوزن الفعلي (GRN)" : "Goods Receipt Note"}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 pt-2">
            {/* Header controls */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
              {/* Optional Link to PO */}
              <div className="space-y-1.5">
                <Label htmlFor="po_link">{isAr ? "ربط بأمر شراء معتمد (اختياري)" : "Link to PO (Optional)"}</Label>
                <select
                  id="po_link"
                  value={poId}
                  onChange={(e) => handlePoSelect(e.target.value)}
                  className="w-full h-9 rounded border border-slate-200 bg-white px-2 text-sm focus:ring-1 focus:ring-slate-900"
                >
                  <option value="">{isAr ? "-- استلام مباشر بدون أمر شراء --" : "-- Direct Receipt --"}</option>
                  {approvedPos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.po_number} - {p.supplier?.name_ar}
                    </option>
                  ))}
                </select>
              </div>

              {/* Supplier */}
              <div className="space-y-1.5">
                <Label htmlFor="rec_supplier">{isAr ? "المورد *" : "Supplier *"}</Label>
                <select
                  id="rec_supplier"
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  disabled={!!poId}
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

              {/* Warehouse */}
              <div className="space-y-1.5">
                <Label htmlFor="rec_warehouse">{isAr ? "المستودع المستلم *" : "Warehouse *"}</Label>
                <select
                  id="rec_warehouse"
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  className="w-full h-9 rounded border border-slate-200 bg-white px-2 text-sm focus:ring-1 focus:ring-slate-900"
                >
                  <option value="">{isAr ? "-- اختر المستودع --" : "-- Select Warehouse --"}</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name_ar} ({w.warehouse_type})
                    </option>
                  ))}
                </select>
              </div>

              {/* Delivery Note Number */}
              <div className="space-y-1.5">
                <Label htmlFor="rec_dn">{isAr ? "رقم بوليصة شحن المورد / إشعار التسليم" : "Supplier DN / Waybill"}</Label>
                <Input
                  id="rec_dn"
                  value={supplierDnNumber}
                  onChange={(e) => setSupplierDnNumber(e.target.value)}
                  placeholder="DN-99482"
                  className="h-9 font-mono"
                />
              </div>

              {/* Freight Cost */}
              <div className="space-y-1.5">
                <Label htmlFor="rec_freight">{isAr ? "تكلفة الشحن والنولون (حساب 6104)" : "Freight Cost (Account 6104)"}</Label>
                <Input
                  id="rec_freight"
                  type="number"
                  min="0"
                  step="any"
                  value={freightCost || ""}
                  onChange={(e) => setFreightCost(Number(e.target.value))}
                  placeholder="0.00"
                  className="h-9 font-mono"
                />
              </div>
            </div>

            {/* Scale & Items Table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <Scale className="w-4 h-4 text-sky-600" />
                  <span>{isAr ? "أوزان وكميات البنود المستلمة" : "Weighed Received Items"}</span>
                </Label>
                <Button type="button" size="sm" variant="outline" onClick={addLine} className="gap-1.5 text-xs">
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isAr ? "إضافة صنف" : "Add Item"}</span>
                </Button>
              </div>

              <div className="border border-slate-200 rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 text-xs">
                      <TableHead className="font-semibold">{isAr ? "الصنف *" : "Item *"}</TableHead>
                      <TableHead className="w-28 text-end font-semibold">{isAr ? "وزن الميزان (كجم)" : "Scale (Kg)"}</TableHead>
                      <TableHead className="w-32 text-end font-semibold">{isAr ? "الكمية للنظام" : "System Qty"}</TableHead>
                      <TableHead className="w-32 text-end font-semibold">{isAr ? "التكلفة للوحدة" : "Unit Cost (ex VAT)"}</TableHead>
                      <TableHead className="w-36 font-semibold">{isAr ? "رقم الباتش *" : "Batch #"}</TableHead>
                      <TableHead className="w-36 font-semibold">{isAr ? "تاريخ الصلاحية" : "Expiry Date"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receiptLines.map((line, idx) => {
                      const selectedItem = items.find((i) => i.id === line.item_id);
                      const isGram = selectedItem?.base_unit === "gram";

                      return (
                        <TableRow key={idx}>
                          <TableCell>
                            <select
                              value={line.item_id}
                              onChange={(e) => updateLineItem(idx, "item_id", e.target.value)}
                              className="w-full text-xs h-8 rounded border border-slate-200 bg-white px-2 focus:ring-1 focus:ring-slate-900"
                            >
                              <option value="">{isAr ? "-- اختر الصنف --" : "-- Select Item --"}</option>
                              {items.map((it) => (
                                <option key={it.id} value={it.id}>
                                  {it.sku} - {it.name_ar} ({it.base_unit === "gram" ? "جرام" : "حبة"})
                                </option>
                              ))}
                            </select>
                          </TableCell>

                          {/* Scale weight in KG (for liquids & powders) */}
                          <TableCell className="text-end">
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              value={line.weight_kg || ""}
                              onChange={(e) => updateLineItem(idx, "weight_kg", e.target.value)}
                              disabled={!isGram && !!selectedItem}
                              placeholder={isGram ? "كجم" : "-"}
                              className="h-8 text-xs text-end font-mono"
                            />
                          </TableCell>

                          {/* System Qty in base unit (grams or pieces) */}
                          <TableCell className="text-end">
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              value={line.received_qty || ""}
                              onChange={(e) => updateLineItem(idx, "received_qty", e.target.value)}
                              placeholder="0"
                              className="h-8 text-xs text-end font-mono font-semibold text-slate-900"
                            />
                            <span className="text-[10px] text-slate-400 block mt-0.5">
                              {isGram ? "جرام" : "حبة"}
                            </span>
                          </TableCell>

                          {/* Unit cost */}
                          <TableCell className="text-end">
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              value={line.unit_cost_ex_vat || ""}
                              onChange={(e) => updateLineItem(idx, "unit_cost_ex_vat", e.target.value)}
                              placeholder="0.00"
                              className="h-8 text-xs text-end font-mono"
                            />
                          </TableCell>

                          {/* Batch Number */}
                          <TableCell>
                            <Input
                              value={line.batch_number}
                              onChange={(e) => updateLineItem(idx, "batch_number", e.target.value)}
                              className="h-8 text-xs font-mono"
                              placeholder="BATCH-001"
                            />
                          </TableCell>

                          {/* Expiry Date */}
                          <TableCell>
                            <Input
                              type="date"
                              value={line.expiry_date}
                              onChange={(e) => updateLineItem(idx, "expiry_date", e.target.value)}
                              className="h-8 text-xs"
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-slate-100">
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              onClick={() => createReceiptMutation.mutate()}
              disabled={createReceiptMutation.isPending || !supplierId || !warehouseId}
              className="bg-slate-900 text-white gap-2"
            >
              {createReceiptMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck2 className="w-4 h-4" />}
              <span>{isAr ? "تأكيد الاستلام وتوليد طبقات الـ FIFO" : "Confirm Receipt & Build FIFO"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Receipt Details Dialog */}
      <Dialog open={!!selectedReceipt} onOpenChange={(open) => !open && setSelectedReceipt(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="font-mono text-slate-900">{selectedReceipt?.receipt_number}</span>
              <Badge className="bg-emerald-600 text-white gap-1 text-xs">
                <CheckCircle2 className="w-3 h-3" />
                <span>{isAr ? "مستلم ومرحّل" : "Completed"}</span>
              </Badge>
            </DialogTitle>
          </DialogHeader>

          {selectedReceipt && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50 p-3 rounded text-xs">
                <div>
                  <span className="text-slate-400 block">{isAr ? "المورد:" : "Supplier:"}</span>
                  <span className="font-semibold text-slate-900 block">{selectedReceipt.supplier?.name_ar}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">{isAr ? "المستودع:" : "Warehouse:"}</span>
                  <span className="font-semibold text-slate-900 block">{selectedReceipt.warehouse?.name_ar}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">{isAr ? "تاريخ الاستلام:" : "Date:"}</span>
                  <span className="text-slate-900 block">{new Date(selectedReceipt.receipt_date).toLocaleDateString(isAr ? "ar-SA" : "en-US")}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">{isAr ? "بوليصة المورد:" : "Supplier DN:"}</span>
                  <span className="font-mono text-slate-900 block tabular-nums">{selectedReceipt.supplier_dn_number || "-"}</span>
                </div>
              </div>

              {/* Lines */}
              <div className="border border-slate-200 rounded overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 text-xs">
                      <TableHead>{isAr ? "الصنف" : "Item"}</TableHead>
                      <TableHead className="w-28 text-end">{isAr ? "الوزن الفعلي" : "Scale Weight"}</TableHead>
                      <TableHead className="w-32 text-end">{isAr ? "الكمية للنظام" : "System Qty"}</TableHead>
                      <TableHead className="w-32 text-end">{isAr ? "سعر الوحدة" : "Unit Cost"}</TableHead>
                      <TableHead className="w-36">{isAr ? "رقم الباتش" : "Batch #"}</TableHead>
                      <TableHead className="w-28">{isAr ? "الصلاحية" : "Expiry"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedReceipt.lines?.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>
                          <span className="font-medium text-slate-900 block text-xs">
                            {line.item?.sku} - {isAr ? line.item?.name_ar : line.item?.name_en}
                          </span>
                        </TableCell>
                        <TableCell className="text-end font-mono text-xs tabular-nums text-slate-700">
                          {line.weight_kg ? `${line.weight_kg.toLocaleString("en-US")} كجم` : "-"}
                        </TableCell>
                        <TableCell className="text-end font-mono font-semibold text-xs tabular-nums text-slate-900">
                          {line.received_qty.toLocaleString("en-US")} {line.item?.base_unit === "gram" ? "جم" : "حبة"}
                        </TableCell>
                        <TableCell className="text-end font-mono text-xs tabular-nums text-slate-700">
                          {line.unit_cost_ex_vat.toFixed(4)} ر.س
                        </TableCell>
                        <TableCell className="font-mono text-xs text-sky-700 font-medium">
                          {line.batch_number}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">
                          {line.expiry_date ? new Date(line.expiry_date).toLocaleDateString(isAr ? "ar-SA" : "en-US") : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedReceipt(null)}>
              {isAr ? "إغلاق" : "Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
