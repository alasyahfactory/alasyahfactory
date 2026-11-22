import React, { useState, useEffect } from "react";
import QRCode from "qrcode";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import type { SalesInvoice, Customer, Item, Warehouse, UserProfile, FactorySettings } from "@/types/database";
import { TaxInvoicePrint } from "@/components/sales/TaxInvoicePrint";
import { generateZatcaTlvBase64 } from "@/lib/zatca";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Receipt,
  Plus,
  Search,
  Printer,
  Truck,
  Building,
  AlertTriangle,
  Gift,
  Trash2,
  DollarSign,
  QrCode,
  ArrowRight,
  Eye,
  FileDown,
  Share2,
} from "lucide-react";

function ZatcaQrPreview({ qrBase64 }: { qrBase64: string }) {
  const [dataUrl, setDataUrl] = useState<string>("");
  useEffect(() => {
    if (qrBase64) {
      QRCode.toDataURL(qrBase64, { width: 140, margin: 1, errorCorrectionLevel: "M" })
        .then(setDataUrl)
        .catch(console.error);
    }
  }, [qrBase64]);

  if (!dataUrl) return <Skeleton className="w-[140px] h-[140px] rounded-lg" />;
  return <img src={dataUrl} alt="ZATCA Phase 1 QR" className="w-[140px] h-[140px] object-contain mx-auto" />;
}

