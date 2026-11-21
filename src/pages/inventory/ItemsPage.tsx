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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { 
  Plus, 
  Package, 
  Layers, 
  Search, 
  AlertTriangle, 
  CheckCircle2, 
  Loader2, 
  FlaskConical, 
  Box, 
  Sparkles,
  History
} from "lucide-react";

const itemSchema = z.object({
  sku: z.string().min(2, "رمز الصنف مطلوب"),
  name_ar: z.string().min(2, "الاسم بالعربية مطلوب"),
  name_en: z.string().min(2, "English name is required"),
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

      {/* Tabs and Search Bar */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Category Filter Pills */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={activeTab === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveTab("all")}
                className="gap-2"
              >
                <Package className="w-4 h-4" />
                <span>{isAr ? "الكل" : "All"} ({items.length})</span>
              </Button>
              <Button
                variant={activeTab === "raw_material" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveTab("raw_material")}
                className="gap-2"
              >
                <FlaskConical className="w-4 h-4" />
                <span>{isAr ? "خامات كيميائية" : "Raw Materials"}</span>
              </Button>
              <Button
                variant={activeTab === "packaging" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveTab("packaging")}
                className="gap-2"
              >
                <Box className="w-4 h-4" />
                <span>{isAr ? "مواد تعبئة" : "Packaging"}</span>
              </Button>
              <Button
                variant={activeTab === "finished_good" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveTab("finished_good")}
                className="gap-2"
              >
                <Sparkles className="w-4 h-4" />
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

      {/* Add / Edit Item Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingItem
                ? isAr ? "تعديل بيانات الصنف" : "Edit Item"
                : isAr ? "إضافة صنف جديد لدليل المواد" : "Add New Item"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={form.handleSubmit((d) => saveMutation.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* SKU */}
              <div className="space-y-1.5">
                <Label htmlFor="sku">{isAr ? "رمز الصنف (SKU) *" : "SKU *"}</Label>
                <Input
                  id="sku"
                  placeholder="e.g. RM-LABSA, PKG-GAL-5L"
                  {...form.register("sku")}
                  disabled={!!editingItem}
                  className="font-mono uppercase"
                />
                {form.formState.errors.sku && (
                  <p className="text-xs text-rose-600">{form.formState.errors.sku.message}</p>
                )}
              </div>

              {/* Item Type */}
              <div className="space-y-1.5">
                <Label htmlFor="item_type">{isAr ? "نوع الصنف *" : "Item Type *"}</Label>
                <select
                  id="item_type"
                  {...form.register("item_type")}
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  <option value="raw_material">{isAr ? "خامة كيميائية (Raw Material)" : "Raw Material"}</option>
                  <option value="packaging">{isAr ? "مواد تعبئة وتغليف (Packaging)" : "Packaging"}</option>
                  <option value="bulk_in_tank">{isAr ? "سائل سائب في التانك (Bulk WIP)" : "Bulk WIP"}</option>
                  <option value="finished_good">{isAr ? "منتج تام جاهز للبيع (Finished Good)" : "Finished Good"}</option>
                </select>
              </div>

              {/* Name AR */}
              <div className="space-y-1.5">
                <Label htmlFor="name_ar">{isAr ? "الاسم بالعربية *" : "Arabic Name *"}</Label>
                <Input id="name_ar" placeholder="سائل غسيل صحون الأسياح 5 لتر" {...form.register("name_ar")} />
                {form.formState.errors.name_ar && (
                  <p className="text-xs text-rose-600">{form.formState.errors.name_ar.message}</p>
                )}
              </div>

              {/* Name EN */}
              <div className="space-y-1.5">
                <Label htmlFor="name_en">{isAr ? "الاسم بالإنجليزية *" : "English Name *"}</Label>
                <Input id="name_en" placeholder="Al-Asyah Dishwashing Liquid 5L" {...form.register("name_en")} />
                {form.formState.errors.name_en && (
                  <p className="text-xs text-rose-600">{form.formState.errors.name_en.message}</p>
                )}
              </div>

              {/* Base Unit */}
              <div className="space-y-1.5">
                <Label htmlFor="base_unit">{isAr ? "وحدة القياس الأساسية *" : "Base Unit *"}</Label>
                <select
                  id="base_unit"
                  {...form.register("base_unit")}
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  <option value="gram">{isAr ? "جرام (Gram) - للخامات والسوائل 1 لتر = 1 كجم = 1000 جم" : "Gram (Liquids/Powder)"}</option>
                  <option value="piece">{isAr ? "حبة / قطعة (Piece) - للعبوات والكراتين والتام" : "Piece (Containers/Finished)"}</option>
                </select>
              </div>

              {/* Density */}
              <div className="space-y-1.5">
                <Label htmlFor="density">
                  {isAr ? "الكثافة النوعية (Density - كجم/لتر)" : "Density (Kg/L)"}
                </Label>
                <Input
                  id="density"
                  type="number"
                  step="0.001"
                  placeholder="1.000"
                  {...form.register("density")}
                />
              </div>

              {/* Pieces per carton */}
              {watchItemType === "finished_good" && (
                <div className="space-y-1.5">
                  <Label htmlFor="pieces_per_carton">
                    {isAr ? "عدد الحبات في الكرتون" : "Pieces Per Carton"}
                  </Label>
                  <Input
                    id="pieces_per_carton"
                    type="number"
                    min="1"
                    placeholder="4"
                    {...form.register("pieces_per_carton")}
                  />
                </div>
              )}

              {/* Volume per unit (grams) */}
              {watchItemType === "finished_good" && (
                <div className="space-y-1.5">
                  <Label htmlFor="volume_per_unit_grams">
                    {isAr ? "وزن/حجم العبوة الواحدة (جرام)" : "Volume per unit (grams)"}
                  </Label>
                  <Input
                    id="volume_per_unit_grams"
                    type="number"
                    step="1"
                    placeholder="5000"
                    {...form.register("volume_per_unit_grams")}
                  />
                </div>
              )}

              {/* Reorder Point */}
              <div className="space-y-1.5">
                <Label htmlFor="reorder_point">
                  {isAr ? "حد إعادة الطلب (Reorder Alert)" : "Reorder Point Alert"}
                </Label>
                <Input
                  id="reorder_point"
                  type="number"
                  step="any"
                  placeholder="0"
                  {...form.register("reorder_point")}
                />
              </div>

              {/* Shelf Life Months */}
              <div className="space-y-1.5">
                <Label htmlFor="shelf_life_months">
                  {isAr ? "فترة الصلاحية (أشهر)" : "Shelf Life (Months)"}
                </Label>
                <Input
                  id="shelf_life_months"
                  type="number"
                  min="1"
                  placeholder="24"
                  {...form.register("shelf_life_months")}
                />
              </div>

              {/* Default Warehouse */}
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="default_warehouse_id">
                  {isAr ? "المستودع الافتراضي للصنف" : "Default Warehouse"}
                </Label>
                <select
                  id="default_warehouse_id"
                  {...form.register("default_warehouse_id")}
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  <option value="">{isAr ? "-- اختر المستودع الافتراضي --" : "-- Select Warehouse --"}</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {isAr ? w.name_ar : w.name_en} ({w.warehouse_type})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <DialogFooter className="pt-4 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button type="submit" disabled={saveMutation.isPending} className="bg-slate-900 text-white gap-2">
                {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{editingItem ? (isAr ? "حفظ التعديلات" : "Update Item") : (isAr ? "إضافة الصنف" : "Create Item")}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* FIFO Layers Viewer Dialog */}
      <Dialog open={!!selectedFifoItem} onOpenChange={(open) => !open && setSelectedFifoItem(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-sky-600" />
              <span>
                {isAr ? "طبقات التكلفة (FIFO Layers) للصنف:" : "FIFO Cost Layers:"}{" "}
                <span className="font-mono text-sky-700">{selectedFifoItem?.sku}</span>
              </span>
            </DialogTitle>
            <p className="text-sm text-slate-500">
              {isAr ? selectedFifoItem?.name_ar : selectedFifoItem?.name_en}
            </p>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border border-slate-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="font-semibold">{isAr ? "رقم الباتش" : "Batch #"}</TableHead>
                    <TableHead className="font-semibold">{isAr ? "المستودع" : "Warehouse"}</TableHead>
                    <TableHead className="font-semibold">{isAr ? "تاريخ الطبقة" : "Layer Date"}</TableHead>
                    <TableHead className="text-end font-semibold">{isAr ? "الكمية المتبقية" : "Remaining"}</TableHead>
                    <TableHead className="text-end font-semibold">{isAr ? "سعر الوحدة (بدون ضريبة)" : "Unit Cost (ex VAT)"}</TableHead>
                    <TableHead className="text-end font-semibold">{isAr ? "إجمالي قيمة الطبقة" : "Total Value"}</TableHead>
                    <TableHead className="text-center font-semibold">{isAr ? "الحالة" : "Status"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingFifo ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-6">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" />
                      </TableCell>
                    </TableRow>
                  ) : fifoLayers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                        {isAr ? "لا توجد طبقات FIFO مسجلة لهذا الصنف بعد" : "No FIFO layers recorded yet"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    fifoLayers.map((layer) => {
                      const totalVal = layer.remaining_qty * layer.unit_cost_ex_vat;
                      return (
                        <TableRow key={layer.id} className={layer.is_closed ? "opacity-60 bg-slate-50/50" : ""}>
                          <TableCell className="font-mono font-medium text-slate-900">
                            {layer.batch_number}
                          </TableCell>
                          <TableCell className="text-sm">
                            {(layer as any).warehouse?.name_ar || "-"}
                          </TableCell>
                          <TableCell className="text-xs text-slate-500">
                            {new Date(layer.layer_date).toLocaleDateString(isAr ? "ar-SA" : "en-US")}
                          </TableCell>
                          <TableCell className="text-end font-semibold tabular-nums text-slate-900">
                            {formatQuantity(layer.remaining_qty, selectedFifoItem?.base_unit || "gram")}
                          </TableCell>
                          <TableCell className="text-end font-mono tabular-nums text-slate-700">
                            {layer.unit_cost_ex_vat.toFixed(4)} ر.س
                          </TableCell>
                          <TableCell className="text-end font-mono font-semibold tabular-nums text-emerald-700">
                            {totalVal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س
                          </TableCell>
                          <TableCell className="text-center">
                            {layer.is_closed || layer.remaining_qty <= 0 ? (
                              <Badge variant="outline" className="text-slate-400 text-xs">
                                {isAr ? "مقفلة / مستهلكة" : "Closed"}
                              </Badge>
                            ) : (
                              <Badge className="bg-emerald-600 text-white text-xs">
                                {isAr ? "مفتوحة" : "Active"}
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
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedFifoItem(null)}>
              {isAr ? "إغلاق" : "Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
