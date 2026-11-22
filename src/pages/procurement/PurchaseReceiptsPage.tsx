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
  Eye,
  ArrowRight,
  Printer,
  FileDown,
  Share2
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


  const handlePrintGrn = (rec: PurchaseReceipt, isPdf = false) => {
    const win = window.open("", "_blank");
    if (!win) return;

    const docTitle = isPdf ? `سند_استلام_بضاعة_${rec.receipt_number}` : `سند استلام بضاعة بالوزن الفعلي - ${rec.receipt_number}`;

    win.document.write(`
      <!DOCTYPE html>
      <html dir="${isAr ? "rtl" : "ltr"}" lang="${isAr ? "ar" : "en"}">
        <head>
          <meta charset="utf-8" />
          <title>${docTitle}</title>
          <style>
            @page { size: A4 portrait; margin: 12mm; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "IBM Plex Sans Arabic", sans-serif; color: #0f172a; background: #fff; margin: 0; padding: 0; font-size: 12px; }
            .header-grid { display: grid; grid-template-columns: 1fr auto 1fr; gap: 16px; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; }
            .grn-badge { display: inline-block; padding: 4px 14px; background: #0f172a; color: #fff; font-weight: bold; font-size: 16px; border-radius: 4px; }
            .meta-card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; background: #f8fafc; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11.5px; }
            th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px; font-weight: bold; text-align: inherit; }
            td { border: 1px solid #e2e8f0; padding: 8px; }
            .tabular { font-family: monospace; font-variant-numeric: tabular-nums; }
            .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-top: 40px; text-align: center; }
            .sig-box { border-top: 1px dashed #94a3b8; padding-top: 8px; font-size: 11px; }
          </style>
        </head>
        <body>
          <div class="header-grid">
            <div style="text-align: ${isAr ? "right" : "left"};">
              <div style="font-weight: bold; font-size: 15px;">مصنع الأسياح للمنتجات الكيميائية</div>
              <div style="font-size: 11px; color: #64748b;">سجل تجاري: 1010000000 | الرقم الضريبي: 300000000000003</div>
              <div style="font-size: 11px; color: #64748b;">إدارة المستودعات والرقابة المخزنية</div>
            </div>
            <div style="text-align: center;">
              <div class="grn-badge">سند استلام بضاعة (GRN)</div>
              <div style="font-size: 12px; font-family: monospace; font-weight: bold; margin-top: 4px;">${rec.receipt_number}</div>
            </div>
            <div style="text-align: ${isAr ? "left" : "right"}; direction: ltr;">
              <div style="font-weight: bold; font-size: 14px;">Al-Asyah Chemical Factory</div>
              <div style="font-size: 11px; color: #64748b;">Goods Receipt Note (Scale Weighing)</div>
              <div style="font-size: 11px; color: #64748b;">Date: ${rec.receipt_date}</div>
            </div>
          </div>

          <div class="meta-card">
            <div>
              <span style="color: #64748b; font-size: 11px; display: block;">المورد:</span>
              <strong style="font-size: 13px;">${rec.supplier?.name_ar || "-"}</strong>
              <div style="font-size: 11px; color: #475569; margin-top: 2px;">رقم إشعار المورد (DN): <span class="tabular">${rec.supplier_dn_number || "-"}</span></div>
            </div>
            <div>
              <span style="color: #64748b; font-size: 11px; display: block;">مستودع الاستلام:</span>
              <strong style="font-size: 13px;">${rec.warehouse?.name_ar || "المستودع الرئيسي"}</strong>
              <div style="font-size: 11px; color: #475569; margin-top: 2px;">تاريخ الاستلام والوزن: <span class="tabular">${new Date(rec.receipt_date).toLocaleDateString("ar-SA")}</span></div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 35px; text-align: center;">#</th>
                <th style="width: 100px;">كود الصنف SKU</th>
                <th>اسم الصنف / المادة الخام</th>
                <th style="width: 110px; text-align: center;">الكمية المستلمة</th>
                <th style="width: 110px; text-align: center;">وزن الميزان الفعلي</th>
                <th style="width: 110px; text-align: center;">رقم الباتش</th>
                <th style="width: 100px; text-align: right;">تكلفة الوحدة (FIFO)</th>
              </tr>
            </thead>
            <tbody>
              ${rec.lines?.map((line, idx) => `
                <tr>
                  <td style="text-align: center;">${idx + 1}</td>
                  <td class="tabular" style="font-weight: bold;">${line.item?.sku || "-"}</td>
                  <td>${line.item?.name_ar || "صنف مخزني"}</td>
                  <td class="tabular" style="text-align: center; font-weight: bold;">${line.received_qty.toLocaleString("en-US")} ${line.item?.base_unit === "gram" ? "جم" : "حبة"}</td>
                  <td class="tabular" style="text-align: center; color: #0284c7; font-weight: bold;">${line.weight_kg ? line.weight_kg.toLocaleString("en-US") + " كجم" : "-"}</td>
                  <td class="tabular" style="text-align: center;">${line.batch_number || "-"}</td>
                  <td class="tabular" style="text-align: right;">${line.unit_cost_ex_vat ? line.unit_cost_ex_vat.toFixed(2) + " ر.س" : "-"}</td>
                </tr>
              `).join("") || ""}
            </tbody>
          </table>

          <div class="signatures">
            <div class="sig-box">
              <div style="font-weight: bold; margin-bottom: 35px;">مسؤول الميزان والمستودع</div>
              <div>التوقيع: ............................</div>
            </div>
            <div class="sig-box">
              <div style="font-weight: bold; margin-bottom: 35px;">أمين المستودع (استلام العهدة)</div>
              <div>التوقيع: ............................</div>
            </div>
            <div class="sig-box">
              <div style="font-weight: bold; margin-bottom: 35px;">مهندس مراقبة الجودة (QC)</div>
              <div>الختم والتوقيع: ............................</div>
            </div>
          </div>

          <script>
            window.onload = function() { window.print(); window.close(); };
          </script>
        </body>
      </html>
    `);
    win.document.close();
  };

  const handleShareWhatsapp = (rec: PurchaseReceipt) => {
    const supplierName = rec.supplier?.name_ar || "";
    const msg = `*إشعار استلام بضاعة بالمستودع (GRN)*
السادة/ ${supplierName}
رقم سند الاستلام: ${rec.receipt_number}
رقم إشعار التوصيل الخاص بكم: ${rec.supplier_dn_number || "-"}
تاريخ الاستلام والوزن: ${new Date(rec.receipt_date).toLocaleDateString("ar-SA")}
المستودع المستلم: ${rec.warehouse?.name_ar || "المستودع الرئيسي"}
عدد البنود المستلمة: ${rec.lines?.length || 0} صنف
تم فحص البضاعة وتأكيد مطابقة الوزن بالميزان وتوليد طبقات الـ FIFO.
_مصنع الأسياح للمنتجات الكيميائية - إدارة المستودعات_`;

    const encoded = encodeURIComponent(msg);
    const phone = rec.supplier?.contact_phone?.replace(/[^0-9]/g, "") || "";
    const waUrl = phone ? `https://api.whatsapp.com/send?phone=${phone}&text=${encoded}` : `https://api.whatsapp.com/send?text=${encoded}`;
    window.open(waUrl, "_blank");
  };

  // In-Page Canvas View for Goods Receipt Creation (Eliminating modal popup)
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
              <span>{isAr ? "العودة لسندات الاستلام" : "Back to Receipts"}</span>
            </Button>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
                <Scale className="w-5 h-5 text-sky-600" />
                <span>{isAr ? "سند استلام بضاعة بالوزن الفعلي (GRN)" : "Goods Receipt Note"}</span>
              </h1>
              <p className="text-xs text-slate-500">
                {isAr ? "استلام الشحنات وتوثيق وزن الميزان الفعلي (كجم) وتوليد طبقات الـ FIFO تلقائياً مع الباتش والصلاحية" : "Weigh incoming raw materials, verify batch, and generate FIFO layers"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              onClick={() => createReceiptMutation.mutate()}
              disabled={createReceiptMutation.isPending || !supplierId || !warehouseId}
              className="bg-slate-900 hover:bg-slate-800 text-white min-h-[40px] px-5 gap-2"
            >
              {createReceiptMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck2 className="w-4 h-4" />}
              <span>{isAr ? "تأكيد الاستلام وتوليد الـ FIFO" : "Confirm Receipt & Build FIFO"}</span>
            </Button>
          </div>
        </div>

        {/* Form Body in Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Header controls card */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Truck className="w-4 h-4 text-sky-600" />
                  <span>{isAr ? "بيانات الشحنة والتوريد" : "Shipment Information"}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

                  {/* Supplier Select */}
                  <div className="space-y-1.5">
                    <Label htmlFor="rec_supplier">{isAr ? "المورد *" : "Supplier *"}</Label>
                    <select
                      id="rec_supplier"
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

                  {/* Warehouse Select */}
                  <div className="space-y-1.5">
                    <Label htmlFor="rec_warehouse">{isAr ? "مستودع الاستلام *" : "Target Warehouse *"}</Label>
                    <select
                      id="rec_warehouse"
                      value={warehouseId}
                      onChange={(e) => setWarehouseId(e.target.value)}
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
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Supplier Delivery Note (Boleesa) */}
                  <div className="space-y-1.5">
                    <Label htmlFor="sup_dn">{isAr ? "رقم بوليصة / فاتورة المورد" : "Supplier DN / Invoice #"}</Label>
                    <Input
                      id="sup_dn"
                      value={supplierDnNumber}
                      onChange={(e) => setSupplierDnNumber(e.target.value)}
                      placeholder={isAr ? "مثال: INV-9842" : "e.g. DN-123"}
                      className="h-9 font-mono"
                    />
                  </div>

                  {/* Freight / Transportation Cost */}
                  <div className="space-y-1.5">
                    <Label htmlFor="freight">{isAr ? "تكلفة النقل والشحن (تضاف على تكلفة FIFO كجم)" : "Freight / Transport Cost"}</Label>
                    <Input
                      id="freight"
                      type="number"
                      min="0"
                      value={freightCost || ""}
                      onChange={(e) => setFreightCost(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className="h-9 font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="rec_notes">{isAr ? "ملاحظات الاستلام والفحص الأولي" : "Notes"}</Label>
                  <Input
                    id="rec_notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={isAr ? "حالة الطرود، الشاحنة، الفحص الظاهري..." : "Visual inspection..."}
                    className="h-9 text-xs"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Line items card */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Scale className="w-4 h-4 text-sky-600" />
                    <span>{isAr ? "بنود المواد والوزن الفعلي بالميزان" : "Items & Scale Weights"}</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 mt-0.5">
                    {isAr ? "يتم التحويل التلقائي للجرامات وتحديث تكلفة الكيلو مضافاً إليها الشحن" : "Automatic conversion to base units"}
                  </CardDescription>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={addLine} className="gap-1.5 text-xs">
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isAr ? "إضافة بند استلام" : "Add Line"}</span>
                </Button>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 text-xs">
                        <TableHead className="w-44">{isAr ? "المادة" : "Item"}</TableHead>
                        <TableHead className="w-28 text-end">{isAr ? "وزن الميزان (كجم)" : "Scale (kg)"}</TableHead>
                        <TableHead className="w-32 text-end">{isAr ? "الكمية للنظام" : "System Qty"}</TableHead>
                        <TableHead className="w-32 text-end">{isAr ? "سعر الوحدة" : "Unit Cost"}</TableHead>
                        <TableHead className="w-36">{isAr ? "رقم التشغيلة/الباتش" : "Batch #"}</TableHead>
                        <TableHead className="w-28">{isAr ? "تاريخ الصلاحية" : "Expiry"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {receiptLines.map((line, idx) => {
                        const selectedItem = items.find((m) => m.id === line.item_id);
                        const isGram = selectedItem?.base_unit === "gram";

                        return (
                          <TableRow key={idx}>
                            {/* Material select */}
                            <TableCell>
                              <select
                                value={line.item_id}
                                onChange={(e) => updateLineItem(idx, "item_id", e.target.value)}
                                className="w-full h-8 rounded border border-slate-200 bg-white px-2 text-xs"
                              >
                                <option value="">{isAr ? "-- اختر المادة --" : "-- Select --"}</option>
                                {items.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.sku} - {m.name_ar} ({m.base_unit === "gram" ? "جرام" : "حبة"})
                                  </option>
                                ))}
                              </select>
                            </TableCell>

                            {/* Weight on physical scale (kg) */}
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
              </CardContent>
            </Card>
          </div>

          {/* Side Column: Summary & Actions */}
          <div className="space-y-6">
            <Card className="border-slate-200 shadow-sm sticky top-6">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <FileCheck2 className="w-4 h-4 text-emerald-600" />
                  <span>{isAr ? "تأكيد سند الاستلام" : "Receipt Confirmation"}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2">
                  <div className="flex justify-between text-slate-600">
                    <span>{isAr ? "عدد البنود:" : "Items Count:"}</span>
                    <span className="font-mono font-bold text-slate-900">{receiptLines.length}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>{isAr ? "تكلفة الشحن والنقل:" : "Freight Cost:"}</span>
                    <span className="font-mono font-bold tabular-nums text-slate-900">{freightCost.toFixed(2)} ر.س</span>
                  </div>
                  <div className="border-t border-slate-200 pt-2 text-slate-500 text-[11px] leading-relaxed">
                    {isAr
                      ? "سيتم تسجيل طبقات الـ FIFO في قاعدة البيانات آلياً مع ربطها برقم الباتش وتاريخ الصلاحية."
                      : "FIFO layers will be automatically generated with batch and expiry tracking."}
                  </div>
                </div>

                <div className="pt-2 space-y-2">
                  <Button
                    onClick={() => createReceiptMutation.mutate()}
                    disabled={createReceiptMutation.isPending || !supplierId || !warehouseId}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white min-h-[46px] font-bold gap-2"
                  >
                    {createReceiptMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck2 className="w-4 h-4" />}
                    <span>{isAr ? "تأكيد الاستلام وتوليد الـ FIFO" : "Confirm Receipt & Build FIFO"}</span>
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

  // In-Page Canvas View for Selected Receipt Details (Eliminating modal popup)
  if (selectedReceipt) {
    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <Button
              variant="tonal"
              size="sm"
              onClick={() => setSelectedReceipt(null)}
              className="gap-1.5"
            >
              <ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
              <span>{isAr ? "العودة لسندات الاستلام" : "Back to Receipts"}</span>
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold font-mono text-slate-900">
                  {selectedReceipt.receipt_number}
                </h1>
                <Badge className="bg-emerald-600 text-white gap-1 text-xs">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>{isAr ? "مستلم ومرحّل" : "Completed"}</span>
                </Badge>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {isAr ? "تفاصيل سند الاستلام، أوزان الميزان الفعلي، وطبقات الـ FIFO المتولدة" : "Receipt details and generated FIFO layers"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePrintGrn(selectedReceipt, false)}
              className="gap-1.5"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              <span>{isAr ? "طباعة A4" : "Print A4"}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePrintGrn(selectedReceipt, true)}
              className="gap-1.5"
            >
              <FileDown className="w-4 h-4 text-sky-600" />
              <span>{isAr ? "حفظ PDF" : "Save PDF"}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleShareWhatsapp(selectedReceipt)}
              className="gap-1.5 text-emerald-700 hover:text-emerald-800"
            >
              <Share2 className="w-4 h-4 text-emerald-600" />
              <span>{isAr ? "مشاركة واتساب" : "WhatsApp"}</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedReceipt(null)}>
              {isAr ? "إغلاق" : "Close"}
            </Button>
          </div>
        </div>

        {/* Receipt Details Body in Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Header info */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-800">
                  {isAr ? "بيانات سند الاستلام" : "Receipt Information"}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs">
                  <div>
                    <span className="text-slate-400 block mb-1">{isAr ? "المورد:" : "Supplier:"}</span>
                    <span className="font-semibold text-slate-900 block text-sm">{selectedReceipt.supplier?.name_ar}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-1">{isAr ? "المستودع:" : "Warehouse:"}</span>
                    <span className="font-semibold text-slate-900 block text-sm">{selectedReceipt.warehouse?.name_ar}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-1">{isAr ? "تاريخ الاستلام:" : "Date:"}</span>
                    <span className="text-slate-900 block text-sm font-mono">{new Date(selectedReceipt.receipt_date).toLocaleDateString(isAr ? "ar-SA" : "en-US")}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-1">{isAr ? "بوليصة المورد:" : "Supplier DN:"}</span>
                    <span className="font-mono text-slate-900 block tabular-nums text-sm">{selectedReceipt.supplier_dn_number || "-"}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Lines table */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-800">
                  {isAr ? "الأصناف وأوزان الميزان الفعلي وطبقات الـ FIFO" : "Receipt Items & Weights"}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="border border-slate-200 rounded-xl overflow-hidden">
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
              </CardContent>
            </Card>
          </div>

          {/* Side Column: Summary */}
          <div className="space-y-6">
            <Card className="border-slate-200 shadow-sm sticky top-6">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-800">
                  {isAr ? "حالة الإدخال المخزني" : "Inventory Status"}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center space-y-1">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-1" />
                  <span className="text-xs text-emerald-800 font-bold block">{isAr ? "تم إدخال المخزون بنجاح" : "Stock Updated"}</span>
                  <p className="text-[11px] text-emerald-600">
                    {isAr ? "تم تفعيل طبقات FIFO فورية في مستودع المصنع" : "Active FIFO layers added"}
                  </p>
                </div>

                <div className="pt-2">
                  <Button variant="outline" onClick={() => setSelectedReceipt(null)} className="w-full">
                    {isAr ? "العودة للقائمة" : "Back to List"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
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
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedReceipt(rec)}
                            className="gap-1 text-xs text-sky-700"
                            title={isAr ? "معاينة سند الاستلام كامل" : "View GRN"}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>{isAr ? "معاينة" : "View"}</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handlePrintGrn(rec, false)}
                            className="h-7 w-7 p-0 text-slate-600 hover:bg-slate-100"
                            title={isAr ? "طباعة A4" : "Print A4"}
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handlePrintGrn(rec, true)}
                            className="h-7 w-7 p-0 text-sky-700 hover:bg-sky-50"
                            title={isAr ? "حفظ PDF" : "Save PDF"}
                          >
                            <FileDown className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleShareWhatsapp(rec)}
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

    </div>
  );
}
