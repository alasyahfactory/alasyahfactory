import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Item, Warehouse } from "@/types/database";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { 
  Scale, 
  CheckCircle2, 
  Loader2, 
  AlertCircle, 
  ArrowRight, 
  History,
  FileCheck
} from "lucide-react";

interface OpeningRow {
  item_id: string;
  warehouse_id: string;
  qty: number;
  unit_cost: number;
  batch_number: string;
}

export function OpeningBalancesPage() {
  const { i18n } = useTranslation();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const isAr = i18n.language === "ar";

  const [rows, setRows] = useState<Record<string, { qty: number; unit_cost: number; batch_number: string; warehouse_id: string }>>({});

  // 1. Fetch items
  const { data: items = [], isLoading: isLoadingItems } = useQuery<Item[]>({
    queryKey: ["items_for_opening"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("*, default_warehouse:warehouses(id, name_ar, name_en)")
        .order("sku", { ascending: true });
      if (error) throw error;
      return data as Item[];
    },
  });

  // 2. Fetch warehouses
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

  const handleRowChange = (itemId: string, field: string, value: any) => {
    setRows((prev) => {
      const current = prev[itemId] || {
        qty: 0,
        unit_cost: 0,
        batch_number: "BATCH-OPEN-2026",
        warehouse_id: items.find((i) => i.id === itemId)?.default_warehouse_id || warehouses[0]?.id || "",
      };
      return {
        ...prev,
        [itemId]: {
          ...current,
          [field]: value,
        },
      };
    });
  };

  // Calculate total opening valuation
  const totalValuation = Object.entries(rows).reduce((sum, [_, row]) => {
    return sum + (Number(row.qty) || 0) * (Number(row.unit_cost) || 0);
  }, 0);

  const activeCount = Object.values(rows).filter((r) => r.qty > 0 && r.unit_cost > 0).length;

  // Mutation to call rpc_post_opening_balances
  const postMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.id) throw new Error("المستخدم غير مسجل");

      const payload = Object.entries(rows)
        .filter(([_, r]) => r.qty > 0 && r.unit_cost > 0)
        .map(([itemId, r]) => ({
          item_id: itemId,
          warehouse_id: r.warehouse_id || warehouses[0]?.id,
          qty: Number(r.qty),
          unit_cost: Number(r.unit_cost),
          batch_number: r.batch_number || "BATCH-OPEN-2026",
        }));

      if (payload.length === 0) {
        throw new Error("يرجى إدخال كمية وتكلفة لصنف واحد على الأقل");
      }

      const { data, error } = await supabase.rpc("rpc_post_opening_balances", {
        p_items_data: payload as any,
        p_created_by: profile.id,
      });

      if (error) throw error;
      return data as any;
    },
    onSuccess: (res) => {
      toast.success(
        isAr
          ? `تم ترحيل الأرصدة الافتتاحية بنجاح بقيمة ${res.total_inventory_value?.toLocaleString("en-US")} ر.س`
          : `Opening balances posted successfully. Value: ${res.total_inventory_value?.toLocaleString("en-US")} SAR`
      );
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["fifo_layers"] });
      setRows({});
    },
    onError: (err: any) => {
      toast.error(err.message || "حدث خطأ أثناء ترحيل الأرصدة الافتتاحية");
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {isAr ? "معالج الأرصدة الافتتاحية للمخزون" : "Opening Inventory Balances"}
          </h1>
          <p className="text-sm text-slate-500">
            {isAr
              ? "تسجيل بضاعة أول المدة وتوليد طبقات الـ FIFO الأولى وقيد التوازن في حساب حقوق الملكية (3102)"
              : "Post initial inventory batches, create opening FIFO layers, and post double-entry equity balance (3102)"}
          </p>
        </div>

        {/* Live Total Badge Card */}
        <div className="flex items-center gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
          <Scale className="w-5 h-5 text-sky-600" />
          <div>
            <div className="text-xs text-slate-500 font-medium">
              {isAr ? "إجمالي قيمة بضاعة أول المدة" : "Total Opening Valuation"}
            </div>
            <div className="text-lg font-bold font-mono text-slate-900 tabular-nums">
              {totalValuation.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س
            </div>
          </div>
        </div>
      </div>

      {/* Info Notice */}
      <Card className="border-sky-200 bg-sky-50/50">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
          <div className="text-sm text-sky-900 space-y-1">
            <p className="font-semibold">
              {isAr ? "قاعدة الـ FIFO والقيد المزدوج الذري:" : "Strict FIFO & Double-Entry Rule:"}
            </p>
            <p className="text-sky-800 text-xs leading-relaxed">
              {isAr
                ? "يتم إدخال الخامات السائلة والبودرة بالجرام (1 كجم = 1000 جم، وسعر الكيلو يُقسم على 1000). يتم إنشاء طبقة FIFO لكل صنف تلقائياً وإصدار قيد افتتاحي متوازن (مدين: مخزون 1131 / دائن: تسوية الأرصدة الافتتاحية 3102)."
                : "Liquid & powder materials must be entered in grams (1 Kg = 1000g, price per Kg divided by 1000). Atomic journal entries balance Inventory against 3102."}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Items Table */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold">
              {isAr ? "جدول إدخال الأرصدة الافتتاحية" : "Opening Balance Entry Grid"}
            </CardTitle>
            <CardDescription>
              {isAr
                ? `الأصناف المحددة للتسجيل: ${activeCount} صنف`
                : `Items configured: ${activeCount} items`}
            </CardDescription>
          </div>
          <Button
            onClick={() => postMutation.mutate()}
            disabled={activeCount === 0 || postMutation.isPending}
            className="bg-slate-900 text-white gap-2"
          >
            {postMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileCheck className="w-4 h-4" />
            )}
            <span>{isAr ? "ترحيل الأرصدة الافتتاحية وقيد اليومية" : "Post Opening Balances"}</span>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="w-28 font-semibold">{isAr ? "الرمز (SKU)" : "SKU"}</TableHead>
                  <TableHead className="font-semibold">{isAr ? "اسم الصنف" : "Item"}</TableHead>
                  <TableHead className="w-24 font-semibold">{isAr ? "الوحدة" : "Unit"}</TableHead>
                  <TableHead className="w-48 font-semibold">{isAr ? "المستودع المستلم" : "Warehouse"}</TableHead>
                  <TableHead className="w-40 font-semibold">{isAr ? "رقم الباتش" : "Batch #"}</TableHead>
                  <TableHead className="w-36 text-end font-semibold">{isAr ? "الكمية الافتتاحية" : "Quantity"}</TableHead>
                  <TableHead className="w-36 text-end font-semibold">{isAr ? "تكلفة الوحدة (ر.س)" : "Unit Cost (SAR)"}</TableHead>
                  <TableHead className="w-36 text-end font-semibold">{isAr ? "إجمالي القيمة" : "Subtotal"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingItems ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-44" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-28 ms-auto" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-28 ms-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24 ms-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : (
                  items.map((item) => {
                    const rowData = rows[item.id] || {
                      qty: 0,
                      unit_cost: 0,
                      batch_number: "BATCH-OPEN-2026",
                      warehouse_id: item.default_warehouse_id || warehouses[0]?.id || "",
                    };
                    const subtotal = (Number(rowData.qty) || 0) * (Number(rowData.unit_cost) || 0);

                    return (
                      <TableRow key={item.id} className={subtotal > 0 ? "bg-sky-50/30" : ""}>
                        <TableCell className="font-mono font-medium text-slate-900 tabular-nums">
                          {item.sku}
                        </TableCell>
                        <TableCell>
                          <span className="font-medium text-slate-900 block text-sm">
                            {isAr ? item.name_ar : item.name_en}
                          </span>
                          <span className="text-xs text-slate-400">
                            {isAr ? "الرصيد الحالي بالنظام: " : "Current: "}
                            {item.current_stock.toLocaleString("en-US")} {item.base_unit === "gram" ? "جم" : "حبة"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {item.base_unit === "gram" ? "جرام" : "حبة"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <select
                            value={rowData.warehouse_id}
                            onChange={(e) => handleRowChange(item.id, "warehouse_id", e.target.value)}
                            className="w-full text-xs h-8 rounded border border-slate-200 bg-white px-2 focus:ring-1 focus:ring-slate-900"
                          >
                            {warehouses.map((w) => (
                              <option key={w.id} value={w.id}>
                                {isAr ? w.name_ar : w.name_en}
                              </option>
                            ))}
                          </select>
                        </TableCell>
                        <TableCell>
                          <Input
                            value={rowData.batch_number}
                            onChange={(e) => handleRowChange(item.id, "batch_number", e.target.value)}
                            className="h-8 text-xs font-mono"
                            placeholder="BATCH-001"
                          />
                        </TableCell>
                        <TableCell className="text-end">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            value={rowData.qty || ""}
                            onChange={(e) => handleRowChange(item.id, "qty", e.target.value)}
                            placeholder="0"
                            className="h-8 text-xs text-end font-mono tabular-nums"
                          />
                        </TableCell>
                        <TableCell className="text-end">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            value={rowData.unit_cost || ""}
                            onChange={(e) => handleRowChange(item.id, "unit_cost", e.target.value)}
                            placeholder="0.00"
                            className="h-8 text-xs text-end font-mono tabular-nums"
                          />
                        </TableCell>
                        <TableCell className="text-end font-mono font-semibold tabular-nums text-slate-900 text-sm">
                          {subtotal > 0 ? `${subtotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س` : "-"}
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
