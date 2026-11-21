import React, { useState } from "react";
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
} from "lucide-react";

export function SalesInvoicesPage() {
  const { t, i18n } = useTranslation();
  const { user, isOwner, isAccountant } = useAuth();
  const queryClient = useQueryClient();
  const isArabic = i18n.language === "ar";

  const [searchTerm, setSearchTerm] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);

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
    onSuccess: (data: any) => {
      toast.success(
        isArabic
          ? `تم ترحيل الفاتورة الضريبية ${data?.invoice_number || ""} بنجاح وسحب FIFO وقيد اليومية المتوازن!`
          : `Tax Invoice ${data?.invoice_number || ""} posted successfully!`
      );
      queryClient.invalidateQueries({ queryKey: ["sales-invoices-list"] });
      setCreateModalOpen(false);
      // Reset form
      setCustomerId("");
      setLines([]);
      setAdvanceDeducted(0);
      setNotes("");
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
                  <th scope="col" className="py-2.5 px-3 text-center">طباعة A4</th>
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
                      <td className="py-2.5 px-3 font-mono font-bold text-sky-700">
                        {inv.invoice_number}
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
                        <TaxInvoicePrint invoice={inv} settings={settings || null} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create Sales Invoice Dialog */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Receipt className="h-5 w-5 text-sky-600" />
              <span>{t("sales.createInvoice")}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              إصدار فاتورة ضريبية رسمية متوافقة مع ZATCA Phase 1 مع سحب المخزون وقيد اليومية
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-2 text-xs">
            {/* Customer & Dates */}
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

            {/* Source & Delivery Van */}
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

            {/* Line Items */}
            <div className="pt-2 border-t border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 text-xs">أصناف الفاتورة:</span>
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
                  className="text-xs text-sky-700 border-sky-300"
                >
                  <Plus className="me-1 h-3.5 w-3.5" />
                  إضافة صنف
                </Button>
              </div>

              {lines.length === 0 ? (
                <div className="text-center py-6 border border-dashed rounded-lg text-slate-400">
                  اضغط "إضافة صنف" لإدراج المنتجات التامة والكميات
                </div>
              ) : (
                <div className="space-y-2">
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
                        className={`p-2.5 rounded-lg border transition-all ${
                          isBelowCost
                            ? "bg-rose-50/80 border-rose-300 ring-1 ring-rose-300"
                            : "bg-slate-50 border-slate-200"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
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

                          <div className="w-20">
                            <Input
                              type="number"
                              placeholder="الكمية"
                              value={line.quantity || ""}
                              onChange={(e) => {
                                const updated = [...lines];
                                updated[idx].quantity = Number(e.target.value);
                                setLines(updated);
                              }}
                              className="font-mono tabular-nums bg-white text-center text-xs"
                            />
                          </div>

                          <div className="w-24">
                            <Select
                              value={line.unit_type}
                              onValueChange={(val: "carton" | "piece") => {
                                const updated = [...lines];
                                updated[idx].unit_type = val;
                                setLines(updated);
                              }}
                            >
                              <SelectTrigger className="bg-white text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="carton">كرتون</SelectItem>
                                <SelectItem value="piece">حبة</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="w-24">
                            <Input
                              type="number"
                              placeholder="السعر"
                              disabled={line.is_bonus_or_sample}
                              value={line.is_bonus_or_sample ? 0 : line.unit_price_ex_vat || ""}
                              onChange={(e) => {
                                const updated = [...lines];
                                updated[idx].unit_price_ex_vat = Number(e.target.value);
                                setLines(updated);
                              }}
                              className={`font-mono tabular-nums bg-white text-center text-xs ${
                                isBelowCost ? "border-rose-400 text-rose-700 font-bold" : ""
                              }`}
                            />
                          </div>

                          <div className="flex items-center gap-1 ps-1">
                            <Checkbox
                              id={`bonus_${idx}`}
                              checked={line.is_bonus_or_sample}
                              onCheckedChange={(c: any) => {
                                const updated = [...lines];
                                updated[idx].is_bonus_or_sample = !!c;
                                setLines(updated);
                              }}
                            />
                            <Label htmlFor={`bonus_${idx}`} className="text-[10px] text-amber-700 cursor-pointer">
                              بونص
                            </Label>
                          </div>

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

                        {/* Live Margin Guard Feedback (SPEC v3.1 Section 8.2) */}
                        {isBelowCost && (
                          <div className="flex items-center gap-1.5 px-2 py-1 mt-1.5 rounded bg-rose-100 text-rose-800 text-[11px] font-semibold border border-rose-300">
                            <AlertTriangle className="h-3.5 w-3.5 text-rose-600 flex-shrink-0 animate-pulse" />
                            <span>
                              {isArabic
                                ? `حارس الهامش: السعر (${line.unit_price_ex_vat} ر.س) أقل من آخر تكلفة FIFO (${itemCost.toFixed(2)} ر.س) — هامش ربح سالب!`
                                : `Margin Guard Alert: Price (${line.unit_price_ex_vat} SAR) is below FIFO cost (${itemCost.toFixed(2)} SAR)!`}
                            </span>
                          </div>
                        )}
                        {!isBelowCost && marginPercent && !line.is_bonus_or_sample && (
                          <div className="flex items-center gap-2 mt-1 px-1 text-[11px] text-emerald-700">
                            <span>{isArabic ? "هامش ربح إيجابي:" : "Profit Margin:"}</span>
                            <span className="font-mono font-bold">+{marginPercent}%</span>
                            <span className="text-slate-400 text-[10px]">
                              ({isArabic ? "تكلفة الوحدة:" : "Unit Cost:"} {itemCost.toFixed(2)} ر.س)
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Advance Deposit Deduction */}
            <div className="bg-sky-50 p-3 rounded-lg border border-sky-100 flex items-center justify-between">
              <div>
                <span className="font-bold text-sky-900 block text-xs">خصم الدفعة المقدمة (عربون العميل):</span>
                <span className="text-[11px] text-slate-600">
                  إذا كان للعميل رصيد دائن في حساب 2102 يتم تسويته مباشرة
                </span>
              </div>
              <div className="w-36">
                <Input
                  type="number"
                  placeholder="0.00"
                  value={advanceDeducted || ""}
                  onChange={(e) => setAdvanceDeducted(Number(e.target.value))}
                  className="bg-white font-mono text-end font-bold"
                />
              </div>
            </div>

            {/* Totals Summary */}
            <div className="bg-slate-100 p-3 rounded-lg border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-600">الإجمالي قبل الضريبة:</span>
                <span className="font-mono font-bold tabular-nums">{subtotalExVat.toFixed(2)} ر.س</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">ضريبة القيمة المضافة (15%):</span>
                <span className="font-mono font-bold tabular-nums">{vatTotal.toFixed(2)} ر.س</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1 text-sm font-bold text-slate-900">
                <span>المجموع شامل الضريبة:</span>
                <span className="font-mono tabular-nums">{totalIncVat.toFixed(2)} ر.س</span>
              </div>
              <div className="flex justify-between text-emerald-700 font-bold">
                <span>صافي المستحق للسداد:</span>
                <span className="font-mono tabular-nums">{netDue.toFixed(2)} ر.س</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={createInvoiceMutation.isPending}
              onClick={() => createInvoiceMutation.mutate()}
              className="bg-slate-900 hover:bg-slate-800 text-white min-h-[44px]"
            >
              {createInvoiceMutation.isPending ? t("common.saving") : "ترحيل وإصدار الفاتورة الضريبية"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
