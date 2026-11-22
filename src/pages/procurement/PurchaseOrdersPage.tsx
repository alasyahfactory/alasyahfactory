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
  Send,
  ArrowRight,
  Printer,
  FileDown,
  Share2
} from "lucide-react";
import { printDocumentHtml, saveDocumentPdfFromHtml, shareDocumentWhatsApp } from "@/utils/printAndPdf";

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


  const getPoHtml = (po: PurchaseOrder) => {
    const docTitle = `أمر شراء رسمي - ${po.po_number}`;
    const totalExVat = po.total_amount;
    const vat15 = totalExVat * 0.15;
    const grandTotal = totalExVat + vat15;

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
            .po-badge { display: inline-block; padding: 4px 14px; background: #0f172a; color: #fff; font-weight: bold; font-size: 16px; border-radius: 4px; }
            .meta-card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; background: #f8fafc; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11.5px; }
            th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px; font-weight: bold; text-align: inherit; }
            td { border: 1px solid #e2e8f0; padding: 8px; }
            .tabular { font-family: monospace; font-variant-numeric: tabular-nums; }
            .totals-box { width: 280px; margin-inline-start: auto; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; margin-bottom: 30px; }
            .totals-row { display: flex; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid #e2e8f0; font-size: 11.5px; }
            .totals-row.grand { background: #0f172a; color: #fff; font-weight: bold; font-size: 13px; border-bottom: none; }
            .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-top: 40px; text-align: center; }
            .sig-box { border-top: 1px dashed #94a3b8; padding-top: 8px; font-size: 11px; }
          </style>
        </head>
        <body>
          <div class="header-grid">
            <div style="text-align: ${isAr ? "right" : "left"};">
              <div style="font-weight: bold; font-size: 15px;">مصنع الأسياح للمنتجات الكيميائية</div>
              <div style="font-size: 11px; color: #64748b;">سجل تجاري: 1010000000 | الرقم الضريبي: 300000000000003</div>
              <div style="font-size: 11px; color: #64748b;">إدارة المشتريات وسلاسل الإمداد</div>
            </div>
            <div style="text-align: center;">
              <div class="po-badge">أمر شراء بضاعة (PO)</div>
              <div style="font-size: 12px; font-family: monospace; font-weight: bold; margin-top: 4px;">${po.po_number}</div>
            </div>
            <div style="text-align: ${isAr ? "left" : "right"}; direction: ltr;">
              <div style="font-weight: bold; font-size: 14px;">Al-Asyah Chemical Factory</div>
              <div style="font-size: 11px; color: #64748b;">Purchase Order Form</div>
              <div style="font-size: 11px; color: #64748b;">Date: ${po.order_date}</div>
            </div>
          </div>

          <div class="meta-card">
            <div>
              <span style="color: #64748b; font-size: 11px; display: block;">السادة / المورد المعتمد:</span>
              <strong style="font-size: 13px;">${po.supplier?.name_ar || "-"}</strong>
              <div style="font-size: 11px; color: #475569; margin-top: 2px;">الرقم الضريبي للمورد: <span class="tabular">${po.supplier?.tax_number || "غير مسجل"}</span></div>
            </div>
            <div>
              <span style="color: #64748b; font-size: 11px; display: block;">مستودع التسليم والاستلام:</span>
              <strong style="font-size: 13px;">${po.target_warehouse?.name_ar || "المستودع الرئيسي"}</strong>
              <div style="font-size: 11px; color: #475569; margin-top: 2px;">تاريخ التوريد المستهدف: <span class="tabular">${(po as any).delivery_date || po.order_date}</span></div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 35px; text-align: center;">#</th>
                <th style="width: 110px;">كود الصنف SKU</th>
                <th>اسم الصنف / المادة الخام</th>
                <th style="width: 70px; text-align: center;">الوحدة</th>
                <th style="width: 80px; text-align: center;">الكمية</th>
                <th style="width: 100px; text-align: right;">السعر بدون ضريبة</th>
                <th style="width: 110px; text-align: right;">الإجمالي بدون ضريبة</th>
              </tr>
            </thead>
            <tbody>
              ${po.lines?.map((line, idx) => `
                <tr>
                  <td style="text-align: center;">${idx + 1}</td>
                  <td class="tabular" style="font-weight: bold;">${line.item?.sku || "-"}</td>
                  <td>${line.item?.name_ar || "صنف مخزني"}</td>
                  <td style="text-align: center;">${line.item?.base_unit === "gram" ? "جرام" : "حبة / كرتون"}</td>
                  <td class="tabular" style="text-align: center; font-weight: bold;">${line.ordered_qty.toLocaleString("en-US")}</td>
                  <td class="tabular" style="text-align: right;">${line.unit_price_ex_vat.toFixed(2)} ر.س</td>
                  <td class="tabular" style="text-align: right; font-weight: bold;">${line.total_ex_vat.toFixed(2)} ر.س</td>
                </tr>
              `).join("") || ""}
            </tbody>
          </table>

          <div class="totals-box">
            <div class="totals-row">
              <span>المجموع قبل الضريبة:</span>
              <span class="tabular font-bold">${totalExVat.toFixed(2)} ر.س</span>
            </div>
            <div class="totals-row">
              <span>ضريبة القيمة المضافة (15%):</span>
              <span class="tabular">${vat15.toFixed(2)} ر.س</span>
            </div>
            <div class="totals-row grand">
              <span>إجمالي أمر الشراء (شامل الضريبة):</span>
              <span class="tabular">${grandTotal.toFixed(2)} ر.س</span>
            </div>
          </div>

          <div class="signatures">
            <div class="sig-box">
              <div style="font-weight: bold; margin-bottom: 35px;">مسؤول المشتريات</div>
              <div>التوقيع: ............................</div>
            </div>
            <div class="sig-box">
              <div style="font-weight: bold; margin-bottom: 35px;">المحاسب المالي</div>
              <div>التوقيع: ............................</div>
            </div>
            <div class="sig-box">
              <div style="font-weight: bold; margin-bottom: 35px;">اعتماد الإدارة العامة</div>
              <div>الختم والتوقيع: ............................</div>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  const handlePrintPo = (po: PurchaseOrder) => {
    printDocumentHtml(getPoHtml(po), `أمر_شراء_${po.po_number}`);
  };

  const handleSavePdfPo = (po: PurchaseOrder) => {
    saveDocumentPdfFromHtml(getPoHtml(po), `أمر_شراء_${po.po_number}`);
  };

  const handleShareWhatsapp = (po: PurchaseOrder) => {
    const supplierName = po.supplier?.name_ar || "";
    const totalAmount = (po.total_amount * 1.15).toLocaleString("en-US", { minimumFractionDigits: 2 });
    const msg = `*أمر شراء بضاعة رسمي (Purchase Order)*
السادة/ ${supplierName}
رقم أمر الشراء: ${po.po_number}
تاريخ الأمر: ${new Date(po.order_date).toLocaleDateString("ar-SA")}
مستودع التسليم: ${po.target_warehouse?.name_ar || "المستودع الرئيسي"}
عدد البنود المطلوبة: ${po.lines?.length || 0} صنف
إجمالي قيمة الأمر شامل الضريبة (15%): ${totalAmount} ريال سعودي
يرجى تأكيد الاستلام وتجهيز البضاعة للتوريد.
_مصنع الأسياح للمنتجات الكيميائية - إدارة المشتريات_`;

    shareDocumentWhatsApp(po.supplier?.contact_phone, msg);
  };

  // In-Page Canvas View for Purchase Order Creation (Eliminating modal popup)
  if (isCreateOpen) {
    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* In-page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <Button
              variant="tonal"
              size="sm"
              onClick={() => setIsCreateOpen(false)}
              className="gap-1.5"
            >
              <ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
              <span>{isAr ? "العودة لأوامر الشراء" : "Back to Orders"}</span>
            </Button>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-sky-600" />
                <span>{isAr ? "إنشاء أمر شراء وتوريد جديد" : "Create Purchase Order"}</span>
              </h1>
              <p className="text-xs text-slate-500">
                {isAr ? "تحديد المورد، المستودع المستهدف، وجدول كميات وأسعار المواد الخام ومواد التعبئة" : "Specify supplier, target warehouse, and raw material lines"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !supplierId || totalAmount <= 0}
              className="bg-slate-900 hover:bg-slate-800 text-white min-h-[40px] px-5 gap-2"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span>{isAr ? "إرسال أمر الشراء للاعتماد" : "Submit for Approval"}</span>
            </Button>
          </div>
        </div>

        {/* Form Body in Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Header Form Card */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-sky-600" />
                  <span>{isAr ? "بيانات المورد والشحن" : "Supplier & Delivery Info"}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                      className="h-9 font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="po_notes">{isAr ? "ملاحظات وشروط أمر الشراء" : "Order Notes"}</Label>
                  <Input
                    id="po_notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={isAr ? "شروط التسليم، مواصفات التعبئة..." : "Delivery terms..."}
                    className="h-9 text-xs bg-white"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Lines Card */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-sky-600" />
                    <span>{isAr ? "بنود وأصناف أمر الشراء" : "Order Items"}</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 mt-0.5">
                    {isAr ? "إدراج المواد الخام ومواد التعبئة والكميات الموردة" : "Raw materials and packaging items"}
                  </CardDescription>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={addLine} className="gap-1.5 text-xs">
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isAr ? "إضافة بند" : "Add Line"}</span>
                </Button>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 text-xs">
                        <TableHead className="w-[40%]">{isAr ? "المادة / الصنف" : "Item"}</TableHead>
                        <TableHead className="w-[20%] text-center">{isAr ? "الكمية المطلوبة" : "Quantity"}</TableHead>
                        <TableHead className="w-[20%] text-center">{isAr ? "سعر الوحدة (غير شامل)" : "Unit Price"}</TableHead>
                        <TableHead className="w-[15%] text-end">{isAr ? "الإجمالي" : "Total"}</TableHead>
                        <TableHead className="w-[5%]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line, index) => {
                        const itemObj = items.find((r) => r.id === line.item_id);
                        const lineSubtotal = line.ordered_qty * line.unit_price_ex_vat;
                        const lineTotal = lineSubtotal * 1.15;

                        return (
                          <TableRow key={index}>
                            <TableCell>
                              <select
                                value={line.item_id}
                                onChange={(e) => updateLine(index, "item_id", e.target.value)}
                                className="w-full h-8 rounded border border-slate-200 bg-white px-2 text-xs"
                              >
                                <option value="">{isAr ? "-- اختر الصنف --" : "-- Select Item --"}</option>
                                {items.map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.sku} - {item.name_ar} ({item.base_unit === "gram" ? "جم" : "حبة"})
                                  </option>
                                ))}
                              </select>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1 justify-center">
                                <Input
                                  type="number"
                                  value={line.ordered_qty || ""}
                                  onChange={(e) => updateLine(index, "ordered_qty", parseFloat(e.target.value) || 0)}
                                  className="h-8 text-center text-xs font-mono tabular-nums w-24"
                                />
                                <span className="text-[10px] text-slate-500 min-w-[20px]">
                                  {itemObj ? (itemObj.base_unit === "gram" ? "جم" : "حبة") : ""}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                step="0.0001"
                                value={line.unit_price_ex_vat || ""}
                                onChange={(e) => updateLine(index, "unit_price_ex_vat", parseFloat(e.target.value) || 0)}
                                className="h-8 text-center text-xs font-mono tabular-nums"
                              />
                            </TableCell>
                            <TableCell className="text-end font-mono text-xs tabular-nums font-semibold text-slate-800">
                              {lineTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س
                            </TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeLine(index)}
                                disabled={lines.length === 1}
                                className="h-7 w-7 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
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
              </CardContent>
            </Card>
          </div>

          {/* Side Column: Summary */}
          <div className="space-y-6">
            <Card className="border-slate-200 shadow-sm sticky top-6">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-emerald-600" />
                  <span>{isAr ? "الملخص المالي لأمر الشراء" : "Financial Summary"}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2.5">
                  <div className="flex justify-between text-slate-600">
                    <span>{isAr ? "المجموع قبل الضريبة:" : "Subtotal:"}</span>
                    <span className="font-mono font-bold tabular-nums text-slate-900">
                      {subtotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>{isAr ? "ضريبة القيمة المضافة (15%):" : "VAT (15%):"}</span>
                    <span className="font-mono font-bold tabular-nums text-sky-700">
                      {vatAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-extrabold text-slate-900">
                    <span>{isAr ? "الإجمالي النهائي:" : "Grand Total:"}</span>
                    <span className="font-mono tabular-nums text-emerald-700">
                      {totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س
                    </span>
                  </div>
                </div>

                <div className="pt-2 space-y-2">
                  <Button
                    onClick={() => createMutation.mutate()}
                    disabled={createMutation.isPending || !supplierId || totalAmount <= 0}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white min-h-[46px] font-bold gap-2"
                  >
                    {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    <span>{isAr ? "إرسال أمر الشراء للاعتماد" : "Submit for Approval"}</span>
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

  // In-Page Canvas View for Selected Purchase Order Details & Approval (Eliminating modal popup)
  if (selectedPo) {
    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <Button
              variant="tonal"
              size="sm"
              onClick={() => setSelectedPo(null)}
              className="gap-1.5"
            >
              <ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
              <span>{isAr ? "العودة لأوامر الشراء" : "Back to Orders"}</span>
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold font-mono text-slate-900">
                  {selectedPo.po_number}
                </h1>
                {getStatusBadge(selectedPo.status)}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {isAr ? "تفاصيل أمر الشراء، بنود المواد، وحالة الاعتماد الإداري" : "Purchase order details, items, and approval status"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePrintPo(selectedPo)}
              className="gap-1.5"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              <span>{isAr ? "طباعة A4" : "Print A4"}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSavePdfPo(selectedPo)}
              className="gap-1.5"
            >
              <FileDown className="w-4 h-4 text-sky-600" />
              <span>{isAr ? "حفظ PDF" : "Save PDF"}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleShareWhatsapp(selectedPo)}
              className="gap-1.5 text-emerald-700 hover:text-emerald-800"
            >
              <Share2 className="w-4 h-4 text-emerald-600" />
              <span>{isAr ? "مشاركة واتساب" : "WhatsApp"}</span>
            </Button>
            {(isOwner || isAccountant) && selectedPo.status === "pending_approval" && (
              <>
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
              </>
            )}
            <Button variant="outline" onClick={() => setSelectedPo(null)}>
              {isAr ? "إغلاق" : "Close"}
            </Button>
          </div>
        </div>

        {/* PO Details Body in Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Metadata Card */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-800">
                  {isAr ? "بيانات أمر الشراء" : "Order Information"}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs">
                  <div>
                    <span className="text-slate-400 block mb-1">{isAr ? "المورد:" : "Supplier:"}</span>
                    <span className="font-semibold text-slate-900 block text-sm">{selectedPo.supplier?.name_ar}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-1">{isAr ? "الرقم الضريبي:" : "Tax Number:"}</span>
                    <span className="font-mono text-slate-900 block tabular-nums text-sm">{selectedPo.supplier?.tax_number || "-"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-1">{isAr ? "تاريخ الطلب:" : "Order Date:"}</span>
                    <span className="text-slate-900 block text-sm font-mono">{new Date(selectedPo.order_date).toLocaleDateString(isAr ? "ar-SA" : "en-US")}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-1">{isAr ? "المستودع المستهدف:" : "Warehouse:"}</span>
                    <span className="text-slate-900 block text-sm font-semibold">{selectedPo.target_warehouse?.name_ar || "-"}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Lines Card */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-800">
                  {isAr ? "بنود المواد والكميات" : "Order Items"}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="border border-slate-200 rounded-xl overflow-hidden">
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
              </CardContent>
            </Card>
          </div>

          {/* Side Column: Total Card */}
          <div className="space-y-6">
            <Card className="border-slate-200 shadow-sm sticky top-6">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-800">
                  {isAr ? "الإجمالي المعتمد" : "Approved Total"}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="p-4 bg-slate-900 text-white rounded-xl text-center space-y-1">
                  <span className="text-xs text-slate-400 block">{isAr ? "إجمالي أمر الشراء النهائي (شامل 15% ضريبة):" : "Grand Total (inc 15% VAT):"}</span>
                  <span className="text-2xl font-bold font-mono tabular-nums block text-emerald-400">
                    {selectedPo.total_amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س
                  </span>
                </div>

                <div className="pt-2">
                  <Button variant="outline" onClick={() => setSelectedPo(null)} className="w-full">
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

      {/* 2026 Modern Procurement KPI Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <div className="stat-card-2026 accent-slate">
          <span className="text-xs font-bold text-slate-500 tracking-tight block mb-1">
            {isAr ? "إجمالي أوامر الشراء" : "Total Orders"}
          </span>
          <div className="text-xl sm:text-2xl font-black font-mono text-slate-900 tabular-nums tracking-tight">
            {purchaseOrders.length} {isAr ? "أمر توريد" : "POs"}
          </div>
          <div className="mt-2 text-[11px] text-slate-600 font-semibold bg-slate-100 px-2 py-0.5 rounded-full inline-block">
            {isAr ? "سجل التوريدات" : "Procurement"}
          </div>
        </div>

        <div className="stat-card-2026 accent-emerald">
          <span className="text-xs font-bold text-slate-500 tracking-tight block mb-1">
            {isAr ? "إجمالي قيمة المشتريات" : "Total Purchasing Value"}
          </span>
          <div className="text-xl sm:text-2xl font-black font-mono text-emerald-700 tabular-nums tracking-tight">
            {purchaseOrders.reduce((sum, po) => sum + (po.total_amount || 0), 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س
          </div>
          <div className="mt-2 text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full inline-block border border-emerald-200/60">
            {isAr ? "شامل ضريبة 15%" : "Inc. 15% VAT"}
          </div>
        </div>

        <div className="stat-card-2026 accent-amber">
          <span className="text-xs font-bold text-slate-500 tracking-tight block mb-1">
            {isAr ? "أوامر بانتظار الاعتماد" : "Pending Approval"}
          </span>
          <div className="text-xl sm:text-2xl font-black font-mono text-amber-700 tabular-nums tracking-tight">
            {purchaseOrders.filter((po) => po.status === "draft" || (po.status as any) === "pending_approval").length} {isAr ? "أمر معلق" : "Pending"}
          </div>
          <div className="mt-2 text-[11px] text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded-full inline-block border border-amber-200/60">
            {isAr ? "موافقة الإدارة" : "Review Required"}
          </div>
        </div>

        <div className="stat-card-2026 accent-sky">
          <span className="text-xs font-bold text-slate-500 tracking-tight block mb-1">
            {isAr ? "جاهزة لاستلام الميزان" : "Ready for Receiving"}
          </span>
          <div className="text-xl sm:text-2xl font-black font-mono text-sky-700 tabular-nums tracking-tight">
            {purchaseOrders.filter((po) => po.status === "approved" || po.status === "partially_received").length} {isAr ? "أمر للشحن" : "POs"}
          </div>
          <div className="mt-2 text-[11px] text-sky-700 font-semibold bg-sky-50 px-2 py-0.5 rounded-full inline-block border border-sky-200/60">
            {isAr ? "المستودع والميزان" : "Warehouse GRN"}
          </div>
        </div>
      </div>

      {/* Search and Counts */}
      <Card className="border-slate-200/80 bg-white/95 backdrop-blur-sm shadow-subtle rounded-2xl">
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
          <div className="text-xs text-slate-500 font-semibold">
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
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedPo(po)}
                            className="gap-1 text-xs text-sky-700"
                            title={isAr ? "معاينة أمر الشراء كامل" : "View PO"}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>{isAr ? "معاينة" : "View"}</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handlePrintPo(po)}
                            className="h-7 w-7 p-0 text-slate-600 hover:bg-slate-100"
                            title={isAr ? "طباعة A4" : "Print A4"}
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSavePdfPo(po)}
                            className="h-7 w-7 p-0 text-sky-700 hover:bg-sky-50"
                            title={isAr ? "حفظ PDF" : "Save PDF"}
                          >
                            <FileDown className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleShareWhatsapp(po)}
                            className="h-7 w-7 p-0 text-emerald-600 hover:bg-emerald-50"
                            title={isAr ? "مشاركة واتساب للمورد" : "WhatsApp"}
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
