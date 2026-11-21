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
  RotateCcw,
  Plus,
  Search,
  Printer,
  CheckCircle2,
  AlertTriangle,
  Building,
  Trash2,
} from "lucide-react";

export function SalesReturnsPage() {
  const { t, i18n } = useTranslation();
  const { user, isOwner, isAccountant } = useAuth();
  const queryClient = useQueryClient();
  const isArabic = i18n.language === "ar";

  const [searchTerm, setSearchTerm] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);

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
        throw new Error(isArabic ? "يرجى تعبئة العميل والبنود المرتجعة" : "Please select customer and items");
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
    onSuccess: (data: any) => {
      toast.success(
        isArabic
          ? `تم ترحيل الإشعار الدائن ${data?.return_number || ""} بنجاح وإعادة البضاعة وتخفيض ذمة العميل والضريبة!`
          : "Credit Note created and posted successfully!"
      );
      queryClient.invalidateQueries({ queryKey: ["sales-returns-list"] });
      setCreateModalOpen(false);
      setCustomerId("");
      setInvoiceId("");
      setLines([]);
      setNotes("");
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
                          {ret.return_number}
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
                          <TaxInvoicePrint invoice={mockInvoice} settings={settings || null} isCreditNote={true} />
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

      {/* Create Return Dialog */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-rose-600" />
              <span>{t("sales.createReturn")}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              إصدار إشعار دائن ضريبي معتمد وتحديد حالة المرتجع لإرجاعه لمخزون الـ FIFO أو ترحيله لمصروف الهالك
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-2 text-xs">
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

            {/* Line Items with Condition */}
            <div className="pt-2 border-t border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 text-xs">الأصناف المرتجعة وحالتها:</span>
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
                  className="text-xs text-rose-700 border-rose-300"
                >
                  <Plus className="me-1 h-3.5 w-3.5" />
                  إضافة صنف مرتجع
                </Button>
              </div>

              {lines.length === 0 ? (
                <div className="text-center py-6 border border-dashed rounded-lg text-slate-400">
                  اضغط "إضافة صنف مرتجع" لتحديد البضاعة وحالتها
                </div>
              ) : (
                <div className="space-y-2">
                  {lines.map((line, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200"
                    >
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
                          value={line.unit_price_ex_vat || ""}
                          onChange={(e) => {
                            const updated = [...lines];
                            updated[idx].unit_price_ex_vat = Number(e.target.value);
                            setLines(updated);
                          }}
                          className="font-mono tabular-nums bg-white text-center text-xs"
                        />
                      </div>

                      <div className="w-36">
                        <Select
                          value={line.return_condition}
                          onValueChange={(val: "sellable" | "damaged") => {
                            const updated = [...lines];
                            updated[idx].return_condition = val;
                            setLines(updated);
                          }}
                        >
                          <SelectTrigger className="bg-white text-xs font-semibold">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sellable">صالح (مخزون)</SelectItem>
                            <SelectItem value="damaged">تالف (هالك 6105)</SelectItem>
                          </SelectContent>
                        </Select>
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
                  ))}
                </div>
              )}
            </div>

            {/* Totals */}
            <div className="bg-rose-50/70 p-3 rounded-lg border border-rose-200 text-xs space-y-1">
              <div className="flex justify-between">
                <span>الإجمالي قبل الضريبة:</span>
                <span className="font-mono font-bold tabular-nums">{subtotalExVat.toFixed(2)} ر.س</span>
              </div>
              <div className="flex justify-between">
                <span>تخفيض ضريبة القيمة المضافة (15%):</span>
                <span className="font-mono font-bold tabular-nums">{vatTotal.toFixed(2)} ر.س</span>
              </div>
              <div className="flex justify-between border-t border-rose-200 pt-1 text-sm font-bold text-rose-800">
                <span>إجمالي قيمة الإشعار الدائن:</span>
                <span className="font-mono tabular-nums">{grandTotal.toFixed(2)} ر.س</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={createReturnMutation.isPending}
              onClick={() => createReturnMutation.mutate()}
              className="bg-rose-600 hover:bg-rose-700 text-white min-h-[44px]"
            >
              {createReturnMutation.isPending ? t("common.saving") : "ترحيل الإشعار الدائن (CN)"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
