import { printDocumentHtml, saveDocumentPdfFromHtml, shareDocumentWhatsApp } from "@/utils/printAndPdf";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/lib/supabase";
import { Item, ItemType, BaseUnit, FifoLayer, Warehouse } from "@/types/database";
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
  ArrowRight, 
  Package, 
  Layers, 
  Search, 
  AlertTriangle, 
  CheckCircle2, 
  Loader2, 
  FlaskConical, 
  Box, 
  Sparkles,
  History,
  Printer,
  FileDown,
  Share2
} from "lucide-react";

const itemSchema = z.object({
  sku: z.string().min(2, "رمز الصنف مطلوب"),
  name_ar: z.string().min(2, "الاسم بالعربية مطلوب"),
  name_en: z.string().optional().default(""),
  item_type: z.enum(["raw_material", "packaging", "bulk_in_tank", "finished_good"]),
  base_unit: z.enum(["gram", "piece"]),
  density: z.coerce.number().min(0.1, "الكثافة يجب أن تكون أكبر من صفر").default(1.0),
  pieces_per_carton: z.coerce.number().min(1).default(1),
  volume_per_unit_grams: z.coerce.number().min(0).default(0),
  shelf_life_months: z.coerce.number().min(1).default(24),
  reorder_point: z.coerce.number().min(0).default(0),
  default_warehouse_id: z.string().optional().nullable(),
});

type ItemFormData = z.infer<typeof itemSchema>;

