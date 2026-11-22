import { printDocumentHtml, saveDocumentPdfFromHtml, shareDocumentWhatsApp } from "@/utils/printAndPdf";
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import type { Quotation, Customer, Item, FactorySettings } from "@/types/database";

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
  FileText,
  Plus,
  Search,
  ArrowRightCircle,
  Calendar,
  Building,
  Trash2,
  CheckCircle2,
  ArrowRight,
  Printer,
  Share2,
  FileDown,
  Eye,
} from "lucide-react";

export function QuotationsPage() {
  const { t, i18n } = useTranslation();
  const { user, isOwner, isAccountant } = useAuth();
  const queryClient = useQueryClient();
  const isArabic = i18n.language === "ar";

  const [searchTerm, setSearchTerm] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);

  const { data: settings } = useQuery<FactorySettings>({
    queryKey: ["factory-settings-quotations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("factory_settings").select("*").single();
      if (error) return null as unknown as FactorySettings;
      return data as FactorySettings;
    },
  });

  
  const getQuotationHtml = (q: Quotation) => {
    const docTitle = `عرض سعر رسمي - ${q.quotation_number}`;
    const cust = q.customer;
    const subtotal = q.total_ex_vat || 0;
    const vat = q.vat_amount || 0;
    const grand = q.grand_total || 0;
    return `
      <!DOCTYPE html>
      <html dir="${isArabic ? "rtl" : "ltr"}" lang="${isArabic ? "ar" : "en"}">
        <head>
          <meta charset="utf-8" />
          <title>${docTitle}</title>
          <style>
            @page { size: A4 portrait; margin: 12mm; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "IBM Plex Sans Arabic", sans-serif; color: #0f172a; background: #fff; margin: 0; padding: 0; font-size: 12px; }
            .header-grid { display: grid; grid-template-columns: 1fr auto 1fr; gap: 16px; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; }
            .badge { display: inline-block; padding: 4px 14px; background: #0f172a; color: #fff; font-weight: bold; font-size: 15px; border-radius: 4px; }
            .meta-card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px; background: #f8fafc; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { border: 1px solid #cbd5e1; background: #f1f5f9; padding: 8px; font-size: 11px; font-weight: bold; }
            td { border: 1px solid #cbd5e1; padding: 8px; font-size: 12px; }
            .tabular { font-family: monospace; font-variant-numeric: tabular-nums; }
            .totals-box { margin-top: 20px; margin-right: auto; width: 320px; border: 1px solid #cbd5e1; border-radius: 6px; background: #f8fafc; padding: 12px; font-size: 12px; }
            .totals-row { display: flex; justify-content: space-between; padding: 4px 0; }
            .totals-row.grand { border-top: 2px solid #0f172a; margin-top: 6px; padding-top: 8px; font-weight: bold; font-size: 14px; }
            .terms-box { margin-top: 24px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 6px; background: #f8fafc; font-size: 11px; color: #475569; }
            .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 30px; margin-top: 36px; text-align: center; }
            .sig-box { border-top: 1px dashed #94a3b8; padding-top: 8px; font-size: 11px; }
          </style>
        </head>
        <body>
          <div class="header-grid">
            <div style="text-align: ${isArabic ? "right" : "left"};">
              <div style="font-weight: bold; font-size: 15px;">مصنع الأسياح للمنتجات الكيميائية</div>
              <div style="font-size: 11px; color: #64748b;">سجل تجاري: ${settings?.cr_number || "1010000000"} | الرقم الضريبي: ${settings?.vat_number || "300000000000003"}</div>
              <div style="font-size: 11px; color: #64748b;">إدارة المبيعات والتسويق</div>
            </div>
            <div style="text-align: center;">
              <div class="badge">عرض سعر رسمي (Quotation)</div>
              <div style="font-size: 13px; font-family: monospace; font-weight: bold; margin-top: 4px;">${q.quotation_number}</div>
            </div>
            <div style="text-align: ${isArabic ? "left" : "right"}; direction: ltr;">
              <div style="font-weight: bold; font-size: 14px;">Al-Asyah Chemical Factory</div>
              <div style="font-size: 11px; color: #64748b;">Official Price Offer</div>
              <div style="font-size: 11px; color: #64748b;">Date: ${q.quotation_date}</div>
            </div>
          </div>

          <div class="meta-card">
            <div><strong>السادة / العميل:</strong> <span>${cust?.name_ar || cust?.name_en || "-"}</span></div>
            <div><strong>رقم العرض:</strong> <span class="tabular font-bold">${q.quotation_number}</span></div>
            <div><strong>تاريخ الإصدار:</strong> <span class="tabular">${q.quotation_date}</span></div>
            <div><strong>ساري حتى تاريخ:</strong> <span class="tabular font-bold">${q.valid_until || "-"}</span></div>
            <div><strong>جوال التواصل:</strong> <span class="tabular">${cust?.phone || "-"}</span></div>
            <div><strong>الحالة:</strong> <span>${q.status === "converted_to_invoice" ? "تم التحويل لفاتورة" : "نشط ومعتمد"}</span></div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 35px; text-align: center;">#</th>
                <th style="width: 100px;">كود الصنف</th>
                <th>اسم المنتج / المواصفات</th>
                <th style="width: 70px; text-align: center;">الوحدة</th>
                <th style="width: 70px; text-align: center;">الكمية</th>
                <th style="width: 90px; text-align: right;">السعر قبل الضريبة</th>
                <th style="width: 75px; text-align: right;">الضريبة 15%</th>
                <th style="width: 100px; text-align: right;">الإجمالي شامل</th>
              </tr>
            </thead>
            <tbody>
              ${(q.lines || []).map((l, idx) => `
                <tr>
                  <td style="text-align: center;">${idx + 1}</td>
                  <td class="tabular" style="font-weight: bold;">${l.item?.sku || "-"}</td>
                  <td><strong>${l.item?.name_ar || "-"}</strong></td>
                  <td style="text-align: center;">${l.unit_type === "carton" ? "كرتون" : "حبة"}</td>
                  <td class="tabular" style="text-align: center; font-weight: bold;">${l.quantity}</td>
                  <td class="tabular" style="text-align: right;">${Number(l.unit_price).toFixed(2)} ر.س</td>
                  <td class="tabular" style="text-align: right;">${Number(l.vat_amount || 0).toFixed(2)} ر.س</td>
                  <td class="tabular" style="text-align: right; font-weight: bold;">${Number(l.total_line || 0).toFixed(2)} ر.س</td>
                </tr>
              `).join("")}
            </tbody>
          </table>

          <div class="totals-box">
            <div class="totals-row">
              <span>المجموع قبل الضريبة:</span>
              <span class="tabular">${subtotal.toFixed(2)} ر.س</span>
            </div>
            <div class="totals-row">
              <span>ضريبة القيمة المضافة (15%):</span>
              <span class="tabular">${vat.toFixed(2)} ر.س</span>
            </div>
            <div class="totals-row grand">
              <span>الإجمالي العام المطلوب:</span>
              <span class="tabular">${grand.toFixed(2)} ر.س</span>
            </div>
          </div>

          <div class="terms-box">
            <strong>شروط وأحكام العرض:</strong>
            <ul style="margin: 4px 0 0 0; padding-right: 20px;">
              <li>الأسعار المعروضة أعلاه صالحة حتى تاريخ الصلاحية المدون.</li>
              <li>يشمل العرض ضمان الجودة والمطابقة للمواصفات السعودية القياسية SASO لمدة 24 شهراً.</li>
              <li>التسليم حسب الاتفاق من مستودعات المصنع أو واصل لموقع العميل.</li>
            </ul>
          </div>

          <div class="signatures">
            <div class="sig-box">
              <div style="font-weight: bold; margin-bottom: 35px;">مسؤول المبيعات والتسويق</div>
              <div>التوقيع: ............................</div>
            </div>
            <div class="sig-box">
              <div style="font-weight: bold; margin-bottom: 35px;">المدير التجاري</div>
              <div>التوقيع: ............................</div>
            </div>
            <div class="sig-box">
              <div style="font-weight: bold; margin-bottom: 35px;">موافقة واعتماد العميل</div>
              <div>الختم والتوقيع: ............................</div>
            </div>
          </div>

          
        </body>
      </html>
    `;
  };

  const handlePrintQuotation = (q: Quotation) => {
    printDocumentHtml(getQuotationHtml(q), `عرض_سعر_${q.quotation_number}`);
  };

  const handleSavePdfQuotation = (q: Quotation) => {
    saveDocumentPdfFromHtml(getQuotationHtml(q), `عرض_سعر_${q.quotation_number}`);
  };

  const handleShareQuotationWhatsApp = (q: Quotation) => {
    const custName = q.customer?.name_ar || "العميل الكريم";
    const total = q.grand_total.toFixed(2);
    const date = q.quotation_date;
    const qNum = q.quotation_number;
    const msg = `*عرض سعر رسمي - مصنع الأسياح للمنظفات الصناعية*
رقم العرض: ${qNum}
التاريخ: ${date}
العميل: ${custName}
المجموع قبل الضريبة: ${q.total_ex_vat.toFixed(2)} ر.س
ضريبة القيمة المضافة (15%): ${q.vat_amount.toFixed(2)} ر.س
الإجمالي شامل الضريبة: ${total} ر.س
صالح لمدة: ${q.valid_until || "15 يوماً"}
يسعدنا تواصلكم لاعتماد العرض وإصدار أمر التوريد.`;
    const encoded = encodeURIComponent(msg);
    const phone = q.customer?.phone?.replace(/[^0-9]/g, "") || "";
    const waUrl = phone
      ? `https://api.whatsapp.com/send?phone=${phone}&text=${encoded}`
      : `https://api.whatsapp.com/send?text=${encoded}`;
    shareDocumentWhatsApp(q.customer?.phone, msg);
  };

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
      const invalidLine = lines.find((l) => !l.item_id || l.quantity <= 0);
      if (invalidLine) {
        throw new Error(isArabic ? "يرجى اختيار المنتج وتحديد كمية صالحة لجميع الأصناف" : "Please select item and valid quantity for all lines");
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
    onSuccess: async (data: any) => {
      toast.success(
        isArabic
          ? `تم حفظ وإرسال عرض السعر ${data?.quotation_number || ""} بنجاح`
          : "Quotation created successfully"
      );
      await queryClient.invalidateQueries({ queryKey: ["quotations-list"] });
      setCreateModalOpen(false);
      setCustomerId("");
      setLines([]);
      setNotes("");

      if (data?.id) {
        try {
          const { data: quot } = await supabase
            .from("quotations")
            .select("*, customer:customers(*), lines:quotation_lines(*, item:items(*))")
            .eq("id", data.id)
            .single();
          if (quot) {
            setSelectedQuotation(quot as unknown as Quotation);
          }
        } catch (err) {
          console.error("Auto open quotation error:", err);
        }
      }
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

  const quoteSubtotal = lines.reduce((sum, l) => sum + ((l.quantity || 0) * (l.unit_price || 0)), 0);
  const quoteVat = quoteSubtotal * 0.15;
  const quoteTotal = quoteSubtotal + quoteVat;

  // Material Design 3 In-Page Canvas View for Quotation Inspection & Actions
  if (selectedQuotation) {
    const cust = selectedQuotation.customer;
    return (
      <div className="space-y-6 max-w-5xl mx-auto pb-16 animate-in fade-in duration-200">
        {/* Top Header Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3">
            <Button
              variant="tonal"
              size="sm"
              onClick={() => setSelectedQuotation(null)}
              className="gap-1.5"
            >
              <ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
              <span>{isArabic ? "العودة لعروض الأسعار" : "Back to Quotations"}</span>
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-sky-600" />
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  {selectedQuotation.quotation_number}
                </h1>
                {selectedQuotation.status === "converted_to_invoice" ? (
                  <Badge variant="emerald" className="text-xs">
                    <CheckCircle2 className="me-1 h-3.5 w-3.5" />
                    تم تحويله لفاتورة مبيعات
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    عرض سعر نشط
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                تاريخ العرض: {selectedQuotation.quotation_date} • العميل: {cust?.name_ar || cust?.name_en || "-"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            <Button
              variant="filled"
              size="sm"
              onClick={() => handleSavePdfQuotation(selectedQuotation)}
              className="min-h-[36px] px-3 gap-1.5 shadow-sm text-xs"
            >
              <Printer className="h-3.5 w-3.5 text-sky-400" />
              <span>{isArabic ? "طباعة A4" : "Print A4"}</span>
            </Button>

            <Button
              variant="tonal"
              size="sm"
              onClick={() => handlePrintQuotation(selectedQuotation)}
              className="min-h-[36px] px-3 gap-1.5 text-xs font-semibold"
            >
              <FileDown className="h-3.5 w-3.5 text-sky-700" />
              <span>{isArabic ? "حفظ PDF" : "Save PDF"}</span>
            </Button>

            <Button
              variant="emerald"
              size="sm"
              onClick={() => handleShareQuotationWhatsApp(selectedQuotation)}
              className="min-h-[36px] px-3 gap-1.5 text-xs"
            >
              <Share2 className="h-3.5 w-3.5 text-emerald-100" />
              <span>{isArabic ? "واتساب" : "WhatsApp"}</span>
            </Button>

            {selectedQuotation.status !== "converted_to_invoice" && (
              <Button
                size="sm"
                onClick={() => convertToInvoiceMutation.mutate(selectedQuotation)}
                disabled={convertToInvoiceMutation.isPending}
                className="min-h-[36px] px-4 gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold"
              >
                <ArrowRightCircle className="h-3.5 w-3.5" />
                <span>{convertToInvoiceMutation.isPending ? "جاري التحويل..." : "تحويل لفاتورة"}</span>
              </Button>
            )}

            <Button variant="outline" size="sm" onClick={() => setSelectedQuotation(null)}>
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
                  <span>بيانات العميل المستهدف</span>
                  <span className="font-mono text-xs text-slate-500 font-normal">كود: {cust?.code || "-"}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-500 block mb-1">اسم العميل:</span>
                  <strong className="text-slate-900 text-sm">{cust?.name_ar || cust?.name_en || "-"}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">رقم الجوال:</span>
                  <strong className="font-mono text-slate-800 text-sm">{cust?.phone || "-"}</strong>
                </div>
              </CardContent>
            </Card>

            {/* Line Items Table Card */}
            <Card className="border-slate-200 shadow-sm overflow-hidden">
              <CardHeader className="py-3 px-4 border-b border-slate-100 bg-slate-50">
                <CardTitle className="text-sm font-bold text-slate-800">
                  أصناف عرض السعر ({selectedQuotation.lines?.length || 0} صنف)
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
                        <th className="py-2.5 px-3 text-end">ضريبة 15%</th>
                        <th className="py-2.5 px-3 text-end">الإجمالي شامل الضريبة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedQuotation.lines?.map((line, idx) => (
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
                            {line.unit_price.toFixed(2)} ر.س
                          </td>
                          <td className="py-2.5 px-3 text-end font-mono text-slate-600">
                            {line.vat_amount.toFixed(2)} ر.س
                          </td>
                          <td className="py-2.5 px-3 text-end font-mono font-bold text-slate-900">
                            {line.total_line.toFixed(2)} ر.س
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
                <CardTitle className="text-sm font-bold text-slate-800">الملخص المالي للعرض</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3 text-xs">
                <div className="flex justify-between items-center text-slate-600">
                  <span>المجموع قبل الضريبة:</span>
                  <span className="font-mono font-semibold text-slate-900">{selectedQuotation.total_ex_vat.toFixed(2)} ر.س</span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>ضريبة القيمة المضافة (15%):</span>
                  <span className="font-mono font-semibold text-slate-900">{selectedQuotation.vat_amount.toFixed(2)} ر.س</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm font-bold mt-2">
                  <span className="text-emerald-950">الإجمالي النهائي للعرض:</span>
                  <span className="font-mono text-emerald-700 text-base">{selectedQuotation.grand_total.toFixed(2)} ر.س</span>
                </div>

                <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-500 space-y-1.5">
                  <div className="flex justify-between">
                    <span>صلاحية العرض حتى:</span>
                    <span className="font-mono font-bold text-slate-800">{selectedQuotation.valid_until || "15 يوماً"}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Material Design 3 In-Page Canvas View for Quotation Creation (Eliminating modal popup)
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
              <span>{isArabic ? "العودة لقائمة عروض الأسعار" : "Back to Quotations"}</span>
            </Button>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
                <FileText className="h-5 w-5 text-sky-600" />
                <span>{t("sales.createQuotation")}</span>
              </h1>
              <p className="text-xs text-slate-500">
                اختر العميل وأضف بنود المنظفات والأسعار المعتمدة قبل الضريبة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setCreateModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={createQuotationMutation.isPending}
              onClick={() => createQuotationMutation.mutate()}
              className="bg-slate-900 hover:bg-slate-800 text-white min-h-[40px] px-5"
            >
              {createQuotationMutation.isPending ? t("common.saving") : "حفظ وإرسال عرض السعر"}
            </Button>
          </div>
        </div>

        {/* Form Body in Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Customer & Validity Card */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Building className="h-4 w-4 text-sky-600" />
                  <span>بيانات العميل وفترة سريان العرض</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                <div>
                  <Label className="text-xs font-semibold">ملاحظات وشروط العرض</Label>
                  <Input
                    placeholder="شروط التسليم والدفع..."
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
                    <FileText className="h-4 w-4 text-sky-600" />
                    <span>أصناف المنظفات المطلوبة والكميات</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 mt-0.5">
                    إدراج المنتجات التامة مع أسعار البيع المقترحة قبل الضريبة
                  </CardDescription>
                </div>
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
                  className="text-xs text-sky-700 border-sky-300 hover:bg-sky-50"
                >
                  <Plus className="me-1 h-3.5 w-3.5" />
                  إضافة صنف
                </Button>
              </CardHeader>
              <CardContent className="pt-4">
                {lines.length === 0 ? (
                  <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-xl text-slate-400">
                    <FileText className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600">لا توجد أصناف في عرض السعر بعد</p>
                    <p className="text-xs text-slate-400 mt-1">اضغط زر "إضافة صنف" أعلاه لإدراج المنتجات والكميات</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {lines.map((line, idx) => (
                      <div
                        key={idx}
                        className="flex flex-col sm:flex-row sm:items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200"
                      >
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
                          <Label className="text-[11px] text-slate-500 mb-1 block">السعر المقترح *</Label>
                          <Input
                            type="number"
                            value={line.unit_price || ""}
                            onChange={(e) => {
                              const updated = [...lines];
                              updated[idx].unit_price = Number(e.target.value);
                              setLines(updated);
                            }}
                            min={0}
                            step="0.5"
                            className="font-mono tabular-nums bg-white text-center font-bold"
                          />
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

          {/* Side Column: Summary */}
          <div className="space-y-6">
            <Card className="border-slate-200 shadow-sm sticky top-6">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-sky-600" />
                  <span>الملخص المالي لعرض السعر</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2.5">
                  <div className="flex justify-between text-slate-600">
                    <span>الإجمالي قبل الضريبة:</span>
                    <span className="font-mono font-bold tabular-nums text-slate-900">{quoteSubtotal.toFixed(2)} ر.س</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>ضريبة القيمة المضافة (15%):</span>
                    <span className="font-mono font-bold tabular-nums text-sky-700">{quoteVat.toFixed(2)} ر.س</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-extrabold text-slate-900">
                    <span>المجموع شامل الضريبة:</span>
                    <span className="font-mono tabular-nums">{quoteTotal.toFixed(2)} ر.س</span>
                  </div>
                </div>

                <div className="pt-2 space-y-2">
                  <Button
                    disabled={createQuotationMutation.isPending}
                    onClick={() => createQuotationMutation.mutate()}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white min-h-[46px] font-bold"
                  >
                    {createQuotationMutation.isPending ? t("common.saving") : "حفظ وإرسال عرض السعر"}
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
                      <td className="py-2.5 px-3 font-mono font-bold">
                        <button
                          type="button"
                          onClick={() => setSelectedQuotation(q)}
                          className="text-sky-700 hover:text-sky-900 hover:underline flex items-center gap-1.5 cursor-pointer text-start"
                          title={isArabic ? "معاينة عرض السعر بالتفصيل" : "View Quotation Details"}
                        >
                          <Eye className="h-3.5 w-3.5 text-sky-500" />
                          <span>{q.quotation_number}</span>
                        </button>
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
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedQuotation(q)}
                            className="h-7 text-xs text-sky-700 hover:bg-sky-50 px-2"
                            title="معاينة العرض"
                          >
                            <Eye className="h-3.5 w-3.5 me-1" />
                            <span>معاينة</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSavePdfQuotation(q)}
                            className="h-7 w-7 p-0 text-slate-600 hover:bg-slate-100"
                            title={isArabic ? "طباعة A4" : "Print A4"}
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handlePrintQuotation(q)}
                            className="h-7 w-7 p-0 text-sky-700 hover:bg-sky-50"
                            title={isArabic ? "حفظ PDF" : "Save PDF"}
                          >
                            <FileDown className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleShareQuotationWhatsApp(q)}
                            className="h-7 w-7 p-0 text-emerald-600 hover:bg-emerald-50"
                            title={isArabic ? "مشاركة عبر واتساب" : "WhatsApp"}
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </Button>
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
