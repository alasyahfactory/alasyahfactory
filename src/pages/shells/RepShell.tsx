import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import type { Customer, SalesRepCommission, Warehouse, Item } from "@/types/database";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Eye,
} from "lucide-react";

export function RepShell() {
  const { t, i18n } = useTranslation();
  const { user, profile } = useAuth();
  const isArabic = i18n.language === "ar";

  const [activeTab, setActiveTab] = useState("custody");

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
  const { data: customers, isLoading: isCustLoading } = useQuery<Customer[]>({
    queryKey: ["rep-customers", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("assigned_rep_id", user.id)
        .order("name_ar");

      if (error) throw error;
      return data || [];
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

  // Group Stock by Item
  const groupedStockMap = new Map<string, { item: any; totalPieces: number }>();
  vanStock?.forEach((layer) => {
    if (layer.item) {
      const existing = groupedStockMap.get(layer.item.id);
      if (existing) {
        existing.totalPieces += Number(layer.remaining_qty);
      } else {
        groupedStockMap.set(layer.item.id, {
          item: layer.item,
          totalPieces: Number(layer.remaining_qty),
        });
      }
    }
  });
  const stockItems = Array.from(groupedStockMap.values());

  // Total Commissions Calculation
  const totalEarned = commissions?.reduce((acc, c) => acc + Number(c.commission_amount), 0) || 0;
  const pendingAmount =
    commissions?.filter((c) => c.status === "pending").reduce((acc, c) => acc + Number(c.commission_amount), 0) || 0;

  return (
    <div className="space-y-4 max-w-lg mx-auto pb-16">
      {/* Top Header Banner */}
      <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400">
            <Truck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight">بوابة المندوب الميداني</h1>
            <p className="text-[11px] text-slate-300">
              {profile?.full_name || "مندوب المبيعات"} • عهدة السيارة والعمولات
            </p>
          </div>
        </div>
        <Badge variant="purple" className="text-[10px] py-0.5">
          <Eye className="me-1 h-3 w-3" />
          عرض فقط
        </Badge>
      </div>

      {/* Segmented Navigation Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-12 bg-slate-100 p-1 rounded-xl">
          <TabsTrigger value="custody" className="rounded-lg text-xs font-bold min-h-[40px] flex items-center gap-1.5">
            <Package className="h-4 w-4" />
            <span>عهدة السيارة</span>
          </TabsTrigger>
          <TabsTrigger value="customers" className="rounded-lg text-xs font-bold min-h-[40px] flex items-center gap-1.5">
            <Building className="h-4 w-4" />
            <span>العملاء</span>
          </TabsTrigger>
          <TabsTrigger value="commissions" className="rounded-lg text-xs font-bold min-h-[40px] flex items-center gap-1.5">
            <DollarSign className="h-4 w-4" />
            <span>العمولات</span>
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: Van Inventory Custody */}
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
            <Card className="text-center py-8 border-dashed">
              <Package className="h-10 w-10 mx-auto text-slate-300 mb-2" />
              <h3 className="font-bold text-sm text-slate-700">السيارة فارغة</h3>
              <p className="text-xs text-slate-400 mt-1">لا توجد بضاعة مسجلة في عهدة السيارة حالياً</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {stockItems.map(({ item, totalPieces }) => {
                const perCarton = item.pieces_per_carton || 1;
                const cartons = Math.floor(totalPieces / perCarton);
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
                          {cartons} كرتون
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

        {/* TAB 2: Assigned Customers */}
        <TabsContent value="customers" className="space-y-3 mt-3">
          {isCustLoading ? (
            <Skeleton className="h-48 w-full rounded-xl" />
          ) : customers?.length === 0 ? (
            <Card className="text-center py-8 border-dashed">
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
                    <div className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-slate-400" />
                      <span className="font-mono">{cust.phone}</span>
                    </div>
                    <div className="flex items-center gap-1.5 justify-end">
                      <CreditCard className="h-3.5 w-3.5 text-slate-400" />
                      <span className="font-mono font-bold text-slate-800">
                        سقف: {cust.credit_limit.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {cust.national_address && (
                    <p className="text-[11px] text-slate-500 truncate pt-1">
                      {cust.national_address}
                    </p>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* TAB 3: Commissions Overview */}
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
            <Card className="text-center py-8 border-dashed">
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
                        {comm.invoice ? comm.invoice.invoice_number : "تسوية عمولة"}
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
                        <Badge variant="emerald" className="text-[9px] py-0">
                          معتمد
                        </Badge>
                      ) : (
                        <Badge variant="amber" className="text-[9px] py-0">
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
    </div>
  );
}
