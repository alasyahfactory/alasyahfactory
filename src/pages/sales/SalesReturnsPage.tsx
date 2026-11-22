import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import type { SalesReturn, Customer, Item, FactorySettings, SalesInvoice } from "@/types/database";
import { TaxInvoicePrint } from "@/components/sales/TaxInvoicePrint";
import { generateZatcaTlvBase64 } from "@/lib/zatca";

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
  RotateCcw,
  Plus,
  Search,
  Printer,
  CheckCircle2,
  AlertTriangle,
  Building,
  Trash2,
  ArrowRight,
  Eye,
  FileDown,
  Share2,
} from "lucide-react";

export function SalesReturnsPage() {
  const { t, i18n } = useTranslation();
  const { user, isOwner, isAccountant } = useAuth();
  const queryClient = useQueryClient();
  const isArabic = i18n.language === "ar";

  const [searchTerm, setSearchTerm] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState<SalesReturn | null>(null);

  // Form State
  const [customerId, setCustomerId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");

  const [lines, setLines] = useState<
    Array<{
      item_id: string;
      quantity: number;
      unit_type: "carton" | "piece";
      unit_price_ex_vat: number;
      return_condition: "sellable" | "damaged";
    }>
  >([]);

  // 1. Fetch Sales Returns
  const { data: returns, isLoading } = useQuery<SalesReturn[]>({
    queryKey: ["sales-returns-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_returns")
        .select(`
          *,
          customer:customers(id, code, name_ar, name_en, phone, vat_number, national_address),
          lines:sales_return_lines(
            id,
            item_id,
            quantity,
            unit_type,
            unit_price_ex_vat,
            total_price_ex_vat,
            vat_amount,
            total_line_inc_vat,
            return_condition,
            item:items(id, sku, name_ar, name_en)
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as SalesReturn[];
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

  // 3. Fetch Finished Goods
  const { data: finishedGoods } = useQuery<Item[]>({
    queryKey: ["items-fg-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .eq("item_type", "finished_good")
        .eq("is_active", true)
        .order("name_ar");
      if (error) throw error;
      return data || [];
    },
    enabled: createModalOpen,
  });

  // 4. Fetch Customer Invoices for referencing
  const { data: customerInvoices } = useQuery<SalesInvoice[]>({
    queryKey: ["customer-invoices-ref", customerId],
    queryFn: async () => {
      if (!customerId) return [];
      const { data, error } = await supabase
        .from("sales_invoices")
        .select("id, invoice_number, invoice_date, total_amount_inc_vat")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as SalesInvoice[];
    },
    enabled: !!customerId,
  });

  // 5. Fetch Settings
  const { data: settings } = useQuery<FactorySettings | null>({
    queryKey: ["factory-settings-returns"],
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

  // Calculate totals
  let subtotalExVat = 0;
  let vatTotal = 0;
  lines.forEach((l) => {
    const lineEx = l.quantity * l.unit_price_ex_vat;
    subtotalExVat += lineEx;
    vatTotal += lineEx * 0.15;
  });
  const grandTotal = subtotalExVat + vatTotal;

  // Create Return Mutation
  const createReturnMutation = useMutation({
    mutationFn: async () => {
      if (!customerId || lines.length === 0) {
        throw new Error(isArabic ? "يرجى اختيار العميل وإضافة صنف واحد على الأقل للمرتجع" : "Please select customer and items");
      }
      const invalidLine = lines.find((l) => !l.item_id || l.quantity <= 0);
      if (invalidLine) {
        throw new Error(isArabic ? "يرجى اختيار المنتج وتحديد كمية صالحة لجميع الأصناف المرتجعة" : "Please select item and valid quantity for all lines");
      }
      if (!user?.id) throw new Error("User not authenticated");

      const zatcaQr = generateZatcaTlvBase64({
        sellerName: settings?.name_ar || "مصنع الأسياح للمنظفات",
        vatNumber: settings?.vat_number || "300000000000003",
        timestamp: `${returnDate}T12:00:00Z`,
        totalAmount: grandTotal.toFixed(2),
        vatAmount: vatTotal.toFixed(2),
      });

      const { data, error } = await supabase.rpc("rpc_create_sales_return", {
        p_invoice_id: invoiceId || null,
        p_customer_id: customerId,
        p_return_date: returnDate,
        p_items: lines,
        p_zatca_qr_base64: zatcaQr,
        p_notes: notes || null,
        p_created_by: user.id,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: async (data: any) => {
      toast.success(
        isArabic
          ? `تم ترحيل الإشعار الدائن ${data?.return_number || ""} بنجاح وإعادة البضاعة وتخفيض ذمة العميل والضريبة!`
          : "Credit Note created and posted successfully!"
      );
      await queryClient.invalidateQueries({ queryKey: ["sales-returns-list"] });
      setCreateModalOpen(false);
      setCustomerId("");
      setInvoiceId("");
      setLines([]);
      setNotes("");

      if (data?.return_id) {
        try {
          const { data: ret } = await supabase
            .from("sales_returns")
            .select("*, customer:customers(*), lines:sales_return_lines(*, item:items(*))")
            .eq("id", data.return_id)
            .single();
          if (ret) {
            setSelectedReturn(ret as unknown as SalesReturn);
          }
        } catch (err) {
          console.error("Auto open return error:", err);
        }
      }
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    },
  });

  const filteredReturns = returns?.filter((r) => {
    const term = searchTerm.toLowerCase();
    const custName = r.customer?.name_ar?.toLowerCase() || "";
    return r.return_number.toLowerCase().includes(term) || custName.includes(term);
  });

  // Material Design 3 In-Page Canvas View for Sales Return Credit Note Inspection
  if (selectedReturn) {
    const cust = selectedReturn.customer;
    const mockInvoice: any = {
      invoice_number: selectedReturn.return_number,
      invoice_date: selectedReturn.return_date,
      due_date: selectedReturn.return_date,
      source_type: "direct",
      total_amount_ex_vat: selectedReturn.total_ex_vat,
      vat_amount: selectedReturn.vat_amount,
      total_amount_inc_vat: selectedReturn.grand_total,
      advance_deducted: 0,
      net_amount_due: selectedReturn.grand_total,
      status: "posted",
      zatca_qr_base64: selectedReturn.zatca_qr_base64,
      print_count: 1,
      customer: selectedReturn.customer,
      lines: selectedReturn.lines?.map((l: any) => ({
        id: l.id,
        item: l.item,
        quantity: l.quantity,
        unit_type: l.unit_type,
        unit_price_ex_vat: l.unit_price_ex_vat,
        total_price_ex_vat: l.total_price_ex_vat,
        vat_amount: l.vat_amount,
        total_line_inc_vat: l.total_line_inc_vat,
        is_bonus_or_sample: false,
      })),
    };

    return (
      <div className="space-y-6 max-w-5xl mx-auto pb-16 animate-in fade-in duration-200">
        {/* Top Header Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3">
            <Button
              variant="tonal"
              size="sm"
              onClick={() => setSelectedReturn(null)}
              className="gap-1.5"
            >
              <ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
              <span>{isArabic ? "العودة لقائمة المرتجعات" : "Back to Returns"}</span>
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <RotateCcw className="h-5 w-5 text-rose-600" />
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  {selectedReturn.return_number}
                </h1>
                <Badge variant="rose" className="text-xs">
                  إشعار دائن ضريبي معتمد
                </Badge>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                تاريخ المرتجع: {selectedReturn.return_date} • العميل: {cust?.name_ar || cust?.name_en || "-"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            <TaxInvoicePrint invoice={mockInvoice} settings={settings || null} isCreditNote />
            <Button variant="outline" size="sm" onClick={() => setSelectedReturn(null)}>
              {t("common.close")}
            </Button>
          </div>
        </div>

        {/* 2-Column Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Customer Details Card */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-800 flex items-center justify-between">
                  <span>بيانات العميل والإشعار الدائن</span>
                  <span className="font-mono text-xs text-slate-500 font-normal">كود: {cust?.code || "-"}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-500 block mb-1">اسم العميل:</span>
                  <strong className="text-slate-900 text-sm">{cust?.name_ar || cust?.name_en || "-"}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">الرقم الضريبي (VAT):</span>
                  <strong className="font-mono text-slate-900 text-sm">{cust?.vat_number || "مستهلك نهائي"}</strong>
                </div>
              </CardContent>
            </Card>

            {/* Line Items Table Card */}
            <Card className="border-slate-200 shadow-sm overflow-hidden">
              <CardHeader className="py-3 px-4 border-b border-slate-100 bg-slate-50">
                <CardTitle className="text-sm font-bold text-slate-800">
                  الأصناف المرتجعة ({selectedReturn.lines?.length || 0} صنف)
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
                        <th className="py-2.5 px-3 text-center">حالة البضاعة</th>
                        <th className="py-2.5 px-3 text-end">سعر الوحدة</th>
                        <th className="py-2.5 px-3 text-end">تخفيض الضريبة 15%</th>
                        <th className="py-2.5 px-3 text-end">الإجمالي شامل</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedReturn.lines?.map((line: any, idx: number) => (
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
                          <td className="py-2.5 px-3 text-center">
                            {line.return_condition === "sellable" ? (
                              <Badge variant="emerald" className="text-[10px]">
                                سليم (أعيد للمخزن)
                              </Badge>
                            ) : (
                              <Badge variant="rose" className="text-[10px]">
                                تالف (أحيل للهالك 6105)
                              </Badge>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-end font-mono">
                            {line.unit_price_ex_vat.toFixed(2)} ر.س
                          </td>
                          <td className="py-2.5 px-3 text-end font-mono text-rose-600">
                            -{line.vat_amount.toFixed(2)} ر.س
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

          <div className="space-y-6">
            {/* Totals Summary Card */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-800">الملخص المالي للإشعار الدائن</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3 text-xs">
                <div className="flex justify-between items-center text-slate-600">
                  <span>المجموع قبل الضريبة:</span>
                  <span className="font-mono font-semibold text-slate-900">{selectedReturn.total_ex_vat.toFixed(2)} ر.س</span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>تخفيض ضريبة القيمة المضافة:</span>
                  <span className="font-mono font-semibold text-rose-600">-{selectedReturn.vat_amount.toFixed(2)} ر.س</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm font-bold mt-2">
                  <span className="text-rose-950">صافي قيمة الإشعار الدائن:</span>
                  <span className="font-mono text-rose-700 text-base">{selectedReturn.grand_total.toFixed(2)} ر.س</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Material Design 3 In-Page Canvas View for Sales Return Creation (Eliminating modal popup)
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
              <span>{isArabic ? "العودة لقائمة المرتجعات" : "Back to Returns"}</span>
            </Button>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
                <RotateCcw className="h-5 w-5 text-rose-600" />
                <span>{t("sales.createReturn")}</span>
              </h1>
              <p className="text-xs text-slate-500">
                إصدار إشعار دائن ضريبي معتمد وتحديد حالة المرتجع لإرجاعه لمخزون الـ FIFO أو ترحيله لمصروف الهالك
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setCreateModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={createReturnMutation.isPending}
              onClick={() => createReturnMutation.mutate()}
              className="bg-rose-600 hover:bg-rose-700 text-white min-h-[40px] px-5"
            >
              {createReturnMutation.isPending ? t("common.saving") : "ترحيل الإشعار الدائن (CN)"}
            </Button>
          </div>
        </div>

        {/* Form Body in Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Customer & Invoice Reference Card */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Building className="h-4 w-4 text-sky-600" />
                  <span>بيانات العميل والفاتورة المرجعية</span>
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
                    <Label className="text-xs font-semibold">الفاتورة المرجعية (اختياري)</Label>
                    <Select value={invoiceId} onValueChange={setInvoiceId}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="اختر الفاتورة..." />
                      </SelectTrigger>
                      <SelectContent>
                        {customerInvoices?.map((inv) => (
                          <SelectItem key={inv.id} value={inv.id}>
                            {inv.invoice_number} ({inv.invoice_date} - {inv.total_amount_inc_vat} ر.س)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">تاريخ الإشعار الدائن *</Label>
                    <Input
                      type="date"
                      value={returnDate}
                      onChange={(e) => setReturnDate(e.target.value)}
                      className="mt-1 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-semibold">ملاحظات وسبب الإرجاع</Label>
                  <Input
                    placeholder="سبب إرجاع المنتجات أو تفاصيل المطابقة..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Line Items Card */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <RotateCcw className="h-4 w-4 text-rose-600" />
                    <span>الأصناف المرتجعة وتحديد حالتها</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 mt-0.5">
                    المنتج الصالح يعود لمخزون FIFO والمنتج التالف يُرحل آلياً لمصروف الهالك (6105)
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
                        quantity: 2,
                        unit_type: "carton",
                        unit_price_ex_vat: 65.0,
                        return_condition: "sellable",
                      },
                    ])
                  }
                  className="text-xs text-rose-700 border-rose-300 hover:bg-rose-50"
                >
                  <Plus className="me-1 h-3.5 w-3.5" />
                  إضافة صنف مرتجع
                </Button>
              </CardHeader>
              <CardContent className="pt-4">
                {lines.length === 0 ? (
                  <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-xl text-slate-400">
                    <RotateCcw className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600">لا توجد أصناف مرتجعة بعد</p>
                    <p className="text-xs text-slate-400 mt-1">اضغط زر "إضافة صنف مرتجع" أعلاه لإدراج المنتجات</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {lines.map((line, idx) => (
                      <div
                        key={idx}
                        className="flex flex-col sm:flex-row sm:items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200"
                      >
                        <div className="flex-1">
                          <Label className="text-[11px] text-slate-500 mb-1 block">المنتج *</Label>
                          <Select
                            value={line.item_id}
                            onValueChange={(val) => {
                              const updated = [...lines];
                              updated[idx].item_id = val;
                              setLines(updated);
                            }}
                          >
                            <SelectTrigger className="bg-white">
                              <SelectValue placeholder="اختر المنتج..." />
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
                              <SelectItem value="piece">حبة</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="w-full sm:w-32">
                          <Label className="text-[11px] text-slate-500 mb-1 block">السعر المسترد *</Label>
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
                            className="font-mono tabular-nums bg-white text-center font-bold"
                          />
                        </div>

                        <div className="w-full sm:w-40">
                          <Label className="text-[11px] text-slate-500 mb-1 block">حالة البضاعة *</Label>
                          <Select
                            value={line.return_condition}
                            onValueChange={(val: "sellable" | "damaged") => {
                              const updated = [...lines];
                              updated[idx].return_condition = val;
                              setLines(updated);
                            }}
                          >
                            <SelectTrigger className="bg-white font-semibold">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="sellable">صالح (مخزون)</SelectItem>
                              <SelectItem value="damaged">تالف (هالك 6105)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

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
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Side Column: Totals */}
          <div className="space-y-6">
            <Card className="border-slate-200 shadow-sm sticky top-6">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <RotateCcw className="h-4 w-4 text-rose-600" />
                  <span>قيمة الإشعار الدائن الضريبي</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="bg-rose-50/70 p-4 rounded-xl border border-rose-200 text-xs space-y-2.5">
                  <div className="flex justify-between text-slate-600">
                    <span>الإجمالي قبل الضريبة:</span>
                    <span className="font-mono font-bold tabular-nums text-slate-900">{subtotalExVat.toFixed(2)} ر.س</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>تخفيض ضريبة القيمة المضافة (15%):</span>
                    <span className="font-mono font-bold tabular-nums text-rose-700">{vatTotal.toFixed(2)} ر.س</span>
                  </div>
                  <div className="flex justify-between border-t border-rose-200 pt-2 text-base font-extrabold text-rose-800">
                    <span>إجمالي قيمة الإشعار الدائن:</span>
                    <span className="font-mono tabular-nums">{grandTotal.toFixed(2)} ر.س</span>
                  </div>
                </div>

                <div className="pt-2 space-y-2">
                  <Button
                    disabled={createReturnMutation.isPending}
                    onClick={() => createReturnMutation.mutate()}
                    className="w-full bg-rose-600 hover:bg-rose-700 text-white min-h-[46px] font-bold"
                  >
                    {createReturnMutation.isPending ? t("common.saving") : "ترحيل الإشعار الدائن (CN)"}
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
            <RotateCcw className="h-6 w-6 text-sky-600" />
            <span>{t("sales.returnsTitle")}</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            {t("sales.returnsSubtitle")}
          </p>
        </div>

        {(isOwner || isAccountant) && (
          <Button
            onClick={() => setCreateModalOpen(true)}
            className="bg-slate-900 hover:bg-slate-800 text-white min-h-[44px]"
          >
            <Plus className="me-2 h-4 w-4" />
            <span>{t("sales.createReturn")}</span>
          </Button>
        )}
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder={isArabic ? "بحث برقم الإشعار أو اسم العميل..." : "Search return # or client..."}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="ps-9 bg-white"
        />
      </div>

      {/* Table */}
      <Card className="border-industrial-border bg-white shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold">
                <tr>
                  <th className="py-2.5 px-3">{t("sales.returnNumber")}</th>
                  <th className="py-2.5 px-3">{t("common.date")}</th>
                  <th className="py-2.5 px-3">العميل</th>
                  <th className="py-2.5 px-3 text-end">المجموع غير شامل</th>
                  <th className="py-2.5 px-3 text-end">تخفيض الضريبة 15%</th>
                  <th className="py-2.5 px-3 text-end">الإجمالي شامل</th>
                  <th className="py-2.5 px-3 text-center">{t("common.status")}</th>
                  <th className="py-2.5 px-3 text-center">طباعة A4</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  [1, 2, 3].map((i) => (
                    <tr key={i}>
                      <td colSpan={8} className="py-4 px-3">
                        <Skeleton className="h-6 w-full" />
                      </td>
                    </tr>
                  ))
                ) : filteredReturns?.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      لا توجد إشعارات دائنة مسجلة
                    </td>
                  </tr>
                ) : (
                  filteredReturns?.map((ret) => {
                    const mockInvoice: any = {
                      invoice_number: ret.return_number,
                      invoice_date: ret.return_date,
                      due_date: ret.return_date,
                      source_type: "direct",
                      total_amount_ex_vat: ret.total_ex_vat,
                      vat_amount: ret.vat_amount,
                      total_amount_inc_vat: ret.grand_total,
                      advance_deducted: 0,
                      net_amount_due: ret.grand_total,
                      status: "posted",
                      zatca_qr_base64: ret.zatca_qr_base64,
                      print_count: 1,
                      customer: ret.customer,
                      lines: ret.lines?.map((l: any) => ({
                        id: l.id,
                        item: l.item,
                        quantity: l.quantity,
                        unit_type: l.unit_type,
                        unit_price_ex_vat: l.unit_price_ex_vat,
                        total_price_ex_vat: l.total_price_ex_vat,
                        vat_amount: l.vat_amount,
                        total_line_inc_vat: l.total_line_inc_vat,
                        is_bonus_or_sample: false,
                      })),
                    };

                    return (
                      <tr key={ret.id} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-3 font-mono font-bold text-rose-700">
                          <button
                            type="button"
                            onClick={() => setSelectedReturn(ret)}
                            className="hover:underline inline-flex items-center gap-1.5 text-rose-700 hover:text-rose-900 font-bold"
                            title="معاينة تفاصيل الإشعار الدائن"
                          >
                            <Eye className="h-3.5 w-3.5 text-rose-500" />
                            <span>{ret.return_number}</span>
                          </button>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-600">
                          {ret.return_date}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900">
                          {ret.customer ? (isArabic ? ret.customer.name_ar : ret.customer.name_en) : "-"}
                        </td>
                        <td className="py-2.5 px-3 text-end font-mono tabular-nums">
                          {ret.total_ex_vat.toFixed(2)} ر.س
                        </td>
                        <td className="py-2.5 px-3 text-end font-mono tabular-nums text-slate-700">
                          {ret.vat_amount.toFixed(2)} ر.س
                        </td>
                        <td className="py-2.5 px-3 text-end font-mono tabular-nums font-bold text-rose-600">
                          {ret.grand_total.toFixed(2)} ر.س
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <Badge variant="rose" className="text-[10px]">
                            إشعار دائن مرحل
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs gap-1 text-slate-600 hover:text-slate-900"
                              onClick={() => setSelectedReturn(ret)}
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span>معاينة</span>
                            </Button>
                            <TaxInvoicePrint invoice={mockInvoice} settings={settings || null} isCreditNote={true} compact />
                          </div>
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

    </div>
  );
}