export function ItemsPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const isAr = i18n.language === "ar";

  const [activeTab, setActiveTab] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [selectedFifoItem, setSelectedFifoItem] = useState<Item | null>(null);

  // 1. Fetch Items
  const { data: items = [], isLoading } = useQuery<Item[]>({
    queryKey: ["items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select(`
          *,
          default_warehouse:warehouses(id, name_ar, name_en)
        `)
        .order("sku", { ascending: true });
      if (error) throw error;
      return data as Item[];
    },
  });

  // 2. Fetch Warehouses
  const { data: warehouses = [] } = useQuery<Warehouse[]>({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("*")
        .eq("is_active", true);
      if (error) throw error;
      return data as Warehouse[];
    },
  });

  // 3. Fetch FIFO Layers for selected item
  const { data: fifoLayers = [], isLoading: isLoadingFifo } = useQuery<FifoLayer[]>({
    queryKey: ["fifo_layers", selectedFifoItem?.id],
    enabled: !!selectedFifoItem,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fifo_layers")
        .select("*, warehouse:warehouses(name_ar, name_en)")
        .eq("item_id", selectedFifoItem!.id)
        .order("layer_date", { ascending: true });
      if (error) throw error;
      return data as FifoLayer[];
    },
  });

  // Form setup
  const form = useForm<ItemFormData>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      sku: "",
      name_ar: "",
      name_en: "",
      item_type: "raw_material",
      base_unit: "gram",
      density: 1.0,
      pieces_per_carton: 1,
      volume_per_unit_grams: 0,
      shelf_life_months: 24,
      reorder_point: 0,
      default_warehouse_id: null,
    },
  });

  const watchItemType = form.watch("item_type");

  // Save Item mutation
  const saveMutation = useMutation({
    mutationFn: async (formData: ItemFormData) => {
      if (editingItem) {
        const { error } = await supabase
          .from("items")
          .update({
            sku: formData.sku,
            name_ar: formData.name_ar,
            name_en: formData.name_en,
            item_type: formData.item_type,
            base_unit: formData.base_unit,
            density: formData.density,
            pieces_per_carton: formData.pieces_per_carton,
            volume_per_unit_grams: formData.volume_per_unit_grams,
            shelf_life_months: formData.shelf_life_months,
            reorder_point: formData.reorder_point,
            default_warehouse_id: formData.default_warehouse_id || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("items").insert([
          {
            sku: formData.sku,
            name_ar: formData.name_ar,
            name_en: formData.name_en,
            item_type: formData.item_type,
            base_unit: formData.base_unit,
            density: formData.density,
            pieces_per_carton: formData.pieces_per_carton,
            volume_per_unit_grams: formData.volume_per_unit_grams,
            shelf_life_months: formData.shelf_life_months,
            reorder_point: formData.reorder_point,
            default_warehouse_id: formData.default_warehouse_id || null,
            current_stock: 0,
          },
        ]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      toast.success(editingItem ? "تم تحديث الصنف بنجاح" : "تمت إضافة الصنف بنجاح");
      setIsAddOpen(false);
      setEditingItem(null);
      form.reset();
    },
    onError: (err: any) => {
      toast.error(err.message || "حدث خطأ أثناء حفظ الصنف");
    },
  });

  const openCreateDialog = () => {
    setEditingItem(null);
    form.reset({
      sku: "",
      name_ar: "",
      name_en: "",
      item_type: "raw_material",
      base_unit: "gram",
      density: 1.0,
      pieces_per_carton: 1,
      volume_per_unit_grams: 0,
      shelf_life_months: 24,
      reorder_point: 0,
      default_warehouse_id: warehouses[0]?.id || null,
    });
    setIsAddOpen(true);
  };

  const openEditDialog = (item: Item) => {
    setEditingItem(item);
    form.reset({
      sku: item.sku,
      name_ar: item.name_ar,
      name_en: item.name_en,
      item_type: item.item_type,
      base_unit: item.base_unit,
      density: item.density || 1.0,
      pieces_per_carton: item.pieces_per_carton || 1,
      volume_per_unit_grams: item.volume_per_unit_grams || 0,
      shelf_life_months: item.shelf_life_months || 24,
      reorder_point: item.reorder_point || 0,
      default_warehouse_id: item.default_warehouse_id,
    });
    setIsAddOpen(true);
  };

  // Filtered Items
  const filteredItems = items.filter((item) => {
    const matchesTab = activeTab === "all" || item.item_type === activeTab;
    const matchesSearch =
      item.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.name_ar.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.name_en.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const getItemTypeBadge = (type: ItemType) => {
    switch (type) {
      case "raw_material":
        return <Badge variant="secondary" className="bg-sky-50 text-sky-700 border-sky-200">خامة كيميائية</Badge>;
      case "packaging":
        return <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-200">تعبئة وتغليف</Badge>;
      case "bulk_in_tank":
        return <Badge variant="secondary" className="bg-purple-50 text-purple-700 border-purple-200">سائب في تانك</Badge>;
      case "finished_good":
        return <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200">منتج تام</Badge>;
      default:
        return null;
    }
  };

  const formatQuantity = (qty: number, unit: BaseUnit) => {
    if (unit === "gram") {
      if (qty >= 1000000) {
        return `${(qty / 1000000).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} طن (${qty.toLocaleString("en-US")} جم)`;
      }
      if (qty >= 1000) {
        return `${(qty / 1000).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} كجم (${qty.toLocaleString("en-US")} جم)`;
      }
      return `${qty.toLocaleString("en-US")} جم`;
    }
    return `${qty.toLocaleString("en-US")} حبة`;
  };

  // 1. Material Design 3 In-Page Canvas View for FIFO Layers Inspection
  if (selectedFifoItem) {
    const totalRemaining = fifoLayers.reduce((sum, l) => sum + (l.remaining_qty || 0), 0);
    const totalCostValue = fifoLayers.reduce((sum, l) => sum + ((l.remaining_qty || 0) * (l.unit_cost_ex_vat || 0)), 0);
    const avgCost = totalRemaining > 0 ? (totalCostValue / totalRemaining) : 0;

    
  const getFifoLayersHtml = (selectedFifoItem: Item, fifoLayers: FifoLayer[], totalRemaining: number, totalCostValue: number, avgCost: number) => {
    const itemTitle = isAr ? selectedFifoItem.name_ar : selectedFifoItem.name_en;
    const docTitle = `كشف طبقات التكلفة FIFO - ${selectedFifoItem.sku}`;
    const rows = fifoLayers.map((l, idx) => `
      <tr>
        <td class="tabular" style="text-align: center;">${idx + 1}</td>
        <td class="tabular font-bold">${l.batch_number || "-"}</td>
        <td class="tabular" style="text-align: center;">${l.layer_date || "-"}</td>
        <td class="tabular" style="text-align: center;">${l.expiry_date || "-"}</td>
        <td class="tabular" style="text-align: center; font-weight: bold;">${l.remaining_qty?.toLocaleString("en-US")}</td>
        <td class="tabular" style="text-align: right;">${Number(l.unit_cost_ex_vat || 0).toFixed(4)} ر.س</td>
        <td class="tabular font-bold" style="text-align: right;">${((l.remaining_qty || 0) * (l.unit_cost_ex_vat || 0)).toFixed(2)} ر.س</td>
      </tr>
    `).join("") || `
      <tr><td colspan="7" style="text-align: center; color: #94a3b8; padding: 20px;">لا توجد طبقات تكلفة مسجلة</td></tr>
    `;

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
              .badge { display: inline-block; padding: 4px 14px; background: #0f172a; color: #fff; font-weight: bold; font-size: 15px; border-radius: 4px; }
              .meta-card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px; background: #f8fafc; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 12px; }
              table { width: 100%; border-collapse: collapse; margin-top: 10px; }
              th { border: 1px solid #cbd5e1; background: #f1f5f9; padding: 8px; font-size: 11px; font-weight: bold; }
              td { border: 1px solid #cbd5e1; padding: 8px; font-size: 12px; }
              .tabular { font-family: monospace; font-variant-numeric: tabular-nums; }
              .totals-box { margin-top: 20px; margin-right: auto; width: 340px; border: 1px solid #cbd5e1; border-radius: 6px; background: #f8fafc; padding: 12px; font-size: 12px; }
              .totals-row { display: flex; justify-content: space-between; padding: 4px 0; }
              .totals-row.grand { border-top: 2px solid #0f172a; margin-top: 6px; padding-top: 8px; font-weight: bold; font-size: 14px; }
              .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 30px; margin-top: 40px; text-align: center; }
              .sig-box { border-top: 1px dashed #94a3b8; padding-top: 8px; font-size: 11px; }
            </style>
          </head>
          <body>
            <div class="header-grid">
              <div style="text-align: ${isAr ? "right" : "left"};">
                <div style="font-weight: bold; font-size: 15px;">مصنع الأسياح للمنتجات الكيميائية</div>
                <div style="font-size: 11px; color: #64748b;">سجل تجاري: 1010000000 | الرقم الضريبي: 300000000000003</div>
                <div style="font-size: 11px; color: #64748b;">إدارة المستودعات ومراقبة المخزون</div>
              </div>
              <div style="text-align: center;">
                <div class="badge">كشف طبقات التكلفة الوارد أولاً يُصرف أولاً (FIFO)</div>
                <div style="font-size: 13px; font-family: monospace; font-weight: bold; margin-top: 4px;">${selectedFifoItem.sku}</div>
              </div>
              <div style="text-align: ${isAr ? "left" : "right"}; direction: ltr;">
                <div style="font-weight: bold; font-size: 14px;">Al-Asyah Chemical Factory</div>
                <div style="font-size: 11px; color: #64748b;">FIFO Layers Inventory Report</div>
                <div style="font-size: 11px; color: #64748b;">Date: ${new Date().toISOString().split("T")[0]}</div>
              </div>
            </div>

            <div class="meta-card">
              <div><strong>الصنف:</strong> <span>${itemTitle}</span></div>
              <div><strong>رمز الصنف (SKU):</strong> <span class="tabular font-bold">${selectedFifoItem.sku}</span></div>
              <div><strong>الوحدة الأساسية:</strong> <span>${selectedFifoItem.base_unit === "gram" ? "جرام" : "حبة"}</span></div>
              <div><strong>إجمالي الرصيد الفعلي المتوفر:</strong> <span class="tabular font-bold">${formatQuantity(totalRemaining, selectedFifoItem.base_unit)}</span></div>
              <div><strong>متوسط تكلفة الوحدة:</strong> <span class="tabular font-bold">${avgCost.toFixed(4)} ر.س</span></div>
              <div><strong>إجمالي القيمة التقديرية للمخزون:</strong> <span class="tabular font-bold text-emerald-700">${totalCostValue.toFixed(2)} ر.س</span></div>
            </div>

            <table>
              <thead>
                <tr>
                  <th style="width: 35px; text-align: center;">#</th>
                  <th>رقم التشغيلة / الشحنة (Batch #)</th>
                  <th style="width: 90px; text-align: center;">تاريخ الطبقة</th>
                  <th style="width: 90px; text-align: center;">تاريخ الانتهاء</th>
                  <th style="width: 90px; text-align: center;">الكمية المتبقية</th>
                  <th style="width: 100px; text-align: right;">تكلفة الوحدة</th>
                  <th style="width: 120px; text-align: right;">القيمة الإجمالية</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>

            <div class="totals-box">
              <div class="totals-row">
                <span>إجمالي الكمية المتوفرة:</span>
                <span class="tabular">${totalRemaining.toLocaleString("en-US")}</span>
              </div>
              <div class="totals-row">
                <span>متوسط التكلفة المرجح:</span>
                <span class="tabular">${avgCost.toFixed(4)} ر.س</span>
              </div>
              <div class="totals-row grand">
                <span>إجمالي تقييم الطبقات:</span>
                <span class="tabular">${totalCostValue.toFixed(2)} ر.س</span>
              </div>
            </div>

            <div class="signatures">
              <div class="sig-box">
                <div style="font-weight: bold; margin-bottom: 35px;">أمين المستودع</div>
                <div>التوقيع: ............................</div>
              </div>
              <div class="sig-box">
                <div style="font-weight: bold; margin-bottom: 35px;">محاسب التكاليف</div>
                <div>التوقيع: ............................</div>
              </div>
              <div class="sig-box">
                <div style="font-weight: bold; margin-bottom: 35px;">اعتماد المدير المالي</div>
                <div>الختم والتوقيع: ............................</div>
              </div>
            </div>

            
          </body>
        </html>
      `;
  };

  const handlePrintFifoLayers = () => {
    if (!selectedFifoItem) return;
    const totalRemaining = fifoLayers.reduce((sum, l) => sum + (l.remaining_qty || 0), 0);
    const totalCostValue = fifoLayers.reduce((sum, l) => sum + ((l.remaining_qty || 0) * (l.unit_cost_ex_vat || 0)), 0);
    const avgCost = totalRemaining > 0 ? (totalCostValue / totalRemaining) : 0;
    printDocumentHtml(getFifoLayersHtml(selectedFifoItem, fifoLayers, totalRemaining, totalCostValue, avgCost), `طبقات_FIFO_${selectedFifoItem.sku}`);
  };

  const handleSavePdfFifoLayers = () => {
    if (!selectedFifoItem) return;
    const totalRemaining = fifoLayers.reduce((sum, l) => sum + (l.remaining_qty || 0), 0);
    const totalCostValue = fifoLayers.reduce((sum, l) => sum + ((l.remaining_qty || 0) * (l.unit_cost_ex_vat || 0)), 0);
    const avgCost = totalRemaining > 0 ? (totalCostValue / totalRemaining) : 0;
    saveDocumentPdfFromHtml(getFifoLayersHtml(selectedFifoItem, fifoLayers, totalRemaining, totalCostValue, avgCost), `طبقات_FIFO_${selectedFifoItem.sku}`);
  };

    const handleShareFifoWhatsApp = () => {
      const itemTitle = isAr ? selectedFifoItem.name_ar : selectedFifoItem.name_en;
      const msg = `*تقرير طبقات التكلفة FIFO - مصنع الأسياح للمنظفات*
الصنف: ${itemTitle} (${selectedFifoItem.sku})
الرصيد الفعلي الحالي: ${formatQuantity(selectedFifoItem.current_stock, selectedFifoItem.base_unit)}
عدد الطبقات المسجلة: ${fifoLayers.length}
متوسط التكلفة: ${avgCost.toFixed(4)} ر.س
إجمالي القيمة التقديرية للمخزون: ${totalCostValue.toFixed(2)} ر.س`;
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, "_blank");
    };

    return (
      <div className="space-y-6 max-w-5xl mx-auto pb-16 animate-in fade-in duration-200">
        {/* Top Header Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3">
            <Button
              variant="tonal"
              size="sm"
              onClick={() => setSelectedFifoItem(null)}
              className="gap-1.5"
            >
              <ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
              <span>{isAr ? "العودة لدليل الأصناف" : "Back to Items"}</span>
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-purple-600" />
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  {isAr ? "سجل طبقات التكلفة (FIFO Layers)" : "FIFO Cost Layers"}
                </h1>
                <Badge variant="outline" className="font-mono text-xs">
                  {selectedFifoItem.sku}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {isAr ? selectedFifoItem.name_ar : selectedFifoItem.name_en} • {getItemTypeBadge(selectedFifoItem.item_type)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            <Button
              variant="filled"
              size="sm"
              onClick={handlePrintFifoLayers}
              className="min-h-[36px] px-3 gap-1.5 shadow-sm text-xs"
              title={isAr ? "طباعة تقرير الطبقات A4" : "Print Layers Report A4"}
            >
              <Printer className="h-3.5 w-3.5 text-sky-400" />
              <span>{isAr ? "طباعة A4" : "Print A4"}</span>
            </Button>
            <Button
              variant="tonal"
              size="sm"
              onClick={handleSavePdfFifoLayers}
              className="min-h-[36px] px-3 gap-1.5 text-xs font-semibold"
              title={isAr ? "حفظ التقرير بصيغة PDF" : "Save as PDF"}
            >
              <FileDown className="h-3.5 w-3.5 text-sky-700" />
              <span>{isAr ? "حفظ PDF" : "Save PDF"}</span>
            </Button>
            <Button
              variant="emerald"
              size="sm"
              onClick={handleShareFifoWhatsApp}
              className="min-h-[36px] px-3 gap-1.5 text-xs"
              title={isAr ? "مشاركة عبر واتساب" : "Share via WhatsApp"}
            >
              <Share2 className="h-3.5 w-3.5 text-emerald-100" />
              <span>{isAr ? "واتساب" : "WhatsApp"}</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSelectedFifoItem(null)}>
              {isAr ? "إغلاق" : "Close"}
            </Button>
          </div>
        </div>

        {/* 3 Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-4 border-slate-200 shadow-sm">
            <span className="text-xs text-slate-500 font-medium block mb-1">
              {isAr ? "إجمالي الرصيد الفعلي المتوفر" : "Total Remaining Stock"}
            </span>
            <span className="text-lg font-bold font-mono text-slate-900 tabular-nums">
              {formatQuantity(totalRemaining, selectedFifoItem.base_unit)}
            </span>
          </Card>
          <Card className="p-4 border-slate-200 shadow-sm">
            <span className="text-xs text-slate-500 font-medium block mb-1">
              {isAr ? "متوسط تكلفة الوحدة التقديري" : "Average Unit Cost"}
            </span>
            <span className="text-lg font-bold font-mono text-slate-900 tabular-nums">
              {avgCost.toFixed(4)} ر.س
            </span>
          </Card>
          <Card className="p-4 border-slate-200 shadow-sm">
            <span className="text-xs text-slate-500 font-medium block mb-1">
              {isAr ? "إجمالي القيمة التقديرية للطبقات" : "Total Valuation"}
            </span>
            <span className="text-lg font-bold font-mono text-emerald-700 tabular-nums">
              {totalCostValue.toFixed(2)} ر.س
            </span>
          </Card>
        </div>

        {/* FIFO Layers Table */}
        <Card className="border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="py-3 px-4 border-b border-slate-100 bg-slate-50">
            <CardTitle className="text-sm font-bold text-slate-800">
              {isAr ? `الطبقات المسجلة للصنف (${fifoLayers.length} طبقة)` : `Registered Layers (${fifoLayers.length})`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-100/75">
                    <TableHead>{isAr ? "رقم التشغيلة (Batch #)" : "Batch #"}</TableHead>
                    <TableHead>{isAr ? "تاريخ التوريد" : "Layer Date"}</TableHead>
                    <TableHead className="text-end">{isAr ? "الكمية الأصلية" : "Initial Qty"}</TableHead>
                    <TableHead className="text-end">{isAr ? "الكمية المتبقية" : "Remaining Qty"}</TableHead>
                    <TableHead className="text-end">{isAr ? "تكلفة الوحدة" : "Unit Cost"}</TableHead>
                    <TableHead className="text-end">{isAr ? "إجمالي القيمة" : "Total Value"}</TableHead>
                    <TableHead>{isAr ? "تاريخ الانتهاء" : "Expiry Date"}</TableHead>
                    <TableHead className="text-center">{isAr ? "الحالة" : "Status"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingFifo ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={8}><Skeleton className="h-6 w-full" /></TableCell>
                      </TableRow>
                    ))
                  ) : fifoLayers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-slate-400">
                        {isAr ? "لا توجد طبقات FIFO مسجلة لهذا الصنف حتى الآن" : "No FIFO layers recorded yet"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    fifoLayers.map((layer) => {
                      const isDepleted = layer.remaining_qty <= 0;
                      return (
                        <TableRow key={layer.id} className={isDepleted ? "opacity-50 bg-slate-50/50" : ""}>
                          <TableCell className="font-mono font-bold text-slate-900">{layer.batch_number}</TableCell>
                          <TableCell className="font-mono text-slate-600">{layer.layer_date}</TableCell>
                          <TableCell className="text-end font-mono tabular-nums">
                            {formatQuantity(layer.initial_qty, selectedFifoItem.base_unit)}
                          </TableCell>
                          <TableCell className="text-end font-mono tabular-nums font-bold text-slate-900">
                            {formatQuantity(layer.remaining_qty, selectedFifoItem.base_unit)}
                          </TableCell>
                          <TableCell className="text-end font-mono tabular-nums">
                            {layer.unit_cost_ex_vat.toFixed(4)} ر.س
                          </TableCell>
                          <TableCell className="text-end font-mono tabular-nums font-semibold text-emerald-700">
                            {(layer.remaining_qty * layer.unit_cost_ex_vat).toFixed(2)} ر.س
                          </TableCell>
                          <TableCell className="font-mono text-slate-600">{layer.expiry_date || "-"}</TableCell>
                          <TableCell className="text-center">
                            {isDepleted ? (
                              <Badge variant="outline" className="text-[10px] text-slate-400">
                                {isAr ? "مستنفذة" : "Depleted"}
                              </Badge>
                            ) : (
                              <Badge variant="emerald" className="text-[10px]">
                                {isAr ? "متاحة للسحب" : "Available"}
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 2. Material Design 3 In-Page Canvas View for Item Creation & Editing
  if (isAddOpen) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto pb-16 animate-in fade-in duration-200">
        {/* Top Header Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3">
            <Button
              variant="tonal"
              size="sm"
              type="button"
              onClick={() => {
                setIsAddOpen(false);
                setEditingItem(null);
                form.reset();
              }}
              className="gap-1.5"
            >
              <ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
              <span>{isAr ? "العودة لدليل الأصناف" : "Back to Items"}</span>
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-sky-600" />
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  {editingItem
                    ? isAr
                      ? `تعديل بيانات الصنف: ${editingItem.name_ar}`
                      : `Edit Item: ${editingItem.name_en}`
                    : isAr
                    ? "إضافة صنف ومادة جديدة"
                    : "Add New Item"}
                </h1>
                {editingItem && (
                  <Badge variant="outline" className="font-mono text-xs">
                    {editingItem.sku}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {isAr
                  ? "تعريف الصنف بدقة وتحديد الوحدة الأساسية والكثافة ومستودع التخزين وحد الطلب"
                  : "Define SKU, base units, chemical density, and stock parameters"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => {
                setIsAddOpen(false);
                setEditingItem(null);
                form.reset();
              }}
            >
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              size="sm"
              disabled={saveMutation.isPending}
              onClick={form.handleSubmit(
                (data) => saveMutation.mutate({ ...data, name_en: data.name_en || data.name_ar }),
                (errs) => {
                  const first = Object.values(errs)[0]?.message;
                  toast.error(first ? String(first) : (isAr ? "يرجى تعبئة الحقول المطلوبة بشكل صحيح" : "Please fill in all required fields"));
                }
              )}
              className="bg-slate-900 hover:bg-slate-800 text-white min-h-[38px] px-5 gap-1.5 font-bold shadow-sm"
            >
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>
                {saveMutation.isPending
                  ? isAr
                    ? "جاري الحفظ..."
                    : "Saving..."
                  : editingItem
                  ? isAr
                    ? "تحديث بيانات الصنف"
                    : "Update Item"
                  : isAr
                  ? "حفظ الصنف في الدليل"
                  : "Save Item"}
              </span>
            </Button>
          </div>
        </div>

        {/* In-Page Form Cards */}
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Main Item Properties */}
            <div className="lg:col-span-2 space-y-6">
              {/* Basic Identification Card */}
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-3 border-b border-slate-100">
                  <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Package className="h-4 w-4 text-sky-600" />
                    <span>{isAr ? "البيانات التعريفية والتصنيف" : "Identification & Category"}</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    {isAr ? "كود الصنف والاسم بالعربية والإنجليزية وتصنيف الاستخدام بالمصنع" : "Item code, names, and factory categorization"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <Label className="text-xs font-semibold">{isAr ? "رمز الصنف (SKU) *" : "SKU *"}</Label>
                      <Input
                        placeholder="مثال: RM-001, FG-100"
                        {...form.register("sku")}
                        className="mt-1 font-mono uppercase bg-white"
                      />
                      {form.formState.errors.sku && (
                        <p className="text-rose-600 text-[11px] mt-1">{form.formState.errors.sku.message}</p>
                      )}
                    </div>

                    <div className="sm:col-span-2">
                      <Label className="text-xs font-semibold">{isAr ? "تصنيف الصنف بالمصنع *" : "Item Category *"}</Label>
                      <select
                        {...form.register("item_type")}
                        className="mt-1 w-full h-10 px-3 py-2 text-xs rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                      >
                        <option value="raw_material">خامة كيميائية أولية (Raw Material)</option>
                        <option value="packaging">مواد تعبئة وتغليف (Packaging Material)</option>
                        <option value="bulk_in_tank">سائل كيميائي سائب في تانك (Bulk in Tank)</option>
                        <option value="finished_good">منتج تام معبأ وجاهز للبيع (Finished Good)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs font-semibold">{isAr ? "اسم الصنف (بالعربية) *" : "Arabic Name *"}</Label>
                      <Input
                        placeholder="مثال: حمض السلفونيك 96%"
                        {...form.register("name_ar")}
                        className="mt-1 bg-white"
                      />
                      {form.formState.errors.name_ar && (
                        <p className="text-rose-600 text-[11px] mt-1">{form.formState.errors.name_ar.message}</p>
                      )}
                    </div>

                    <div>
                      <Label className="text-xs font-semibold">{isAr ? "اسم الصنف (بالإنجليزية) *" : "English Name *"}</Label>
                      <Input
                        placeholder="e.g. Linear Alkylbenzene Sulphonic Acid"
                        {...form.register("name_en")}
                        className="mt-1 bg-white font-sans"
                      />
                      {form.formState.errors.name_en && (
                        <p className="text-rose-600 text-[11px] mt-1">{form.formState.errors.name_en.message}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">{isAr ? "مستودع التخزين الافتراضي" : "Default Warehouse"}</Label>
                    <select
                      {...form.register("default_warehouse_id")}
                      className="mt-1 w-full h-10 px-3 py-2 text-xs rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                    >
                      <option value="">{isAr ? "-- اختر المستودع الافتراضي للصنف --" : "-- Select Warehouse --"}</option>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {isAr ? w.name_ar : w.name_en} ({w.code})
                        </option>
                      ))}
                    </select>
                  </div>
                </CardContent>
              </Card>

              {/* Technical & Chemical Properties Card */}
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-3 border-b border-slate-100">
                  <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <FlaskConical className="h-4 w-4 text-purple-600" />
                    <span>{isAr ? "المقاييس الفنية والكيميائية ومعايير التعبئة" : "Technical & Packaging Specifications"}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs font-semibold">{isAr ? "الوحدة الأساسية بالمخزون *" : "Base Inventory Unit *"}</Label>
                      <select
                        {...form.register("base_unit")}
                        className="mt-1 w-full h-10 px-3 py-2 text-xs rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                      >
                        <option value="gram">جرام (للسوائل والمساحيق والخامات الكيميائية)</option>
                        <option value="piece">حبة / قطعة (للكراتين والعبوات والأغطية)</option>
                      </select>
                      <p className="text-[11px] text-slate-400 mt-1">
                        {isAr ? "ملاحظة: 1 كجم = 1,000 جم، 1 طن = 1,000,000 جم" : "1 kg = 1,000 g, 1 ton = 1,000,000 g"}
                      </p>
                    </div>

                    <div>
                      <Label className="text-xs font-semibold">{isAr ? "الكثافة النوعية (Density g/cm³)" : "Specific Density (g/cm³)"}</Label>
                      <Input
                        type="number"
                        step="0.001"
                        {...form.register("density")}
                        className="mt-1 font-mono tabular-nums bg-white"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        {isAr ? "تستخدم للتحويل بين الوزن (كجم) والحجم (لتر) في التنكات" : "Used for volume to weight conversion in tanks"}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                    <div>
                      <Label className="text-xs font-semibold">{isAr ? "عدد الحبات في الكرتون (للمنتج التام)" : "Pieces per Carton"}</Label>
                      <Input
                        type="number"
                        min="1"
                        {...form.register("pieces_per_carton")}
                        className="mt-1 font-mono tabular-nums bg-white"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        {isAr ? "افتراضي: 1 للقطع الفردية، أو عدد العبوات في كل كرتون شحن" : "E.g. 12 bottles per master carton"}
                      </p>
                    </div>

                    <div>
                      <Label className="text-xs font-semibold">{isAr ? "وزن / حجم العبوة الفردية (بالجرام)" : "Volume per unit (Grams)"}</Label>
                      <Input
                        type="number"
                        min="0"
                        {...form.register("volume_per_unit_grams")}
                        className="mt-1 font-mono tabular-nums bg-white"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        {isAr ? "مثال: عبوة 1 لتر منظف تزن حوالي 1050 جرام" : "Single bottle net weight in grams"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right 1 Col: Stock Alerts & Shelf Life */}
            <div className="space-y-6">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-3 border-b border-slate-100">
                  <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <span>{isAr ? "إدارة المخزون والتنبيهات" : "Stock & Reorder Parameters"}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <div>
                    <Label className="text-xs font-semibold">{isAr ? "حد إعادة الطلب (Reorder Point)" : "Reorder Point"}</Label>
                    <Input
                      type="number"
                      min="0"
                      {...form.register("reorder_point")}
                      className="mt-1 font-mono tabular-nums bg-white font-bold"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      {isAr
                        ? "يظهر النظام تنبيهاً باللون البرتقالي عندما يقل الرصيد عن هذا الحد"
                        : "Trigger warning badge when stock drops below this level"}
                    </p>
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">{isAr ? "مدة الصلاحية (بالأشهر)" : "Shelf Life (Months)"}</Label>
                    <Input
                      type="number"
                      min="1"
                      {...form.register("shelf_life_months")}
                      className="mt-1 font-mono tabular-nums bg-white"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      {isAr ? "تستخدم لحساب تاريخ انتهاء التشغيلات آلياً (افتراضي 24 شهر)" : "Auto calculates batch expiry date (default 24m)"}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-slate-800">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span>{isAr ? "قواعد إدارة المخزون" : "Inventory Rule"}</span>
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      {isAr
                        ? "يتم تتبع تكلفة هذا الصنف بنظام الوارد أولاً صادر أولاً (FIFO) الصارم، ولا يمكن بيع أو استهلاك الصنف بسعر أقل من تكلفته دون تنبيه."
                        : "Strict FIFO cost layers are automatically maintained for every GRN and Batch."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
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
            {isAr ? "دليل الأصناف والمواد" : "Items & Materials Catalog"}
          </h1>
          <p className="text-sm text-slate-500">
            {isAr
              ? "إدارة الخامات الكيميائية ومواد التعبئة والمنتج التام مع تتبع طبقات FIFO وحد إعادة الطلب"
              : "Manage chemical raw materials, packaging, and finished goods with strict FIFO and reorder points"}
          </p>
        </div>
        <Button onClick={openCreateDialog} className="bg-slate-900 hover:bg-slate-800 text-white gap-2">
          <Plus className="w-4 h-4" />
          <span>{isAr ? "إضافة صنف جديد" : "Add Item"}</span>
        </Button>
      </div>

      {/* 2026 Modern Inventory KPI Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <div className="stat-card-2026 accent-slate">
          <span className="text-xs font-bold text-slate-500 tracking-tight block mb-1">
            {isAr ? "إجمالي الأصناف المسجلة" : "Total Catalog Items"}
          </span>
          <div className="text-xl sm:text-2xl font-black font-mono text-slate-900 tabular-nums tracking-tight">
            {items.length} {isAr ? "صنف" : "Items"}
          </div>
          <div className="mt-2 text-[11px] text-slate-600 font-semibold bg-slate-100 px-2 py-0.5 rounded-full inline-block">
            {isAr ? "المستودع والمصنع" : "Factory Wide"}
          </div>
        </div>

        <div className="stat-card-2026 accent-sky">
          <span className="text-xs font-bold text-slate-500 tracking-tight block mb-1">
            {isAr ? "خامات كيميائية أولية" : "Raw Materials"}
          </span>
          <div className="text-xl sm:text-2xl font-black font-mono text-sky-700 tabular-nums tracking-tight">
            {items.filter((i) => i.item_type === "raw_material").length} {isAr ? "خامة" : "Materials"}
          </div>
          <div className="mt-2 text-[11px] text-sky-700 font-semibold bg-sky-50 px-2 py-0.5 rounded-full inline-block border border-sky-200/60">
            {isAr ? "طبقات FIFO" : "FIFO Tracked"}
          </div>
        </div>

        <div className="stat-card-2026 accent-emerald">
          <span className="text-xs font-bold text-slate-500 tracking-tight block mb-1">
            {isAr ? "منتجات تامة معبأة" : "Finished Goods"}
          </span>
          <div className="text-xl sm:text-2xl font-black font-mono text-emerald-700 tabular-nums tracking-tight">
            {items.filter((i) => i.item_type === "finished_good").length} {isAr ? "منتج تام" : "Products"}
          </div>
          <div className="mt-2 text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full inline-block border border-emerald-200/60">
            {isAr ? "جاهزة للبيع والتوزيع" : "Ready for Sale"}
          </div>
        </div>

        <div className="stat-card-2026 accent-rose">
          <span className="text-xs font-bold text-slate-500 tracking-tight block mb-1">
            {isAr ? "تنبيهات حد إعادة الطلب" : "Low Stock Alerts"}
          </span>
          <div className="text-xl sm:text-2xl font-black font-mono text-rose-700 tabular-nums tracking-tight">
            {items.filter((i) => i.reorder_point > 0 && i.current_stock <= i.reorder_point).length} {isAr ? "صنف منخفض" : "Low Stock"}
          </div>
          <div className="mt-2 text-[11px] text-rose-700 font-semibold bg-rose-50 px-2 py-0.5 rounded-full inline-block border border-rose-200/60">
            {isAr ? "يتطلب أمر شراء" : "Reorder Needed"}
          </div>
        </div>
      </div>

      {/* Tabs and Search Bar */}
      <Card className="border-slate-200/80 bg-white/95 backdrop-blur-sm shadow-subtle rounded-2xl">
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Category Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-slate-100/80 border border-slate-200/60">
              <Button
                variant={activeTab === "all" ? "filled" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("all")}
                className="gap-1.5 text-xs font-bold rounded-lg h-8"
              >
                <Package className="w-3.5 h-3.5" />
                <span>{isAr ? "الكل" : "All"} ({items.length})</span>
              </Button>
              <Button
                variant={activeTab === "raw_material" ? "filled" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("raw_material")}
                className="gap-1.5 text-xs font-bold rounded-lg h-8"
              >
                <FlaskConical className="w-3.5 h-3.5 text-sky-500" />
                <span>{isAr ? "خامات كيميائية" : "Raw Materials"}</span>
              </Button>
              <Button
                variant={activeTab === "packaging" ? "filled" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("packaging")}
                className="gap-1.5 text-xs font-bold rounded-lg h-8"
              >
                <Box className="w-3.5 h-3.5 text-amber-500" />
                <span>{isAr ? "مواد تعبئة" : "Packaging"}</span>
              </Button>
              <Button
                variant={activeTab === "finished_good" ? "filled" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("finished_good")}
                className="gap-1.5 text-xs font-bold rounded-lg h-8"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                <span>{isAr ? "منتج تام" : "Finished Goods"}</span>
              </Button>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder={isAr ? "بحث بالرمز أو الاسم..." : "Search by SKU or name..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="ps-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Items Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            {isAr ? "قائمة الأصناف المسجلة" : "Registered Items"}
          </CardTitle>
          <CardDescription>
            {isAr
              ? `عرض ${filteredItems.length} من أصل ${items.length} صنف`
              : `Showing ${filteredItems.length} of ${items.length} items`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="w-28 font-semibold">{isAr ? "رمز الصنف (SKU)" : "SKU"}</TableHead>
                  <TableHead className="font-semibold">{isAr ? "اسم الصنف" : "Item Name"}</TableHead>
                  <TableHead className="w-32 font-semibold">{isAr ? "التصنيف" : "Category"}</TableHead>
                  <TableHead className="w-24 font-semibold">{isAr ? "الوحدة" : "Unit"}</TableHead>
                  <TableHead className="w-44 text-end font-semibold">{isAr ? "الرصيد الفعلي الحالي" : "Current Stock"}</TableHead>
                  <TableHead className="w-32 text-end font-semibold">{isAr ? "حد الطلب" : "Reorder Point"}</TableHead>
                  <TableHead className="w-32 text-center font-semibold">{isAr ? "الحالة" : "Status"}</TableHead>
                  <TableHead className="w-32 text-center font-semibold">{isAr ? "طبقات الـ FIFO" : "FIFO Layers"}</TableHead>
                  <TableHead className="w-20 text-center font-semibold">{isAr ? "إجراء" : "Action"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-28 ms-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16 ms-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-24 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-12 mx-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-10 text-slate-500">
                      {isAr ? "لا توجد أصناف مطابقة للبحث" : "No items found matching search"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredItems.map((item) => {
                    const isLowStock = item.reorder_point > 0 && item.current_stock <= item.reorder_point;
                    return (
<TableRow key={item.id} className="hover:bg-slate-50/80">
                        <TableCell className="font-mono font-medium text-slate-900 tabular-nums">
                          {item.sku}
                        </TableCell>
                        <TableCell>
                          <div>
                            <span className="font-medium text-slate-900 block">
                              {isAr ? item.name_ar : item.name_en || item.name_ar}
                            </span>
                            <span className="text-xs text-slate-500 block">
                              {isAr ? item.name_en : item.name_ar}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{getItemTypeBadge(item.item_type)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {item.base_unit === "gram" ? "جرام / g" : "حبة / pc"}
                          </Badge>
                          {item.density && item.density !== 1.0 && (
                            <span className="text-[10px] text-slate-400 block mt-0.5">
                              d={item.density}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-end font-semibold text-slate-900 tabular-nums">
                          {formatQuantity(item.current_stock, item.base_unit)}
                        </TableCell>
                        <TableCell className="text-end text-slate-600 tabular-nums">
                          {item.reorder_point > 0
                            ? formatQuantity(item.reorder_point, item.base_unit)
                            : "-"}
                        </TableCell>
                        <TableCell className="text-center">
                          {isLowStock ? (
                            <Badge variant="destructive" className="bg-amber-500 text-white hover:bg-amber-600 gap-1 text-xs">
                              <AlertTriangle className="w-3 h-3" />
                              <span>{isAr ? "منخفض" : "Low Stock"}</span>
                            </Badge>
                          ) : item.current_stock > 0 ? (
                            <Badge className="bg-emerald-600 text-white gap-1 text-xs">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>{isAr ? "متوفر" : "In Stock"}</span>
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-slate-400 text-xs">
                              {isAr ? "صفر" : "Zero"}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedFifoItem(item)}
                            className="gap-1.5 text-xs text-sky-700 hover:text-sky-800 hover:bg-sky-50"
                          >
                            <History className="w-3.5 h-3.5" />
                            <span>{isAr ? "الطبقات" : "Layers"}</span>
                          </Button>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(item)}
                            className="text-xs"
                          >
                            {isAr ? "تعديل" : "Edit"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
