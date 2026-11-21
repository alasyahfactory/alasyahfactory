import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import type { Quotation, Customer, Item } from "@/types/database";

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
  FileText,
  Plus,
  Search,
  ArrowRightCircle,
  Calendar,
  Building,
  Trash2,
  CheckCircle2,
} from "lucide-react";

export function QuotationsPage() {
  const { t, i18n } = useTranslation();
  const { user, isOwner, isAccountant } = useAuth();
  const queryClient = useQueryClient();
  const isArabic = i18n.language === "ar";

  const [searchTerm, setSearchTerm] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // New Quotation State
  const [customerId, setCustomerId] = useState("");
  const [validDays, setValidDays] = useState<number>(15);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<
    Array<{ item_id: string; quantity: number; unit_type: "carton" | "piece"; unit_price: number }>
  >([]);

  // 1. Fetch Quotations
  const { data: quotations, isLoading } = useQuery<Quotation[]>({
    queryKey: ["quotations-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotations")
        .select(`
          *,
          customer:customers(id, code, name_ar, name_en, phone),
          lines:quotation_lines(
            id,
            item_id,
            quantity,
            unit_type,
            unit_price,
            vat_amount,
            total_line,
            item:items(id, sku, name_ar, name_en)
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as Quotation[];
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

  // Create Quotation Mutation
  const createQuotationMutation = useMutation({
    mutationFn: async () => {
      if (!customerId || lines.length === 0) {
        throw new Error(isArabic ? "يرجى اختيار العميل وإضافة صنف واحد على الأقل" : "Please select customer and at least one item");
      }
      if (!user?.id) throw new Error("User not authenticated");

      // Calculate totals
      let totalEx = 0;
      let totalVat = 0;
      const formattedLines = lines.map((l) => {
        const lineEx = l.quantity * l.unit_price;
        const lineVat = lineEx * 0.15;
        totalEx += lineEx;
        totalVat += lineVat;
        return {
          item_id: l.item_id,
          quantity: l.quantity,
          unit_type: l.unit_type,
          unit_price: l.unit_price,
          vat_rate: 0.15,
          vat_amount: Number(lineVat.toFixed(2)),
          total_line: Number((lineEx + lineVat).toFixed(2)),
        };
      });

      const grandTotal = totalEx + totalVat;
      const quotNum = `QUOT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const validUntil = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      // Insert Header
      const { data: qData, error: qErr } = await supabase
        .from("quotations")
        .insert({
          quotation_number: quotNum,
          customer_id: customerId,
          quotation_date: new Date().toISOString().split("T")[0],
          valid_until: validUntil,
          total_ex_vat: Number(totalEx.toFixed(2)),
          vat_amount: Number(totalVat.toFixed(2)),
          grand_total: Number(grandTotal.toFixed(2)),
          status: "sent",
          notes: notes || null,
          created_by: user.id,
        })
        .select()
        .single();

      if (qErr) throw qErr;

      // Insert Lines
      const qLines = formattedLines.map((fl) => ({
        quotation_id: qData.id,
        ...fl,
      }));

      const { error: lErr } = await supabase.from("quotation_lines").insert(qLines);
      if (lErr) throw lErr;

      return qData;
    },
    onSuccess: (data: any) => {
      toast.success(
        isArabic
          ? `تم حفظ وإرسال عرض السعر ${data?.quotation_number || ""} بنجاح`
          : "Quotation created successfully"
      );
      queryClient.invalidateQueries({ queryKey: ["quotations-list"] });
      setCreateModalOpen(false);
      setCustomerId("");
      setLines([]);
      setNotes("");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    },
  });

  // Convert Quotation to Sales Invoice Mutation
  const convertToInvoiceMutation = useMutation({
    mutationFn: async (quotation: Quotation) => {
      if (!user?.id) throw new Error("User not authenticated");
      if (!quotation.lines || quotation.lines.length === 0) {
        throw new Error(isArabic ? "لا توجد بنود في عرض السعر" : "No lines in quotation");
      }

      const itemsForRpc = quotation.lines.map((l) => ({
        item_id: l.item_id,
        quantity: l.quantity,
        unit_type: l.unit_type,
        unit_price_ex_vat: l.unit_price,
        is_bonus_or_sample: false,
      }));

      // Call atomic sales invoice RPC
      const { data, error } = await supabase.rpc("rpc_create_sales_invoice", {
        p_customer_id: quotation.customer_id,
        p_invoice_date: new Date().toISOString().split("T")[0],
        p_due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        p_items: itemsForRpc,
        p_advance_deducted: 0,
        p_source_type: "quotation",
        p_van_warehouse_id: null,
        p_assigned_rep_id: null,
        p_zatca_qr_base64: null,
        p_notes: `تم تحويله آلياً من عرض السعر ${quotation.quotation_number}`,
        p_created_by: user.id,
      });

      if (error) throw error;

      // Update Quotation Status
      await supabase
        .from("quotations")
        .update({ status: "converted_to_invoice" })
        .eq("id", quotation.id);

      return data;
    },
    onSuccess: (data: any) => {
      toast.success(
        isArabic
          ? `تم تحويل عرض السعر إلى فاتورة ضريبية ${data?.invoice_number || ""} بنجاح!`
          : "Quotation converted to Tax Invoice successfully"
      );
      queryClient.invalidateQueries({ queryKey: ["quotations-list"] });
      queryClient.invalidateQueries({ queryKey: ["sales-invoices-list"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    },
  });

  const filteredQuotations = quotations?.filter((q) => {
    const term = searchTerm.toLowerCase();
    const custName = q.customer?.name_ar?.toLowerCase() || "";
    return q.quotation_number.toLowerCase().includes(term) || custName.includes(term);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <FileText className="h-6 w-6 text-sky-600" />
            <span>{t("sales.quotationsTitle")}</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            {t("sales.quotationsSubtitle")}
          </p>
        </div>

        {(isOwner || isAccountant) && (
          <Button
            onClick={() => setCreateModalOpen(true)}
            className="bg-slate-900 hover:bg-slate-800 text-white min-h-[44px]"
          >
            <Plus className="me-2 h-4 w-4" />
            <span>{t("sales.createQuotation")}</span>
          </Button>
        )}
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder={isArabic ? "بحث برقم العرض أو اسم العميل..." : "Search quotation # or client..."}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="ps-9 bg-white"
        />
      </div>

      {/* Quotations Table */}
      <Card className="border-industrial-border bg-white shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold">
                <tr>
                  <th className="py-2.5 px-3">{t("sales.quotationNumber")}</th>
                  <th className="py-2.5 px-3">{t("common.date")}</th>
                  <th className="py-2.5 px-3">العميل</th>
                  <th className="py-2.5 px-3 text-end">المجموع غير شامل</th>
                  <th className="py-2.5 px-3 text-end">ضريبة 15%</th>
                  <th className="py-2.5 px-3 text-end">الإجمالي شامل</th>
                  <th className="py-2.5 px-3 text-center">{t("common.status")}</th>
                  <th className="py-2.5 px-3 text-center">{t("common.actions")}</th>
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
                ) : filteredQuotations?.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      لا توجد عروض أسعار مسجلة
                    </td>
                  </tr>
                ) : (
                  filteredQuotations?.map((q) => (
                    <tr key={q.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-3 font-mono font-bold text-sky-700">
                        {q.quotation_number}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {q.quotation_date}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">
                        {q.customer ? (isArabic ? q.customer.name_ar : q.customer.name_en) : "-"}
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono tabular-nums">
                        {q.total_ex_vat.toFixed(2)} ر.س
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono tabular-nums text-slate-700">
                        {q.vat_amount.toFixed(2)} ر.س
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono tabular-nums font-bold text-slate-900">
                        {q.grand_total.toFixed(2)} ر.س
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {q.status === "converted_to_invoice" ? (
                          <Badge variant="emerald" className="text-[10px]">
                            تم تحويله لفاتورة
                          </Badge>
                        ) : q.status === "sent" ? (
                          <Badge variant="secondary" className="text-[10px]">
                            مرسل للعميل
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            {q.status}
                          </Badge>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {q.status !== "converted_to_invoice" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={convertToInvoiceMutation.isPending}
                            onClick={() => convertToInvoiceMutation.mutate(q)}
                            className="h-7 text-xs border-sky-300 text-sky-700 hover:bg-sky-50 px-2"
                          >
                            <ArrowRightCircle className="me-1 h-3.5 w-3.5" />
                            <span>{t("sales.convertToInvoice")}</span>
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create Quotation Dialog */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <FileText className="h-5 w-5 text-sky-600" />
              <span>{t("sales.createQuotation")}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              اختر العميل وأضف بنود المنظفات والأسعار المعتمدة قبل الضريبة
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-2 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <Label className="text-xs font-semibold">صلاحية العرض (أيام)</Label>
                <Input
                  type="number"
                  value={validDays}
                  onChange={(e) => setValidDays(Number(e.target.value))}
                  min={1}
                  className="mt-1 font-mono tabular-nums"
                />
              </div>
            </div>

            {/* Line Items */}
            <div className="pt-2 border-t border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 text-xs">أصناف المنظفات المطلوبة:</span>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() =>
                    setLines([
                      ...lines,
                      { item_id: "", quantity: 10, unit_type: "carton", unit_price: 65.0 },
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
                  اضغط "إضافة صنف" لتحديد المنتجات والأسعار
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
                          value={line.unit_price || ""}
                          onChange={(e) => {
                            const updated = [...lines];
                            updated[idx].unit_price = Number(e.target.value);
                            setLines(updated);
                          }}
                          className="font-mono tabular-nums bg-white text-center text-xs"
                        />
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

            <div>
              <Label className="text-xs font-semibold">ملاحظات وشروط العرض</Label>
              <Input
                placeholder="شروط التسليم والدفع..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={createQuotationMutation.isPending}
              onClick={() => createQuotationMutation.mutate()}
              className="bg-slate-900 hover:bg-slate-800 text-white min-h-[44px]"
            >
              {createQuotationMutation.isPending ? t("common.saving") : "حفظ وإرسال عرض السعر"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
