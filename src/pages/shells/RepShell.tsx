import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { generateZatcaTlvBase64 } from "@/lib/zatca";
import type { Customer, SalesRepCommission, Warehouse, Item, FactorySettings } from "@/types/database";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Truck,
  Building,
  DollarSign,
  Phone,
  Package,
  Calendar,
  CreditCard,
  CheckCircle2,
  Clock,
  Plus,
  Receipt,
  Share2,
  Trash2,
  Send,
  AlertCircle,
  FileCheck2,
} from "lucide-react";

export function RepShell() {
  const { t, i18n } = useTranslation();
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const isArabic = i18n.language === "ar";

  const [activeTab, setActiveTab] = useState("custody");

  // Mobile Invoice Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [invoiceLines, setInvoiceLines] = useState<
    Array<{ item_id: string; quantity: number; unit_price: number }>
  >([]);
  const [createdInvoiceSuccess, setCreatedInvoiceSuccess] = useState<any>(null);

  // 1. Fetch Rep's Assigned Delivery Van
  const { data: repVan, isLoading: isVanLoading } = useQuery<Warehouse | null>({
    queryKey: ["rep-assigned-van", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("warehouses")
        .select(`
          *,
          vehicle:vehicles(id, plate_number, name)
        `)
        .eq("warehouse_type", "sales_van")
        .eq("assigned_rep_id", user.id)
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;
      return (data || null) as unknown as Warehouse | null;
    },
  });

  // 2. Fetch Van FIFO Layers / Stock (Quantity in Cartons & Pieces)
  const { data: vanStock, isLoading: isStockLoading } = useQuery<any[]>({
    queryKey: ["rep-van-stock", repVan?.id],
    queryFn: async () => {
      if (!repVan?.id) return [];
      const { data, error } = await supabase
        .from("fifo_layers")
        .select(`
          id,
          batch_number,
          remaining_qty,
          layer_date,
          item:items(id, sku, name_ar, name_en, pieces_per_carton)
        `)
        .eq("warehouse_id", repVan.id)
        .gt("remaining_qty", 0)
        .order("layer_date", { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!repVan?.id,
  });

  // 3. Fetch Assigned Customers
  const { data: customers = [], isLoading: isCustLoading } = useQuery<Customer[]>({
    queryKey: ["rep-customers", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("assigned_rep_id", user.id)
        .order("name_ar");

      if (error) throw error;
      return (data || []) as Customer[];
    },
  });

  // 4. Fetch Rep's Commissions
  const { data: commissions, isLoading: isCommLoading } = useQuery<SalesRepCommission[]>({
    queryKey: ["rep-commissions", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("sales_rep_commissions")
        .select(`
          *,
          invoice:sales_invoices(id, invoice_number, total_amount_inc_vat)
        `)
        .eq("rep_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as SalesRepCommission[];
    },
  });

  // 5. Fetch Factory Settings for ZATCA Seller Info & Name
  const { data: settings } = useQuery<FactorySettings | null>({
    queryKey: ["factory-settings-rep"],
    queryFn: async () => {
      const { data, error } = await supabase.from("factory_settings").select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      return data as FactorySettings | null;
    },
  });

  // Group Van Stock by Item
  const groupedStockMap = new Map<string, { item: any; totalPieces: number; totalCartons: number }>();
  vanStock?.forEach((layer) => {
    if (layer.item) {
      const perCarton = layer.item.pieces_per_carton || 1;
      const existing = groupedStockMap.get(layer.item.id);
      if (existing) {
        existing.totalPieces += Number(layer.remaining_qty);
        existing.totalCartons = Math.floor(existing.totalPieces / perCarton);
      } else {
        const total = Number(layer.remaining_qty);
        groupedStockMap.set(layer.item.id, {
          item: layer.item,
          totalPieces: total,
          totalCartons: Math.floor(total / perCarton),
        });
      }
    }
  });
  const stockItems = Array.from(groupedStockMap.values());

  // Total Commissions Calculation
  const totalEarned = commissions?.reduce((acc, c) => acc + Number(c.commission_amount), 0) || 0;
  const pendingAmount =
    commissions?.filter((c) => c.status === "pending").reduce((acc, c) => acc + Number(c.commission_amount), 0) || 0;

  // Invoice calculations
  const invoiceSubtotal = invoiceLines.reduce((acc, l) => acc + (l.quantity * l.unit_price), 0);
  const invoiceVat = invoiceSubtotal * 0.15;
  const invoiceTotal = invoiceSubtotal + invoiceVat;

  // Add line to invoice
  const addInvoiceLine = () => {
    const availableItem = stockItems.find((s) => !invoiceLines.some((l) => l.item_id === s.item.id));
    if (!availableItem) {
      toast.error(isArabic ? "لا توجد أصناف إضافية متوفرة في عهدة السيارة" : "No more items in van stock");
      return;
    }
    setInvoiceLines([
      ...invoiceLines,
      {
        item_id: availableItem.item.id,
        quantity: 1,
        unit_price: 50.0,
      },
    ]);
  };

  // Remove line from invoice
  const removeInvoiceLine = (idx: number) => {
    setInvoiceLines(invoiceLines.filter((_, i) => i !== idx));
  };

  // Update line in invoice
  const updateInvoiceLine = (idx: number, field: string, value: any) => {
    const updated = [...invoiceLines];
    (updated[idx] as any)[field] = value;
    setInvoiceLines(updated);
  };

  // Submit Van Invoice Mutation
  const issueInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Unauthenticated");
      if (!repVan?.id) throw new Error(isArabic ? "لا توجد سيارة توزيع مرتبطة بحسابك" : "No van assigned");
      if (!selectedCustomerId) throw new Error(isArabic ? "يرجى اختيار العميل أولاً" : "Select customer");
      if (invoiceLines.length === 0) throw new Error(isArabic ? "يرجى إضافة صنف واحد على الأقل للفاتورة" : "Add item");

      // Validate quantities against van stock
      for (const line of invoiceLines) {
        const vanItem = stockItems.find((s) => s.item.id === line.item_id);
        if (!vanItem || line.quantity > vanItem.totalCartons) {
          throw new Error(
            isArabic
              ? `الكمية المطلوبة للصنف (${vanItem?.item?.name_ar || "المحدد"}) تتجاوز رصيد السيارة المتوفر (${vanItem?.totalCartons || 0} كرتون)`
              : "Quantity exceeds van stock"
          );
        }
      }

      // Generate ZATCA Phase 1 TLV QR Base64
      const zatcaQrBase64 = generateZatcaTlvBase64({
        sellerName: settings?.name_ar || "مصنع الأسياح للمنظفات الصناعية",
        vatNumber: settings?.vat_number || "300000000000003",
        timestamp: `${invoiceDate}T12:00:00Z`,
        totalAmount: invoiceTotal.toFixed(2),
        vatAmount: invoiceVat.toFixed(2),
      });

      const itemsPayload = invoiceLines.map((l) => ({
        item_id: l.item_id,
        quantity: l.quantity,
        unit_type: "carton",
        unit_price_ex_vat: l.unit_price,
        is_bonus: false,
      }));

      // Call rpc_create_sales_invoice
      const { data, error } = await supabase.rpc("rpc_create_sales_invoice", {
        p_customer_id: selectedCustomerId,
        p_invoice_date: invoiceDate,
        p_due_date: invoiceDate,
        p_items: itemsPayload,
        p_advance_deducted: 0,
        p_source_type: "van_sale",
        p_van_warehouse_id: repVan.id,
        p_assigned_rep_id: user.id,
        p_zatca_qr_base64: zatcaQrBase64,
        p_notes: "فاتورة مبيعات ميدانية من عهدة سيارة التوزيع",
        p_created_by: user.id,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["rep-van-stock"] });
      queryClient.invalidateQueries({ queryKey: ["rep-commissions"] });
      toast.success(isArabic ? "تم إصدار الفاتورة الضريبية وترحيل عمولتك بنجاح!" : "Invoice issued successfully!");

      const customerObj = customers.find((c) => c.id === selectedCustomerId);
      setCreatedInvoiceSuccess({
        ...data,
        customerName: customerObj?.name_ar,
        customerPhone: customerObj?.phone,
        totalIncVat: invoiceTotal,
      });

      // Reset form
      setInvoiceLines([]);
      setSelectedCustomerId("");
    },
    onError: (err: any) => {
      toast.error(err.message || (isArabic ? "فشل إصدار الفاتورة" : "Invoice creation failed"));
    },
  });

  // Handler: Share WhatsApp
  const handleShareWhatsApp = (inv: any) => {
    const factory = settings?.name_ar || "مصنع الأسياح للمنظفات الصناعية";
    const invoiceNum = inv.invoice_number;
    const date = invoiceDate;
    const total = Number(inv.totalIncVat).toFixed(2);
    const customer = inv.customerName || "العميل الكريم";

    const msg = `*فاتورة ضريبية إلكترونية معتمدة - ${factory}*
رقم الفاتورة: ${invoiceNum}
التاريخ: ${date}
العميل: ${customer}
المجموع شامل الضريبة (15%): ${total} ر.س
سجل تجاري: ${settings?.cr_number || "1010000000"}
الرقم الضريبي: ${settings?.vat_number || "300000000000003"}
تم الاستلام من مندوب التوزيع: ${profile?.full_name || ""}
نشكركم لتعاملكم معنا.`;

    const encoded = encodeURIComponent(msg);
    const phone = inv.customerPhone?.replace(/[^0-9]/g, "") || "";
    const waUrl = phone
      ? `https://api.whatsapp.com/send?phone=${phone}&text=${encoded}`
      : `https://api.whatsapp.com/send?text=${encoded}`;
    window.open(waUrl, "_blank");
  };

  return (
    <div className="space-y-4 max-w-lg mx-auto pb-16">
      {/* Top Header Banner */}
      <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400">
            <Truck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight">
              {isArabic ? "بوابة المندوب والفوترة الميدانية" : "Sales Rep Mobile Portal"}
            </h1>
            <p className="text-[11px] text-slate-300">
              {profile?.full_name || "مندوب المبيعات"} • {isArabic ? "عهدة السيارة، الفواتير والعمولات" : "Van Custody & Invoicing"}
            </p>
          </div>
        </div>
        <Badge variant="outline" className="border-indigo-400/40 text-indigo-300 bg-indigo-950/40 text-[10px] py-0.5">
          {repVan?.vehicle?.plate_number || (isArabic ? "سيارة توزيع" : "Van")}
        </Badge>
      </div>

      {/* Segmented Navigation Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 h-12 bg-slate-100 p-1 rounded-xl">
          <TabsTrigger value="custody" className="rounded-lg text-xs font-bold min-h-[40px] flex items-center gap-1">
            <Package className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{isArabic ? "عهدة السيارة" : "Stock"}</span>
            <span className="sm:hidden">{isArabic ? "العهدة" : "Van"}</span>
          </TabsTrigger>

          <TabsTrigger value="invoice" className="rounded-lg text-xs font-bold min-h-[40px] flex items-center gap-1">
            <Receipt className="h-3.5 w-3.5 text-indigo-600" />
            <span className="hidden sm:inline">{isArabic ? "فاتورة جديدة" : "New Sale"}</span>
            <span className="sm:hidden">{isArabic ? "فاتورة" : "Sale"}</span>
          </TabsTrigger>

          <TabsTrigger value="customers" className="rounded-lg text-xs font-bold min-h-[40px] flex items-center gap-1">
            <Building className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{isArabic ? "العملاء" : "Clients"}</span>
            <span className="sm:hidden">{isArabic ? "عملاء" : "Clients"}</span>
          </TabsTrigger>

          <TabsTrigger value="commissions" className="rounded-lg text-xs font-bold min-h-[40px] flex items-center gap-1">
            <DollarSign className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{isArabic ? "العمولات" : "Comms"}</span>
            <span className="sm:hidden">{isArabic ? "عمولتي" : "Comms"}</span>
          </TabsTrigger>
        </TabsList>

        {/* ========================================================================= */}
        {/* TAB 1: VAN INVENTORY CUSTODY */}
        {/* ========================================================================= */}
        <TabsContent value="custody" className="space-y-3 mt-3">
          {isVanLoading ? (
            <Skeleton className="h-28 w-full rounded-xl" />
          ) : repVan ? (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-xs space-y-1 text-slate-800">
              <div className="flex items-center justify-between">
                <span className="font-bold text-indigo-950 text-sm">{repVan.name_ar}</span>
                <Badge variant="outline" className="border-indigo-400 text-indigo-800 bg-white font-mono text-[11px]">
                  لوحة: {repVan.vehicle?.plate_number || "معتمدة"}
                </Badge>
              </div>
              <p className="text-[11px] text-slate-600">
                بضاعة المنظفات المحملة حالياً في سيارة التوزيع الخاصة بك (حساب 1135)
              </p>
            </div>
          ) : (
            <div className="text-center py-6 bg-slate-50 border border-dashed rounded-xl text-xs text-slate-500">
              لا توجد سيارة توزيع مرتبطة بحسابك حالياً. راجع المدير العام لربط سيارة.
            </div>
          )}

          {/* Stock List */}
          {isStockLoading ? (
            <Skeleton className="h-48 w-full rounded-xl" />
          ) : stockItems.length === 0 ? (
            <Card className="text-center py-8 border-dashed bg-white">
              <Package className="h-10 w-10 mx-auto text-slate-300 mb-2" />
              <h3 className="font-bold text-sm text-slate-700">السيارة فارغة</h3>
              <p className="text-xs text-slate-400 mt-1">لا توجد بضاعة مسجلة في عهدة السيارة حالياً</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {stockItems.map(({ item, totalPieces, totalCartons }) => {
                const perCarton = item.pieces_per_carton || 1;
                const remainderPieces = totalPieces % perCarton;

                return (
                  <Card key={item.id} className="border-industrial-border bg-white shadow-sm p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-mono text-[10px] text-slate-400 block">{item.sku}</span>
                        <h4 className="font-bold text-sm text-slate-900">{isArabic ? item.name_ar : item.name_en}</h4>
                      </div>
                      <div className="text-end">
                        <span className="font-mono font-bold text-base text-indigo-700 tabular-nums">
                          {totalCartons} كرتون
                        </span>
                        {remainderPieces > 0 && (
                          <span className="font-mono text-[11px] text-slate-500 block">
                            + {remainderPieces} حبة
                          </span>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ========================================================================= */}
        {/* TAB 2: MOBILE INVOICE ISSUANCE */}
        {/* ========================================================================= */}
        <TabsContent value="invoice" className="space-y-3 mt-3">
          <Card className="border-industrial-border bg-white shadow-sm p-4 space-y-3">
            <div className="border-b pb-2">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                <Receipt className="h-4 w-4 text-indigo-600" />
                <span>{isArabic ? "إصدار فاتورة بيع ميدانية من عهدة السيارة" : "Issue Mobile Van Invoice"}</span>
              </h3>
              <p className="text-[11px] text-slate-500">
                {isArabic
                  ? "يتم سحب الكميات فورياً من عهدة السيارة (1135) واحتساب عمولة 2% تلقائياً"
                  : "Deducts stock from van and calculates 2% commission"}
              </p>
            </div>

            {/* Customer Selector */}
            <div>
              <Label className="text-xs font-semibold text-slate-700 mb-1 block">
                {isArabic ? "العميل المستلم" : "Select Customer"}
              </Label>
              <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder={isArabic ? "اختر العميل..." : "Select Client..."} />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name_ar} ({c.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Invoice Items */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-slate-700">
                  {isArabic ? "أصناف الفاتورة (من عهدة السيارة)" : "Invoice Items (from Van Stock)"}
                </Label>
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={addInvoiceLine}
                  className="h-7 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                >
                  <Plus className="me-1 h-3 w-3" />
                  <span>{isArabic ? "إضافة صنف" : "Add Item"}</span>
                </Button>
              </div>

              {invoiceLines.length === 0 ? (
                <div className="text-center py-6 bg-slate-50 border border-dashed rounded-lg text-xs text-slate-400">
                  {isArabic ? "انقر على زر 'إضافة صنف' لإضافة بضاعة من عهدة السيارة" : "Click 'Add Item' to start"}
                </div>
              ) : (
                <div className="space-y-2">
                  {invoiceLines.map((line, idx) => {
                    const vanItem = stockItems.find((s) => s.item.id === line.item_id);
                    return (
                      <div key={idx} className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <Select
                            value={line.item_id}
                            onValueChange={(val) => updateInvoiceLine(idx, "item_id", val)}
                          >
                            <SelectTrigger className="h-8 text-xs flex-1 me-2 bg-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {stockItems.map((s) => (
                                <SelectItem key={s.item.id} value={s.item.id}>
                                  {s.item.name_ar} (متوفر: {s.totalCartons} كرتون)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeInvoiceLine(idx)}
                            className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-[10px] text-slate-500 block mb-0.5">
                              {isArabic ? "الكمية (كرتون):" : "Cartons:"}
                            </span>
                            <Input
                              type="number"
                              min="1"
                              max={vanItem?.totalCartons || 1}
                              value={line.quantity}
                              onChange={(e) => updateInvoiceLine(idx, "quantity", parseInt(e.target.value) || 0)}
                              className="h-8 text-xs font-mono font-bold"
                            />
                          </div>

                          <div>
                            <span className="text-[10px] text-slate-500 block mb-0.5">
                              {isArabic ? "سعر الكرتون (ر.س):" : "Price (SAR):"}
                            </span>
                            <Input
                              type="number"
                              step="0.5"
                              value={line.unit_price}
                              onChange={(e) => updateInvoiceLine(idx, "unit_price", parseFloat(e.target.value) || 0)}
                              className="h-8 text-xs font-mono font-bold"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Financial Summary */}
            {invoiceLines.length > 0 && (
              <div className="bg-indigo-900 text-white rounded-xl p-3.5 space-y-1.5 text-xs">
                <div className="flex justify-between text-indigo-200">
                  <span>{isArabic ? "المجموع قبل الضريبة:" : "Subtotal:"}</span>
                  <span className="font-mono tabular-nums">{invoiceSubtotal.toFixed(2)} ر.س</span>
                </div>
                <div className="flex justify-between text-indigo-200">
                  <span>{isArabic ? "ضريبة القيمة المضافة (15%):" : "VAT (15%):"}</span>
                  <span className="font-mono tabular-nums">{invoiceVat.toFixed(2)} ر.س</span>
                </div>
                <div className="flex justify-between font-bold text-sm text-white pt-1 border-t border-indigo-800">
                  <span>{isArabic ? "الإجمالي شامل الضريبة:" : "Grand Total:"}</span>
                  <span className="font-mono tabular-nums">{invoiceTotal.toFixed(2)} ر.س</span>
                </div>
                <div className="flex justify-between text-emerald-400 text-[11px] pt-1">
                  <span>{isArabic ? "عمولتك المتوقعة (2%):" : "Your Commission (2%):"}</span>
                  <span className="font-mono font-bold tabular-nums">{(invoiceSubtotal * 0.02).toFixed(2)} ر.س</span>
                </div>
              </div>
            )}

            <Button
              onClick={() => issueInvoiceMutation.mutate()}
              disabled={issueInvoiceMutation.isPending || invoiceLines.length === 0 || !selectedCustomerId}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white min-h-[44px] font-bold text-sm shadow-sm"
            >
              <Send className="me-1.5 h-4 w-4" />
              <span>{isArabic ? "إصدار وترحيل الفاتورة الضريبية ZATCA" : "Issue Tax Invoice"}</span>
            </Button>
          </Card>
        </TabsContent>

        {/* ========================================================================= */}
        {/* TAB 3: ASSIGNED CUSTOMERS */}
        {/* ========================================================================= */}
        <TabsContent value="customers" className="space-y-3 mt-3">
          {isCustLoading ? (
            <Skeleton className="h-48 w-full rounded-xl" />
          ) : customers?.length === 0 ? (
            <Card className="text-center py-8 border-dashed bg-white">
              <Building className="h-10 w-10 mx-auto text-slate-300 mb-2" />
              <h3 className="font-bold text-sm text-slate-700">لا يوجد عملاء مرتبطين</h3>
              <p className="text-xs text-slate-400 mt-1">لم يتم تعيين عملاء تابعين لخط سيرك بعد</p>
            </Card>
          ) : (
            <div className="space-y-2.5">
              {customers?.map((cust) => (
                <Card key={cust.id} className="border-industrial-border bg-white shadow-sm p-3.5 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="font-mono text-[10px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded">
                        {cust.code}
                      </span>
                      <h4 className="font-bold text-sm text-slate-900 mt-1">{cust.name_ar}</h4>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {cust.default_payment_days} يوم
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-100 text-slate-600">
                    <a
                      href={`tel:${cust.phone}`}
                      className="flex items-center gap-1.5 text-indigo-700 hover:underline"
                    >
                      <Phone className="h-3.5 w-3.5 text-slate-400" />
                      <span className="font-mono">{cust.phone}</span>
                    </a>
                    <div className="flex items-center gap-1.5 justify-end">
                      <CreditCard className="h-3.5 w-3.5 text-slate-400" />
                      <span className="font-mono font-bold text-slate-800">
                        سقف: {cust.credit_limit.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        setSelectedCustomerId(cust.id);
                        setActiveTab("invoice");
                      }}
                      className="w-full h-8 text-xs bg-slate-900 hover:bg-slate-800 text-white"
                    >
                      <Receipt className="me-1 h-3.5 w-3.5" />
                      <span>{isArabic ? "إصدار فاتورة لهذا العميل" : "Create Invoice"}</span>
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ========================================================================= */}
        {/* TAB 4: COMMISSIONS OVERVIEW */}
        {/* ========================================================================= */}
        <TabsContent value="commissions" className="space-y-3 mt-3">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-2">
            <Card className="p-3 bg-emerald-50 border-emerald-200">
              <span className="text-[11px] text-emerald-800 block">إجمالي العمولات المستحقة</span>
              <span className="font-mono font-bold text-lg text-emerald-950 tabular-nums">
                {totalEarned.toFixed(2)} ر.س
              </span>
            </Card>

            <Card className="p-3 bg-amber-50 border-amber-200">
              <span className="text-[11px] text-amber-800 block">قيد الاعتماد والمراجعة</span>
              <span className="font-mono font-bold text-lg text-amber-950 tabular-nums">
                {pendingAmount.toFixed(2)} ر.س
              </span>
            </Card>
          </div>

          {/* Commissions List */}
          {isCommLoading ? (
            <Skeleton className="h-48 w-full rounded-xl" />
          ) : commissions?.length === 0 ? (
            <Card className="text-center py-8 border-dashed bg-white">
              <DollarSign className="h-10 w-10 mx-auto text-slate-300 mb-2" />
              <h3 className="font-bold text-sm text-slate-700">لا توجد عمولات مسجلة</h3>
              <p className="text-xs text-slate-400 mt-1">يتم احتساب العمولات تلقائياً عند ترحيل فواتير المبيعات</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {commissions?.map((comm) => (
                <Card key={comm.id} className="border-industrial-border bg-white shadow-sm p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono text-xs font-bold text-slate-900 block">
                        {comm.invoice ? (comm.invoice as any).invoice_number : "تسوية عمولة"}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        نسبة {comm.percentage}%
                      </span>
                    </div>

                    <div className="text-end">
                      <span className="font-mono font-bold text-emerald-700 tabular-nums block">
                        +{comm.commission_amount.toFixed(2)} ر.س
                      </span>
                      {comm.status === "approved" || comm.status === "paid_in_payroll" ? (
                        <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[9px] py-0">
                          معتمد
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 text-[9px] py-0">
                          قيد المراجعة
                        </Badge>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Invoice Success & WhatsApp Share Modal */}
      <Dialog open={!!createdInvoiceSuccess} onOpenChange={(o) => !o && setCreatedInvoiceSuccess(null)}>
        <DialogContent className="max-w-md text-center">
          <DialogHeader>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 mb-2">
              <FileCheck2 className="h-8 w-8" />
            </div>
            <DialogTitle className="text-emerald-800 text-lg">
              {isArabic ? "تم إصدار الفاتورة الضريبية بنجاح!" : "Invoice Issued Successfully!"}
            </DialogTitle>
            <DialogDescription>
              {isArabic
                ? `رقم الفاتورة: ${createdInvoiceSuccess?.invoice_number} • العميل: ${createdInvoiceSuccess?.customerName}`
                : `Invoice: ${createdInvoiceSuccess?.invoice_number}`}
            </DialogDescription>
          </DialogHeader>

          <div className="bg-slate-50 border rounded-xl p-4 my-2 text-xs space-y-2">
            <div className="flex justify-between font-bold text-slate-800 text-sm">
              <span>{isArabic ? "صافي المستحق للسداد:" : "Net Due:"}</span>
              <span className="font-mono tabular-nums text-emerald-700">
                {Number(createdInvoiceSuccess?.totalIncVat || 0).toFixed(2)} ر.س
              </span>
            </div>
            <p className="text-slate-500 text-[11px]">
              {isArabic
                ? "تم سحب الكميات من عهدة السيارة، وترحيل القيد المحاسبي المزدوج وقيد عمولة المبيعات."
                : "Stock deducted from van, JV posted, and commission credited."}
            </p>
          </div>

          <DialogFooter className="flex flex-col gap-2">
            <Button
              onClick={() => handleShareWhatsApp(createdInvoiceSuccess)}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white min-h-[42px] font-bold text-xs"
            >
              <Share2 className="me-2 h-4 w-4" />
              <span>{isArabic ? "إرسال الفاتورة للعميل عبر واتساب" : "Send Invoice via WhatsApp"}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setCreatedInvoiceSuccess(null)}
              className="w-full"
            >
              {isArabic ? "إغلاق" : "Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
export default RepShell;