export function SalesInvoicesPage() {
  const { t, i18n } = useTranslation();
  const { user, isOwner, isAccountant } = useAuth();
  const queryClient = useQueryClient();
  const isArabic = i18n.language === "ar";

  const [searchTerm, setSearchTerm] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<SalesInvoice | null>(null);

  // Form State
  const [customerId, setCustomerId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDays, setDueDays] = useState<number>(30);
  const [sourceType, setSourceType] = useState<"direct" | "van_sale">("direct");
  const [vanWarehouseId, setVanWarehouseId] = useState("");
  const [assignedRepId, setAssignedRepId] = useState("");
  const [advanceDeducted, setAdvanceDeducted] = useState<number>(0);
  const [notes, setNotes] = useState("");

  const [lines, setLines] = useState<
    Array<{
      item_id: string;
      quantity: number;
      unit_type: "carton" | "piece";
      unit_price_ex_vat: number;
      is_bonus_or_sample: boolean;
    }>
  >([]);

  // 1. Fetch Sales Invoices
  const { data: invoices, isLoading } = useQuery<SalesInvoice[]>({
    queryKey: ["sales-invoices-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_invoices")
        .select(`
          *,
          customer:customers(id, code, name_ar, name_en, phone, vat_number, national_address),
          assigned_rep:users_profile!sales_invoices_assigned_rep_id_fkey(id, full_name),
          van_warehouse:warehouses!sales_invoices_van_warehouse_id_fkey(id, name_ar),
          lines:sales_invoice_lines(
            id,
            item_id,
            quantity,
            unit_type,
            pieces_count,
            unit_price_ex_vat,
            total_price_ex_vat,
            vat_amount,
            total_line_inc_vat,
            is_bonus_or_sample,
            item:items(id, sku, name_ar, name_en)
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as SalesInvoice[];
    },
  });

  // 2. Fetch Customers
  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["customers-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("is_active", true)
        .order("name_ar");
      if (error) throw error;
      return data || [];
    },
    enabled: createModalOpen,
  });

  // 3. Fetch Finished Goods with FIFO Cost Layers
  const { data: finishedGoods } = useQuery<any[]>({
    queryKey: ["items-fg-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select(`
          *,
          fifo_layers(unit_cost_ex_vat, remaining_qty)
        `)
        .eq("item_type", "finished_good")
        .eq("is_active", true)
        .order("name_ar");
      if (error) throw error;
      return data || [];
    },
    enabled: createModalOpen,
  });

  // 4. Fetch Delivery Vans
  const { data: vans } = useQuery<Warehouse[]>({
    queryKey: ["warehouses-vans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("*")
        .eq("warehouse_type", "sales_van")
        .eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
    enabled: createModalOpen,
  });

  // 5. Fetch Sales Reps
  const { data: reps } = useQuery<UserProfile[]>({
    queryKey: ["reps-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users_profile")
        .select("*")
        .eq("role", "sales_rep")
        .eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
    enabled: createModalOpen,
  });

  // 6. Fetch Factory Settings for ZATCA Seller Info & Print
  const { data: settings } = useQuery<FactorySettings | null>({
    queryKey: ["factory-settings-zatca"],
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

  // Selected customer details
  const selectedCustomer = customers?.find((c) => c.id === customerId);

  // Auto calculate totals in UI
  let subtotalExVat = 0;
  let vatTotal = 0;
  lines.forEach((l) => {
    if (!l.is_bonus_or_sample) {
      const lineEx = l.quantity * l.unit_price_ex_vat;
      subtotalExVat += lineEx;
      vatTotal += lineEx * 0.15;
    }
  });
  const totalIncVat = subtotalExVat + vatTotal;
  const netDue = Math.max(0, totalIncVat - advanceDeducted);

  // Create Sales Invoice Mutation
  const createInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (!customerId || lines.length === 0) {
        throw new Error(isArabic ? "يرجى اختيار العميل وإضافة صنف واحد على الأقل" : "Please select customer and items");
      }
      const invalidLine = lines.find((l) => !l.item_id || l.quantity <= 0);
      if (invalidLine) {
        throw new Error(isArabic ? "يرجى اختيار المنتج وتحديد كمية صالحة لجميع الأصناف" : "Please select item and valid quantity for all lines");
      }
      if (sourceType === "van_sale" && !vanWarehouseId) {
        throw new Error(isArabic ? "يرجى تحديد سيارة التوزيع في حالة البيع عبر سيارة توزيع" : "Please select van warehouse for van sale");
      }
      if (!user?.id) throw new Error("User not authenticated");

      // Generate ZATCA Phase 1 TLV Base64
      const zatcaQrBase64 = generateZatcaTlvBase64({
        sellerName: settings?.name_ar || "مصنع الأسياح للمنظفات",
        vatNumber: settings?.vat_number || "300000000000003",
        timestamp: `${invoiceDate}T12:00:00Z`,
        totalAmount: totalIncVat.toFixed(2),
        vatAmount: vatTotal.toFixed(2),
      });

      const dueDate = new Date(new Date(invoiceDate).getTime() + dueDays * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

      // Call Atomic Sales Invoice RPC
      const { data, error } = await supabase.rpc("rpc_create_sales_invoice", {
        p_customer_id: customerId,
        p_invoice_date: invoiceDate,
        p_due_date: dueDate,
        p_items: lines,
        p_advance_deducted: advanceDeducted,
        p_source_type: sourceType,
        p_van_warehouse_id: sourceType === "van_sale" ? vanWarehouseId || null : null,
        p_assigned_rep_id: assignedRepId || null,
        p_zatca_qr_base64: zatcaQrBase64,
        p_notes: notes || null,
        p_created_by: user.id,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: async (data: any) => {
      toast.success(
        isArabic
          ? `تم ترحيل الفاتورة الضريبية ${data?.invoice_number || ""} بنجاح وسحب FIFO وقيد اليومية المتوازن!`
          : `Tax Invoice ${data?.invoice_number || ""} posted successfully!`
      );
      await queryClient.invalidateQueries({ queryKey: ["sales-invoices-list"] });
      setCreateModalOpen(false);
      // Reset form
      setCustomerId("");
      setLines([]);
      setAdvanceDeducted(0);
      setNotes("");

      // Automatically transition to viewing the newly created invoice with Print / PDF / WhatsApp ready
      if (data?.invoice_id) {
        try {
          const { data: inv } = await supabase
            .from("sales_invoices")
            .select("*, customer:customers(*), lines:sales_invoice_lines(*, item:items(*))")
            .eq("id", data.invoice_id)
            .single();
          if (inv) {
            setSelectedInvoice(inv as unknown as SalesInvoice);
          }
        } catch (err) {
          console.error("Auto open invoice error:", err);
        }
      }
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    },
  });

  const filteredInvoices = invoices?.filter((inv) => {
    const term = searchTerm.toLowerCase();
    const custName = inv.customer?.name_ar?.toLowerCase() || "";
    return inv.invoice_number.toLowerCase().includes(term) || custName.includes(term);
  });

  // Material Design 3 KPI Metrics
  const totalSalesAll = invoices?.reduce((sum, inv) => sum + (inv.total_amount_inc_vat || 0), 0) || 0;
  const totalVatAll = invoices?.reduce((sum, inv) => sum + (inv.vat_amount || 0), 0) || 0;
  const totalNetDueAll = invoices?.reduce((sum, inv) => sum + (inv.net_amount_due || 0), 0) || 0;
  const totalCountAll = invoices?.length || 0;

  // In-Page Canvas View for Tax Invoice Inspection & Actions
  if (selectedInvoice) {
    const cust = selectedInvoice.customer;
    return (
      <div className="space-y-6 max-w-5xl mx-auto pb-16 animate-in fade-in duration-200">
        {/* Top Header Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3">
            <Button
              variant="tonal"
              size="sm"
              onClick={() => setSelectedInvoice(null)}
              className="gap-1.5"
            >
              <ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
              <span>{isArabic ? "العودة لقائمة الفواتير" : "Back to Invoices"}</span>
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-sky-600" />
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  {selectedInvoice.invoice_number}
                </h1>
                <Badge variant="emerald" className="text-xs">
                  {isArabic ? "فاتورة ضريبية رسمية" : "Tax Invoice"}
                </Badge>
                {selectedInvoice.source_type === "van_sale" && (
                  <Badge variant="outline" className="border-amber-400 text-amber-800 bg-amber-50 text-xs">
                    <Truck className="h-3 w-3 me-1" />
                    مبيعات سيارة توزيع
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                تاريخ الإصدار: {selectedInvoice.invoice_date} • العميل: {cust?.name_ar || cust?.name_en || "-"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            <TaxInvoicePrint invoice={selectedInvoice} settings={settings || null} />
            <Button variant="outline" size="sm" onClick={() => setSelectedInvoice(null)}>
              {t("common.close")}
            </Button>
          </div>
        </div>

        {/* 2-Column Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Info (2 Cols) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Customer Details Card */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-800 flex items-center justify-between">
                  <span>بيانات العميل والضريبة (B2B / B2C)</span>
                  <span className="font-mono text-xs text-slate-500 font-normal">كود: {cust?.code || "-"}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-500 block mb-1">اسم المنشأة / العميل:</span>
                  <strong className="text-slate-900 text-sm">{cust?.name_ar || cust?.name_en || "-"}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">الرقم الضريبي للعميل (VAT):</span>
                  <strong className="font-mono text-slate-900 text-sm">{cust?.vat_number || "غير مسجل ضريبياً (مستهلك نهائي)"}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">رقم الجوال والتواصل:</span>
                  <strong className="font-mono text-slate-800">{cust?.phone || "-"}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">العنوان الوطني المعتمد:</span>
                  <span className="text-slate-800">{cust?.national_address || "-"}</span>
                </div>
              </CardContent>
            </Card>

            {/* Line Items Table Card */}
            <Card className="border-slate-200 shadow-sm overflow-hidden">
              <CardHeader className="py-3 px-4 border-b border-slate-100 bg-slate-50">
                <CardTitle className="text-sm font-bold text-slate-800">
                  أصناف ومنتجات الفاتورة ({selectedInvoice.lines?.length || 0} صنف)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-start">
                    <thead className="bg-slate-100/75 text-slate-700 border-b border-slate-200 font-semibold">
                      <tr>
                        <th className="py-2.5 px-3 text-start">المنتج / الصنف</th>
                        <th className="py-2.5 px-3 text-center">الكمية</th>
                        <th className="py-2.5 px-3 text-center">الوحدة</th>
                        <th className="py-2.5 px-3 text-end">سعر الوحدة</th>
                        <th className="py-2.5 px-3 text-end">المجموع قبل الضريبة</th>
                        <th className="py-2.5 px-3 text-end">الضريبة 15%</th>
                        <th className="py-2.5 px-3 text-end">الإجمالي شامل</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedInvoice.lines?.map((line, idx) => (
                        <tr key={line.id || idx} className="hover:bg-slate-50/50">
                          <td className="py-2.5 px-3 font-medium text-slate-900">
                            <div>{isArabic ? line.item?.name_ar : line.item?.name_en}</div>
                            <span className="font-mono text-[10px] text-slate-400">SKU: {line.item?.sku}</span>
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold">
                            {line.quantity}
                          </td>
                          <td className="py-2.5 px-3 text-center text-slate-600">
                            {line.unit_type === "carton" ? "كرتون" : "حبة"}
                          </td>
                          <td className="py-2.5 px-3 text-end font-mono">
                            {line.unit_price_ex_vat.toFixed(2)} ر.س
                          </td>
                          <td className="py-2.5 px-3 text-end font-mono">
                            {line.total_price_ex_vat.toFixed(2)} ر.س
                          </td>
                          <td className="py-2.5 px-3 text-end font-mono text-slate-600">
                            {line.vat_amount.toFixed(2)} ر.س
                          </td>
                          <td className="py-2.5 px-3 text-end font-mono font-bold text-slate-900">
                            {line.total_line_inc_vat.toFixed(2)} ر.س
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Side Column: Totals & ZATCA QR (1 Col) */}
          <div className="space-y-6">
            {/* Totals Summary Card */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-800">الملخص المالي والضريبي</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3 text-xs">
                <div className="flex justify-between items-center text-slate-600">
                  <span>المجموع الخاضع للضريبة:</span>
                  <span className="font-mono font-semibold text-slate-900">{selectedInvoice.total_amount_ex_vat.toFixed(2)} ر.س</span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>ضريبة القيمة المضافة (15%):</span>
                  <span className="font-mono font-semibold text-slate-900">{selectedInvoice.vat_amount.toFixed(2)} ر.س</span>
                </div>
                <div className="flex justify-between items-center text-slate-600 pt-1 border-t border-slate-100 font-bold">
                  <span>الإجمالي شامل الضريبة:</span>
                  <span className="font-mono text-slate-900">{selectedInvoice.total_amount_inc_vat.toFixed(2)} ر.س</span>
                </div>
                {selectedInvoice.advance_deducted > 0 && (
                  <div className="flex justify-between items-center text-sky-700">
                    <span>العربون المخصوم:</span>
                    <span className="font-mono font-bold">-{selectedInvoice.advance_deducted.toFixed(2)} ر.س</span>
                  </div>
                )}
                <div className="flex justify-between items-center p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm font-bold mt-2">
                  <span className="text-emerald-950">صافي المستحق للسداد:</span>
                  <span className="font-mono text-emerald-700 text-base">{selectedInvoice.net_amount_due.toFixed(2)} ر.س</span>
                </div>

                <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-500 space-y-1">
                  <div className="flex justify-between">
                    <span>حالة السداد:</span>
                    <span className="font-semibold text-slate-800">
                      {selectedInvoice.payment_status === "paid" ? "مسددة بالكامل" : selectedInvoice.payment_status === "partially_paid" ? "مسددة جزئياً" : "غير مسددة (آجل)"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>سجل طباعة الفاتورة:</span>
                    <span className="font-mono">{selectedInvoice.print_count} مرات</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ZATCA QR Card */}
            <Card className="border-slate-200 shadow-sm p-4 text-center space-y-3">
              <span className="text-xs font-bold text-slate-700 block">رمز الاستجابة السريع للفوترة (ZATCA QR)</span>
              <div className="flex justify-center p-2 bg-white rounded-lg border border-slate-100 shadow-inner">
                {selectedInvoice.zatca_qr_base64 ? (
                  <ZatcaQrPreview qrBase64={selectedInvoice.zatca_qr_base64} />
                ) : (
                  <div className="text-slate-400 text-xs p-4">لا يتوفر كود QR مشفر</div>
                )}
              </div>
              <p className="text-[10px] text-slate-400 leading-tight">
                مشفر بتقنية TLV ومتوافق مع متطلبات هيئة الزكاة والضريبة والجمارك المرحلة الأولى
              </p>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // In-Page Canvas View for Invoice Creation (Eliminating modal popup)
  if (createModalOpen) {
    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* In-page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <Button
              variant="tonal"
              size="sm"
              onClick={() => setCreateModalOpen(false)}
              className="gap-1.5"
            >
              <ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
              <span>{isArabic ? "العودة لقائمة الفواتير" : "Back to Invoices"}</span>
            </Button>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
                <Receipt className="h-5 w-5 text-sky-600" />
                <span>{t("sales.createInvoice")}</span>
              </h1>
              <p className="text-xs text-slate-500">
                إصدار فاتورة ضريبية رسمية متوافقة مع ZATCA Phase 1 مع سحب المخزون وقيد اليومية
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setCreateModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={createInvoiceMutation.isPending}
              onClick={() => createInvoiceMutation.mutate()}
              className="bg-slate-900 hover:bg-slate-800 text-white min-h-[40px] px-5"
            >
              {createInvoiceMutation.isPending ? t("common.saving") : "ترحيل وإصدار الفاتورة الضريبية"}
            </Button>
          </div>
        </div>

        {/* Form Body in Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Column: Details & Line Items */}
          <div className="lg:col-span-2 space-y-6">
            {/* Customer & Logistics Card */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Building className="h-4 w-4 text-sky-600" />
                  <span>بيانات العميل والشحن</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs font-semibold">العميل *</Label>
                    <Select value={customerId} onValueChange={setCustomerId}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="اختر العميل..." />
                      </SelectTrigger>
                      <SelectContent>
                        {customers?.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {isArabic ? c.name_ar : c.name_en} ({c.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">{t("sales.invoiceDate")} *</Label>
                    <Input
                      type="date"
                      value={invoiceDate}
                      onChange={(e) => setInvoiceDate(e.target.value)}
                      className="mt-1 font-mono"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">فترة السداد (أيام)</Label>
                    <Input
                      type="number"
                      value={dueDays}
                      onChange={(e) => setDueDays(Number(e.target.value))}
                      min={0}
                      className="mt-1 font-mono tabular-nums"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div>
                    <Label className="text-xs font-semibold">{t("sales.sourceType")} *</Label>
                    <Select
                      value={sourceType}
                      onValueChange={(val: "direct" | "van_sale") => setSourceType(val)}
                    >
                      <SelectTrigger className="mt-1 bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="direct">مستودع المصنع الرئيسي</SelectItem>
                        <SelectItem value="van_sale">سيارة توزيع مندوب</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {sourceType === "van_sale" && (
                    <div>
                      <Label className="text-xs font-semibold">سيارة التوزيع *</Label>
                      <Select value={vanWarehouseId} onValueChange={setVanWarehouseId}>
                        <SelectTrigger className="mt-1 bg-white">
                          <SelectValue placeholder="اختر سيارة التوزيع..." />
                        </SelectTrigger>
                        <SelectContent>
                          {vans?.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.name_ar} ({v.code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div>
                    <Label className="text-xs font-semibold">مندوب المبيعات (للعمولة)</Label>
                    <Select value={assignedRepId} onValueChange={setAssignedRepId}>
                      <SelectTrigger className="mt-1 bg-white">
                        <SelectValue placeholder="اختر المندوب..." />
                      </SelectTrigger>
                      <SelectContent>
                        {reps?.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Line Items Card */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-sky-600" />
                    <span>أصناف الفاتورة والكميات والأسعار</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 mt-0.5">
                    إدراج المنتجات التامة مع مراقبة حارس الهامش اللحظي (FIFO Margin Guard)
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() =>
                    setLines([
                      ...lines,
                      {
                        item_id: "",
                        quantity: 10,
                        unit_type: "carton",
                        unit_price_ex_vat: 65.0,
                        is_bonus_or_sample: false,
                      },
                    ])
                  }
                  className="text-xs text-sky-700 border-sky-300 hover:bg-sky-50"
                >
                  <Plus className="me-1 h-3.5 w-3.5" />
                  إضافة صنف
                </Button>
              </CardHeader>
              <CardContent className="pt-4">
                {lines.length === 0 ? (
                  <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-xl text-slate-400">
                    <Receipt className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600">لا توجد أصناف في الفاتورة بعد</p>
                    <p className="text-xs text-slate-400 mt-1">اضغط زر "إضافة صنف" أعلاه لإدراج المنتجات التامة والكميات</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {lines.map((line, idx) => {
                      const selectedItem = finishedGoods?.find((fg) => fg.id === line.item_id);
                      const activeLayer = selectedItem?.fifo_layers?.find((l: any) => l.remaining_qty > 0) || selectedItem?.fifo_layers?.[0];
                      const itemCost = activeLayer?.unit_cost_ex_vat ? Number(activeLayer.unit_cost_ex_vat) : 0;
                      const isBelowCost = line.unit_price_ex_vat > 0 && itemCost > 0 && line.unit_price_ex_vat < itemCost && !line.is_bonus_or_sample;
                      const marginPercent = line.unit_price_ex_vat > 0 && itemCost > 0
                        ? (((line.unit_price_ex_vat - itemCost) / line.unit_price_ex_vat) * 100).toFixed(0)
                        : null;

                      return (
                        <div
                          key={idx}
                          className={`p-3 rounded-xl border transition-all ${
                            isBelowCost
                              ? "bg-rose-50/80 border-rose-300 ring-1 ring-rose-300"
                              : "bg-slate-50 border-slate-200"
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                            {/* Product Selection */}
                            <div className="flex-1">
                              <Label className="text-[11px] text-slate-500 mb-1 block">المنتج التام *</Label>
                              <Select
                                value={line.item_id}
                                onValueChange={(val) => {
                                  const updated = [...lines];
                                  updated[idx].item_id = val;
                                  setLines(updated);
                                }}
                              >
                                <SelectTrigger className="bg-white">
                                  <SelectValue placeholder="اختر المنتج التام..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {finishedGoods?.map((item) => (
                                    <SelectItem key={item.id} value={item.id}>
                                      {isArabic ? item.name_ar : item.name_en} ({item.sku})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Quantity */}
                            <div className="w-full sm:w-28">
                              <Label className="text-[11px] text-slate-500 mb-1 block">الكمية *</Label>
                              <Input
                                type="number"
                                value={line.quantity || ""}
                                onChange={(e) => {
                                  const updated = [...lines];
                                  updated[idx].quantity = Number(e.target.value);
                                  setLines(updated);
                                }}
                                min={1}
                                className="font-mono tabular-nums bg-white text-center"
                              />
                            </div>

                            {/* Unit */}
                            <div className="w-full sm:w-28">
                              <Label className="text-[11px] text-slate-500 mb-1 block">الوحدة *</Label>
                              <Select
                                value={line.unit_type}
                                onValueChange={(val: "carton" | "piece") => {
                                  const updated = [...lines];
                                  updated[idx].unit_type = val;
                                  setLines(updated);
                                }}
                              >
                                <SelectTrigger className="bg-white">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="carton">كرتون</SelectItem>
                                  <SelectItem value="piece">حبة / مفرد</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Price Ex VAT */}
                            <div className="w-full sm:w-36">
                              <Label className="text-[11px] text-slate-500 mb-1 block">السعر (ر.س قبل الضريبة) *</Label>
                              <Input
                                type="number"
                                value={line.unit_price_ex_vat || ""}
                                onChange={(e) => {
                                  const updated = [...lines];
                                  updated[idx].unit_price_ex_vat = Number(e.target.value);
                                  setLines(updated);
                                }}
                                min={0}
                                step="0.5"
                                disabled={line.is_bonus_or_sample}
                                className="font-mono tabular-nums bg-white text-center font-bold"
                              />
                            </div>

                            {/* Free Sample Checkbox */}
                            <div className="flex items-center gap-1.5 pt-5 sm:pt-4">
                              <input
                                type="checkbox"
                                id={`bonus-${idx}`}
                                checked={line.is_bonus_or_sample}
                                onChange={(e) => {
                                  const updated = [...lines];
                                  updated[idx].is_bonus_or_sample = e.target.checked;
                                  if (e.target.checked) updated[idx].unit_price_ex_vat = 0;
                                  setLines(updated);
                                }}
                                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 h-4 w-4"
                              />
                              <Label htmlFor={`bonus-${idx}`} className="text-xs cursor-pointer text-slate-700 whitespace-nowrap">
                                عينة مجانية
                              </Label>
                            </div>

                            {/* Delete Line */}
                            <div className="pt-5 sm:pt-4">
                              <Button
                                size="icon"
                                variant="ghost"
                                type="button"
                                onClick={() => {
                                  const updated = lines.filter((_, i) => i !== idx);
                                  setLines(updated);
                                }}
                                className="text-rose-500 hover:bg-rose-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          {/* Live Margin Guard Feedback */}
                          {isBelowCost && (
                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 mt-2 rounded-lg bg-rose-100 text-rose-800 text-xs font-semibold border border-rose-300">
                              <AlertTriangle className="h-4 w-4 text-rose-600 flex-shrink-0 animate-pulse" />
                              <span>
                                {isArabic
                                  ? `حارس الهامش: السعر (${line.unit_price_ex_vat} ر.س) أقل من آخر تكلفة FIFO (${itemCost.toFixed(2)} ر.س) — هامش ربح سالب!`
                                  : `Margin Guard Alert: Price (${line.unit_price_ex_vat} SAR) is below FIFO cost (${itemCost.toFixed(2)} SAR)!`}
                              </span>
                            </div>
                          )}
                          {!isBelowCost && marginPercent && !line.is_bonus_or_sample && (
                            <div className="flex items-center gap-2 mt-2 px-1 text-xs text-emerald-700">
                              <span>{isArabic ? "هامش ربح إيجابي:" : "Profit Margin:"}</span>
                              <span className="font-mono font-bold">+{marginPercent}%</span>
                              <span className="text-slate-400 text-[11px]">
                                ({isArabic ? "تكلفة الوحدة:" : "Unit Cost:"} {itemCost.toFixed(2)} ر.س)
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Side Column: Summary & Advance Deposit */}
          <div className="space-y-6">
            <Card className="border-slate-200 shadow-sm sticky top-6">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                  <span>الملخص المالي والضريبة</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                {/* Advance Deposit Deduction */}
                <div className="bg-sky-50 p-3 rounded-xl border border-sky-100 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-sky-900 text-xs">خصم العربون / الدفعة المقدمة:</span>
                  </div>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={advanceDeducted || ""}
                    onChange={(e) => setAdvanceDeducted(Number(e.target.value))}
                    className="bg-white font-mono text-end font-bold"
                  />
                  <p className="text-[11px] text-slate-500">
                    إذا كان للعميل رصيد دائن في حساب 2102 يتم تسويته مباشرة
                  </p>
                </div>

                {/* Calculation breakdown */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2.5">
                  <div className="flex justify-between text-slate-600">
                    <span>الإجمالي قبل الضريبة:</span>
                    <span className="font-mono font-bold tabular-nums text-slate-900">{subtotalExVat.toFixed(2)} ر.س</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>ضريبة القيمة المضافة (15%):</span>
                    <span className="font-mono font-bold tabular-nums text-slate-900">{vatTotal.toFixed(2)} ر.س</span>
                  </div>
                  {advanceDeducted > 0 && (
                    <div className="flex justify-between text-sky-700">
                      <span>خصم الدفعة المقدمة:</span>
                      <span className="font-mono font-bold tabular-nums">-{advanceDeducted.toFixed(2)} ر.س</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-bold text-slate-900">
                    <span>المجموع شامل الضريبة:</span>
                    <span className="font-mono tabular-nums">{totalIncVat.toFixed(2)} ر.س</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-extrabold text-emerald-700">
                    <span>صافي المستحق للسداد:</span>
                    <span className="font-mono tabular-nums">{netDue.toFixed(2)} ر.س</span>
                  </div>
                </div>

                <div className="pt-2 space-y-2">
                  <Button
                    disabled={createInvoiceMutation.isPending}
                    onClick={() => createInvoiceMutation.mutate()}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white min-h-[46px] font-bold"
                  >
                    {createInvoiceMutation.isPending ? t("common.saving") : "ترحيل وإصدار الفاتورة الضريبية"}
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Receipt className="h-6 w-6 text-sky-600" />
            <span>{t("sales.invoicesTitle")}</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            {t("sales.invoicesSubtitle")}
          </p>
        </div>

        {(isOwner || isAccountant) && (
          <Button
            onClick={() => setCreateModalOpen(true)}
            className="bg-slate-900 hover:bg-slate-800 text-white min-h-[44px]"
          >
            <Plus className="me-2 h-4 w-4" />
            <span>{t("sales.createInvoice")}</span>
          </Button>
        )}
      </div>

      {/* 2026 Modern Industrial KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <div className="stat-card-2026 accent-indigo">
          <span className="text-xs font-bold text-slate-500 tracking-tight block mb-1">
            {isArabic ? "إجمالي المبيعات شامل الضريبة" : "Total Sales (Inc. VAT)"}
          </span>
          <div className="text-xl sm:text-2xl font-black font-mono text-slate-900 tabular-nums tracking-tight">
            {totalSalesAll.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س
          </div>
          <div className="mt-2 text-[11px] text-indigo-700 font-semibold bg-indigo-50 px-2 py-0.5 rounded-full inline-block border border-indigo-200/60">
            {isArabic ? "مبيعات معتمدة" : "Gross Revenue"}
          </div>
        </div>

        <div className="stat-card-2026 accent-sky">
          <span className="text-xs font-bold text-slate-500 tracking-tight block mb-1">
            {isArabic ? "ضريبة القيمة المضافة (15%)" : "Total VAT (15%)"}
          </span>
          <div className="text-xl sm:text-2xl font-black font-mono text-sky-700 tabular-nums tracking-tight">
            {totalVatAll.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س
          </div>
          <div className="mt-2 text-[11px] text-sky-700 font-semibold bg-sky-50 px-2 py-0.5 rounded-full inline-block border border-sky-200/60">
            {isArabic ? "إقرار ZATCA" : "Output VAT"}
          </div>
        </div>

        <div className="stat-card-2026 accent-emerald">
          <span className="text-xs font-bold text-slate-500 tracking-tight block mb-1">
            {isArabic ? "صافي المستحق للتحصيل" : "Net Due Amount"}
          </span>
          <div className="text-xl sm:text-2xl font-black font-mono text-emerald-700 tabular-nums tracking-tight">
            {totalNetDueAll.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س
          </div>
          <div className="mt-2 text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full inline-block border border-emerald-200/60">
            {isArabic ? "رصيد المدينين" : "Receivables"}
          </div>
        </div>

        <div className="stat-card-2026 accent-amber">
          <span className="text-xs font-bold text-slate-500 tracking-tight block mb-1">
            {isArabic ? "إجمالي عدد الفواتير" : "Total Invoices Count"}
          </span>
          <div className="text-xl sm:text-2xl font-black font-mono text-slate-800 tabular-nums tracking-tight">
            {totalCountAll} {isArabic ? "فاتورة" : "Invoices"}
          </div>
          <div className="mt-2 text-[11px] text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded-full inline-block border border-amber-200/60">
            {isArabic ? "سجل الفوترة" : "Invoiced"}
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder={isArabic ? "بحث برقم الفاتورة أو اسم العميل..." : "Search invoice # or client..."}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="ps-9 bg-white"
        />
      </div>

      {/* Invoices Table */}
      <Card className="border-industrial-border bg-white shadow-sm">
        <CardContent className="p-0">
          <div
            className="table-accessible-wrapper heavy-section-deferred"
            tabIndex={0}
            role="region"
            aria-label={isArabic ? "جدول فواتير المبيعات الضريبية" : "Tax Sales Invoices Table"}
          >
            <table className="w-full text-xs text-start">
              <caption className="sr-only">
                {isArabic ? "قائمة فواتير المبيعات الضريبية" : "Tax Sales Invoices List"}
              </caption>
              <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold sticky top-0 z-10">
                <tr>
                  <th scope="col" className="py-2.5 px-3">{t("sales.invoiceNumber")}</th>
                  <th scope="col" className="py-2.5 px-3">{t("sales.invoiceDate")}</th>
                  <th scope="col" className="py-2.5 px-3">العميل</th>
                  <th scope="col" className="py-2.5 px-3">المصدر</th>
                  <th scope="col" className="py-2.5 px-3 text-end">قبل الضريبة</th>
                  <th scope="col" className="py-2.5 px-3 text-end">ضريبة 15%</th>
                  <th scope="col" className="py-2.5 px-3 text-end">العربون</th>
                  <th scope="col" className="py-2.5 px-3 text-end">صافي المستحق</th>
                  <th scope="col" className="py-2.5 px-3 text-center">{t("common.status")}</th>
                  <th scope="col" className="py-2.5 px-3 text-center">إجراءات الفاتورة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  [1, 2, 3].map((i) => (
                    <tr key={i}>
                      <td colSpan={10} className="py-4 px-3">
                        <Skeleton className="h-6 w-full" />
                      </td>
                    </tr>
                  ))
                ) : filteredInvoices?.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-400">
                      لا توجد فواتير مبيعات مسجلة
                    </td>
                  </tr>
                ) : (
                  filteredInvoices?.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-3 font-mono font-bold">
                        <button
                          type="button"
                          onClick={() => setSelectedInvoice(inv)}
                          className="text-sky-700 hover:text-sky-900 hover:underline flex items-center gap-1.5 cursor-pointer text-start"
                          title={isArabic ? "معاينة الفاتورة بالتفصيل" : "View Invoice Details"}
                        >
                          <Eye className="h-3.5 w-3.5 text-sky-500" />
                          <span>{inv.invoice_number}</span>
                        </button>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {inv.invoice_date}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">
                        {inv.customer ? (isArabic ? inv.customer.name_ar : inv.customer.name_en) : "-"}
                      </td>
                      <td className="py-2.5 px-3">
                        {inv.source_type === "van_sale" ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                            <Truck className="h-3 w-3" />
                            سيارة توزيع
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-600">مستودع المصنع</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono tabular-nums">
                        {inv.total_amount_ex_vat.toFixed(2)} ر.س
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono tabular-nums text-slate-700">
                        {inv.vat_amount.toFixed(2)} ر.س
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono tabular-nums text-sky-700">
                        {inv.advance_deducted > 0 ? `-${inv.advance_deducted.toFixed(2)}` : "-"}
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono tabular-nums font-bold text-slate-900">
                        {inv.net_amount_due.toFixed(2)} ر.س
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge variant="emerald" className="text-[10px]">
                          معتمدة ومرحلة
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedInvoice(inv)}
                            className="h-8 px-2 text-xs font-semibold text-sky-700 hover:bg-sky-50"
                            title="معاينة الفاتورة كاملة"
                          >
                            <Eye className="h-3.5 w-3.5 me-1" />
                            <span>معاينة</span>
                          </Button>
                          <TaxInvoicePrint invoice={inv} settings={settings || null} compact />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
