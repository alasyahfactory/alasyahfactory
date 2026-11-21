import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import type {
  PurchaseOrder,
  PurchaseReceipt,
  Warehouse,
  Item,
  StocktakingSession,
  StocktakingLine,
  VanCustodyTransfer,
  MixingBatch,
} from "@/types/database";

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
  Package,
  Truck,
  Scale,
  ClipboardCheck,
  CheckCircle2,
  Clock,
  Plus,
  AlertTriangle,
  FileText,
  Search,
  Droplets,
  Layers,
  ArrowRight,
  ShieldCheck,
  Building,
} from "lucide-react";

interface GrnLineInput {
  item_id: string;
  weight_kg: number;
  received_qty: number;
  unit_cost_ex_vat: number;
  batch_number: string;
  notes: string;
}

export function WarehouseShell() {
  const { t, i18n } = useTranslation();
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const isArabic = i18n.language === "ar";

  const [activeTab, setActiveTab] = useState("grn");

  // GRN Receipt Modal State
  const [grnModalOpen, setGrnModalOpen] = useState(false);
  const [selectedPo, setSelectedPo] = useState<PurchaseOrder | null>(null);
  const [receivingWarehouseId, setReceivingWarehouseId] = useState("");
  const [supplierDnNumber, setSupplierDnNumber] = useState("");
  const [grnLines, setGrnLines] = useState<GrnLineInput[]>([]);

  // Van Loading Modal State
  const [vanModalOpen, setVanModalOpen] = useState(false);
  const [selectedVanId, setSelectedVanId] = useState("");
  const [vanItemId, setVanItemId] = useState("");
  const [vanCartons, setVanCartons] = useState<number>(10);
  const [vanNotes, setVanNotes] = useState("");

  // Stocktaking Quick Count State
  const [activeCountSession, setActiveCountSession] = useState<StocktakingSession | null>(null);
  const [quickCounts, setQuickCounts] = useState<{ [lineId: string]: number }>({});

  // 1. Fetch Approved Purchase Orders awaiting receipt
  const { data: pendingPos = [], isLoading: isPosLoading } = useQuery<PurchaseOrder[]>({
    queryKey: ["warehouse-pending-pos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select(`
          *,
          supplier:suppliers(id, name_ar, name_en),
          target_warehouse:warehouses(id, name_ar, name_en),
          lines:purchase_order_lines(
            id, item_id, ordered_qty, received_qty, unit_price_ex_vat,
            item:items(id, sku, name_ar, name_en, base_unit, pieces_per_carton, density)
          )
        `)
        .in("status", ["approved", "partially_received"])
        .order("order_date", { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as PurchaseOrder[];
    },
  });

  // 2. Fetch Warehouses
  const { data: warehouses = [] } = useQuery<Warehouse[]>({
    queryKey: ["warehouse-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("*")
        .eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
  });

  // 3. Fetch Finished Goods Items for Van Loading
  const { data: finishedGoods = [] } = useQuery<Item[]>({
    queryKey: ["finished-goods-list"],
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
  });

  // 4. Fetch Mixing Batches for Material Issuance
  const { data: mixingBatches = [] } = useQuery<MixingBatch[]>({
    queryKey: ["warehouse-mixing-batches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mixing_batches")
        .select(`
          *,
          tank:tanks(tank_number, name_ar),
          formula:formulas(code, name_ar, planned_yield_kg)
        `)
        .in("status", ["mixing", "pending_qc"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as MixingBatch[];
    },
  });

  // 5. Fetch Active Stocktaking Session
  const { data: stocktakingSessions = [] } = useQuery<StocktakingSession[]>({
    queryKey: ["warehouse-stocktaking-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stocktaking_sessions")
        .select(`
          *,
          warehouse:warehouses(id, name_ar, code),
          lines:stocktaking_lines(
            id, item_id, physical_qty, unit_cost,
            item:items(id, sku, name_ar, name_en, base_unit, pieces_per_carton)
          )
        `)
        .in("status", ["draft", "in_progress"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as StocktakingSession[];
    },
  });

  // 6. Recent Goods Receipts
  const { data: recentReceipts = [] } = useQuery<PurchaseReceipt[]>({
    queryKey: ["warehouse-recent-receipts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_receipts")
        .select(`
          *,
          supplier:suppliers(name_ar),
          warehouse:warehouses(name_ar)
        `)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data || []) as unknown as PurchaseReceipt[];
    },
  });

  // Filter Sales Vans
  const vanWarehouses = warehouses.filter((w) => w.warehouse_type === "sales_van");
  const physicalWarehouses = warehouses.filter((w) => w.warehouse_type !== "sales_van");

  // Handler: Open GRN Modal for a PO
  const handleOpenGrn = (po: PurchaseOrder) => {
    setSelectedPo(po);
    setReceivingWarehouseId(po.target_warehouse_id || physicalWarehouses[0]?.id || "");
    setSupplierDnNumber("");

    const lines: GrnLineInput[] = (po as any).lines?.map((l: any, idx: number) => {
      const remaining = Number(l.ordered_qty) - Number(l.received_qty || 0);
      const isGram = l.item?.base_unit === "gram";
      return {
        item_id: l.item_id,
        weight_kg: isGram ? remaining / 1000 : 0,
        received_qty: remaining,
        unit_cost_ex_vat: Number(l.unit_price_ex_vat) || 0,
        batch_number: `LOT-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${idx + 1}`,
        notes: "",
      };
    }) || [];

    setGrnLines(lines);
    setGrnModalOpen(true);
  };

  // Submit GRN Mutation (Creates receipt & calls rpc_receive_fifo)
  const submitGrnMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPo || !receivingWarehouseId) {
        throw new Error(isArabic ? "يرجى اختيار المستودع المستلم" : "Select warehouse");
      }
      if (grnLines.length === 0 || grnLines.some((l) => l.received_qty <= 0)) {
        throw new Error(isArabic ? "يرجى إدخال وزن أو كمية استلام صحيحة" : "Enter valid quantity");
      }

      const receiptNumber = `GRN-${new Date().toISOString().slice(0, 7).replace("-", "")}-${Math.floor(1000 + Math.random() * 9000)}`;

      // 1. Insert Purchase Receipt Header
      const { data: rHeader, error: rErr } = await supabase
        .from("purchase_receipts")
        .insert({
          receipt_number: receiptNumber,
          purchase_order_id: selectedPo.id,
          supplier_id: selectedPo.supplier_id,
          warehouse_id: receivingWarehouseId,
          supplier_delivery_note: supplierDnNumber.trim() || null,
          receipt_date: new Date().toISOString().slice(0, 10),
          received_by: user?.id,
          freight_cost: 0,
          status: "pending",
        })
        .select()
        .single();

      if (rErr) throw rErr;

      // 2. Insert Receipt Lines
      const linesToInsert = grnLines.map((l) => ({
        receipt_id: rHeader.id,
        item_id: l.item_id,
        weight_kg: l.weight_kg > 0 ? l.weight_kg : null,
        received_qty: l.received_qty,
        unit_cost_ex_vat: l.unit_cost_ex_vat,
        batch_number: l.batch_number,
        notes: l.notes || null,
      }));

      const { error: lErr } = await supabase.from("purchase_receipt_lines").insert(linesToInsert);
      if (lErr) throw lErr;

      // 3. Call rpc_receive_fifo to generate FIFO layers & update inventory
      const { error: fErr } = await supabase.rpc("rpc_receive_fifo", {
        p_receipt_id: rHeader.id,
        p_created_by: user?.id,
      });

      if (fErr) throw fErr;
      return rHeader;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouse-pending-pos"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-recent-receipts"] });
      toast.success(isArabic ? "تم استلام الشحنة وتوليد طبقات الـ FIFO بنجاح!" : "Goods received successfully!");
      setGrnModalOpen(false);
      setSelectedPo(null);
    },
    onError: (err: any) => {
      toast.error(err.message || (isArabic ? "فشل استلام الشحنة" : "Receipt failed"));
    },
  });

  // Submit Van Loading Mutation
  const submitVanLoadingMutation = useMutation({
    mutationFn: async () => {
      if (!selectedVanId || !vanItemId || vanCartons <= 0) {
        throw new Error(isArabic ? "يرجى اختيار سيارة التوزيع والصنف وعدد الكراتين" : "Fill required fields");
      }

      const item = finishedGoods.find((i) => i.id === vanItemId);
      if (!item) throw new Error("Item not found");

      const piecesPerCarton = item.pieces_per_carton || 1;
      const totalPieces = vanCartons * piecesPerCarton;
      const transferNumber = `VAN-LOAD-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${Math.floor(100 + Math.random() * 900)}`;

      // Default source warehouse: finished goods warehouse
      const sourceWh = warehouses.find((w) => w.warehouse_type === "finished_goods") || warehouses[0];
      const targetVan = warehouses.find((w) => w.id === selectedVanId);

      // 1. Insert Transfer Header
      const { data: transfer, error: tErr } = await supabase
        .from("van_custody_transfers")
        .insert({
          transfer_number: transferNumber,
          source_warehouse_id: sourceWh.id,
          target_warehouse_id: selectedVanId,
          assigned_rep_id: targetVan?.assigned_rep_id || null,
          vehicle_id: targetVan?.vehicle_id || null,
          transfer_type: "load_to_van",
          transfer_date: new Date().toISOString().slice(0, 10),
          status: "confirmed_by_warehouse",
          confirmed_by: user?.id,
          confirmed_at: new Date().toISOString(),
          created_by: user?.id,
          notes: vanNotes || null,
        })
        .select()
        .single();

      if (tErr) throw tErr;

      // 2. Insert Transfer Item
      const { error: iErr } = await supabase.from("van_custody_items").insert({
        transfer_id: transfer.id,
        item_id: vanItemId,
        quantity: vanCartons,
        unit_type: "carton",
        pieces_count: totalPieces,
      });

      if (iErr) throw iErr;
      return transfer;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["van-transfers-list"] });
      toast.success(isArabic ? "تم صرف وتحميل بضاعة العهدة على سيارة التوزيع بنجاح!" : "Van loaded successfully!");
      setVanModalOpen(false);
      setVanItemId("");
      setVanCartons(10);
      setVanNotes("");
    },
    onError: (err: any) => {
      toast.error(err.message || (isArabic ? "فشل تحميل السيارة" : "Loading failed"));
    },
  });

  // Save Physical Count Mutation
  const savePhysicalCountMutation = useMutation({
    mutationFn: async ({ lineId, physicalQty }: { lineId: string; physicalQty: number }) => {
      const { error } = await supabase
        .from("stocktaking_lines")
        .update({
          physical_qty: physicalQty,
        })
        .eq("id", lineId);

      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouse-stocktaking-sessions"] });
      toast.success(isArabic ? "تم حفظ العد الفعلي للصنف" : "Physical count saved");
    },
    onError: (err: any) => {
      toast.error(err.message || (isArabic ? "فشل حفظ العد" : "Failed to save"));
    },
  });

  return (
    <div className="space-y-4 max-w-2xl mx-auto pb-16">
      {/* Top Warehouse Header Banner */}
      <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
            <Package className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight">
              {isArabic ? "بوابة المستودع والوزن الميداني" : "Warehouse Operations Portal"}
            </h1>
            <p className="text-[11px] text-slate-300">
              {profile?.full_name || "أمين المستودع"} • {isArabic ? "استلام الميزان، الصرف والجرد" : "Scale Receiving & Logistics"}
            </p>
          </div>
        </div>
        <Badge variant="outline" className="border-emerald-500/40 text-emerald-300 bg-emerald-950/40 text-[10px] py-0.5">
          <ShieldCheck className="me-1 h-3 w-3" />
          {isArabic ? "أمين مستودع" : "Warehouse"}
        </Badge>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 h-12 bg-slate-100 p-1 rounded-xl">
          <TabsTrigger value="grn" className="rounded-lg text-xs font-bold min-h-[40px] flex items-center gap-1">
            <Scale className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{isArabic ? "استلام المشتريات" : "Receipts"}</span>
            <span className="sm:hidden">{isArabic ? "استلام" : "GRN"}</span>
          </TabsTrigger>

          <TabsTrigger value="van" className="rounded-lg text-xs font-bold min-h-[40px] flex items-center gap-1">
            <Truck className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{isArabic ? "تحميل السيارات" : "Van Load"}</span>
            <span className="sm:hidden">{isArabic ? "السيارات" : "Vans"}</span>
          </TabsTrigger>

          <TabsTrigger value="mixing" className="rounded-lg text-xs font-bold min-h-[40px] flex items-center gap-1">
            <Droplets className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{isArabic ? "صرف الخلط" : "Batches"}</span>
            <span className="sm:hidden">{isArabic ? "الخلط" : "Mix"}</span>
          </TabsTrigger>

          <TabsTrigger value="stocktaking" className="rounded-lg text-xs font-bold min-h-[40px] flex items-center gap-1">
            <ClipboardCheck className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{isArabic ? "الجرد الأعمى" : "Stocktaking"}</span>
            <span className="sm:hidden">{isArabic ? "الجرد" : "Count"}</span>
          </TabsTrigger>
        </TabsList>

        {/* ========================================================================= */}
        {/* TAB 1: GOODS RECEIPTS (GRN) & SCALE WEIGHING */}
        {/* ========================================================================= */}
        <TabsContent value="grn" className="space-y-3 mt-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-slate-700">
              {isArabic ? "أوامر الشراء المعتمدة بانتظار الاستلام الميداني" : "Approved POs Pending Receipt"}
            </span>
            <Badge variant="outline" className="text-[11px] font-mono">
              {pendingPos.length} {isArabic ? "طلب معتمد" : "POs"}
            </Badge>
          </div>

          {isPosLoading ? (
            <Skeleton className="h-36 w-full rounded-xl" />
          ) : pendingPos.length === 0 ? (
            <Card className="text-center py-8 border-dashed bg-white">
              <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-500 mb-2" />
              <h3 className="font-bold text-sm text-slate-800">
                {isArabic ? "لا توجد شحنات معلقة للاستلام" : "No pending shipments"}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {isArabic ? "كافة أوامر الشراء المعتمدة تم استلامها بالكامل" : "All approved purchase orders have been received."}
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {pendingPos.map((po) => {
                const totalLines = (po as any).lines?.length || 0;
                return (
                  <Card key={po.id} className="border-industrial-border bg-white shadow-sm p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-slate-900">{po.po_number}</span>
                          <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 text-[10px]">
                            {po.status === "approved" ? (isArabic ? "معتمد للاستلام" : "Approved") : (isArabic ? "استلام جزئي" : "Partial")}
                          </Badge>
                        </div>
                        <span className="text-xs text-slate-600 block mt-1 font-medium">
                          {isArabic ? "المورد:" : "Supplier:"} {(po as any).supplier?.name_ar || "مورد معتمد"}
                        </span>
                      </div>

                      <Button
                        size="sm"
                        onClick={() => handleOpenGrn(po)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white min-h-[38px] px-3.5 text-xs font-bold shadow-sm"
                      >
                        <Scale className="me-1.5 h-4 w-4" />
                        <span>{isArabic ? "استلام بالميزان" : "Weigh & Receive"}</span>
                      </Button>
                    </div>

                    {/* PO Items Preview */}
                    <div className="bg-slate-50 rounded-lg p-2.5 text-xs space-y-1.5 border border-slate-100">
                      {(po as any).lines?.map((line: any) => {
                        const isGram = line.item?.base_unit === "gram";
                        const remaining = Number(line.ordered_qty) - Number(line.received_qty || 0);
                        return (
                          <div key={line.id} className="flex items-center justify-between text-slate-700">
                            <span className="truncate max-w-[200px]">
                              {line.item?.name_ar || line.item?.sku}
                            </span>
                            <span className="font-mono font-semibold text-slate-900">
                              {isGram
                                ? `${(remaining / 1000).toFixed(2)} كجم (${remaining.toLocaleString()} جم)`
                                : `${remaining.toLocaleString()} حبة`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Recent Receipts Log */}
          {recentReceipts.length > 0 && (
            <div className="pt-2">
              <span className="text-xs font-bold text-slate-500 block mb-2">
                {isArabic ? "آخر سندات الاستلام المسجلة مؤخراً" : "Recent Goods Receipts"}
              </span>
              <div className="space-y-2">
                {recentReceipts.map((rc) => (
                  <div
                    key={rc.id}
                    className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-lg text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-slate-900 block">{rc.receipt_number}</span>
                      <span className="text-[11px] text-slate-500">
                        {(rc as any).supplier?.name_ar} • {rc.receipt_date}
                      </span>
                    </div>
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-300 text-[10px]">
                      {isArabic ? "مرحل FIFO" : "FIFO Posted"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ========================================================================= */}
        {/* TAB 2: VAN LOADING & LOGISTICS */}
        {/* ========================================================================= */}
        <TabsContent value="van" className="space-y-3 mt-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-slate-700">
              {isArabic ? "تحميل وصرف بضاعة تامة لسيارات التوزيع" : "Van Custody Dispatch"}
            </span>
            <Button
              size="sm"
              onClick={() => setVanModalOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white min-h-[36px] text-xs font-bold"
            >
              <Plus className="me-1.5 h-3.5 w-3.5" />
              <span>{isArabic ? "تحميل سيارة جديدة" : "New Van Load"}</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {vanWarehouses.map((van) => (
              <Card key={van.id} className="border-industrial-border bg-white shadow-sm p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-indigo-600" />
                    <span className="font-bold text-xs text-slate-900">{van.name_ar}</span>
                  </div>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {van.code}
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-500">
                  {isArabic ? "مستودع سيارة متنقل معتمد لحسابات 1135" : "Mobile sales van warehouse"}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSelectedVanId(van.id);
                    setVanModalOpen(true);
                  }}
                  className="w-full h-8 text-xs font-semibold border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                >
                  <Plus className="me-1 h-3 w-3" />
                  <span>{isArabic ? "صرف بضاعة لهذه السيارة" : "Load Goods"}</span>
                </Button>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ========================================================================= */}
        {/* TAB 3: MATERIAL ISSUANCE FOR MIXING BATCHES */}
        {/* ========================================================================= */}
        <TabsContent value="mixing" className="space-y-3 mt-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-slate-700">
              {isArabic ? "تشغيلات الخلط الحالية بصالة الإنتاج" : "Active Mixing Batches"}
            </span>
            <Badge variant="outline" className="text-[11px] font-mono">
              {mixingBatches.length} {isArabic ? "تشغيلة" : "Batches"}
            </Badge>
          </div>

          {mixingBatches.length === 0 ? (
            <Card className="text-center py-8 border-dashed bg-white">
              <Droplets className="h-10 w-10 mx-auto text-slate-300 mb-2" />
              <h3 className="font-bold text-sm text-slate-700">
                {isArabic ? "لا توجد تشغيلات خلط جارية حالياً" : "No active batches"}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {isArabic ? "كافة التانكات خالية أو تم الانتهاء من خلطها وتعبئتها" : "Tanks are idle or finished."}
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {mixingBatches.map((batch) => (
                <Card key={batch.id} className="border-industrial-border bg-white shadow-sm p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono font-bold text-xs text-slate-900 block">{batch.batch_number}</span>
                      <h4 className="font-bold text-sm text-slate-800 mt-0.5">
                        {(batch as any).formula?.name_ar || (isArabic ? "تركيبة كيميائية" : "Formula")}
                      </h4>
                    </div>
                    <Badge variant="outline" className="bg-sky-50 text-sky-800 border-sky-300 text-xs">
                      {(batch as any).tank?.name_ar || "تانك خلط"}
                    </Badge>
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded text-xs flex items-center justify-between text-slate-600">
                    <span>{isArabic ? "الحجم المخطط:" : "Planned:"} {(Number(batch.planned_qty_grams) / 1000).toFixed(0)} كجم</span>
                    <Badge variant="outline" className="text-[10px] bg-white">
                      {batch.status === "mixing" ? (isArabic ? "خلط وتشغيل" : "Mixing") : (isArabic ? "بانتظار QC" : "QC Gate")}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ========================================================================= */}
        {/* TAB 4: PHYSICAL BLIND STOCKTAKING */}
        {/* ========================================================================= */}
        <TabsContent value="stocktaking" className="space-y-3 mt-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-slate-700">
              {isArabic ? "جلسات الجرد الفعلي المفتوحة بالمستودع" : "Active Stocktaking Sessions"}
            </span>
            <Badge variant="outline" className="text-[11px] font-mono">
              {stocktakingSessions.length} {isArabic ? "جلسة مفتوحة" : "Active"}
            </Badge>
          </div>

          {stocktakingSessions.length === 0 ? (
            <Card className="text-center py-8 border-dashed bg-white">
              <ClipboardCheck className="h-10 w-10 mx-auto text-slate-300 mb-2" />
              <h3 className="font-bold text-sm text-slate-700">
                {isArabic ? "لا توجد جلسات جرد مفتوحة" : "No open stocktaking"}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {isArabic ? "يمكن للمحاسب أو المدير العام فتح جلسة جرد جديدة من شاشة الجرد والتسويات." : "Accountant/Owner can initiate stocktaking."}
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {stocktakingSessions.map((session) => (
                <Card key={session.id} className="border-industrial-border bg-white shadow-sm p-4 space-y-3">
                  <div className="flex items-center justify-between border-b pb-2">
                    <div>
                      <span className="font-mono font-bold text-sm text-slate-900 block">{session.session_number}</span>
                      <span className="text-xs text-slate-500">
                        {(session as any).warehouse?.name_ar} • {session.session_date}
                      </span>
                    </div>
                    <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 text-[10px]">
                      {isArabic ? "جرد أعمى مفتوح" : "Blind Counting"}
                    </Badge>
                  </div>

                  {/* Stock Lines for Quick Entry */}
                  <div className="space-y-2">
                    {(session as any).lines?.map((line: any) => {
                      const itm = line.item;
                      const isGram = itm?.base_unit === "gram";
                      const currentVal = quickCounts[line.id] !== undefined ? quickCounts[line.id] : line.physical_qty || "";

                      return (
                        <div
                          key={line.id}
                          className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex-1">
                            <span className="font-mono text-[10px] text-slate-400 block">{itm?.sku}</span>
                            <span className="font-bold text-slate-900 text-xs block">{itm?.name_ar}</span>
                            <span className="text-[11px] text-slate-500">
                              {isGram ? (isArabic ? "العد الفعلي بالميزان (كجم):" : "Actual Scale Weight (KG):") : (isArabic ? "العد الفعلي (بالكرتون أو الحبة):" : "Actual Count:")}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              step={isGram ? "0.01" : "1"}
                              value={currentVal}
                              placeholder={isGram ? "0.00 كجم" : "0"}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                setQuickCounts({ ...quickCounts, [line.id]: isNaN(val) ? 0 : val });
                              }}
                              className="w-24 h-9 font-mono text-center text-xs font-bold"
                            />
                            <Button
                              size="sm"
                              onClick={() => {
                                const val = quickCounts[line.id] !== undefined ? quickCounts[line.id] : Number(line.physical_qty || 0);
                                const actualQty = isGram ? val * 1000 : val;
                                savePhysicalCountMutation.mutate({ lineId: line.id, physicalQty: actualQty });
                              }}
                              className="h-9 px-3 bg-slate-900 hover:bg-slate-800 text-white"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ========================================================================= */}
      {/* GRN WEIGH & RECEIVE DIALOG */}
      {/* ========================================================================= */}
      <Dialog open={grnModalOpen} onOpenChange={setGrnModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Scale className="h-5 w-5 text-emerald-600" />
              <span>{isArabic ? "استلام شحنة مشتريات بالميزان الفعلي (GRN)" : "Goods Receipt (GRN)"}</span>
            </DialogTitle>
            <DialogDescription>
              {isArabic
                ? `أمر الشراء رقم: ${selectedPo?.po_number} • المورد: ${(selectedPo as any)?.supplier?.name_ar}`
                : `PO: ${selectedPo?.po_number}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            {/* Receiving Warehouse */}
            <div>
              <Label className="font-semibold text-slate-700 mb-1 block">
                {isArabic ? "المستودع المستلم الفعلي" : "Receiving Warehouse"}
              </Label>
              <Select value={receivingWarehouseId} onValueChange={setReceivingWarehouseId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {physicalWarehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name_ar} ({w.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Supplier DN Number */}
            <div>
              <Label className="font-semibold text-slate-700 mb-1 block">
                {isArabic ? "رقم إشعار تسليم المورد (سند الشحنة / الفاتورة)" : "Supplier Delivery Note Number"}
              </Label>
              <Input
                value={supplierDnNumber}
                onChange={(e) => setSupplierDnNumber(e.target.value)}
                placeholder={isArabic ? "مثال: DN-88492 أو رقم الفاتورة..." : "DN number..."}
                className="h-9 text-xs"
              />
            </div>

            {/* Lines List */}
            <div className="space-y-2 pt-2">
              <Label className="font-semibold text-slate-700 block">
                {isArabic ? "تسجيل الوزن الفعلي بالميزان لكل صنف:" : "Actual Scale Weight per Item:"}
              </Label>

              {grnLines.map((line, idx) => {
                const poLine = (selectedPo as any)?.lines?.find((l: any) => l.item_id === line.item_id);
                const itm = poLine?.item;
                const isGram = itm?.base_unit === "gram";

                return (
                  <div key={idx} className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between font-bold text-slate-800">
                      <span>{itm?.name_ar || itm?.sku}</span>
                      <span className="font-mono text-slate-500">
                        {isArabic ? "مطلوب بالـ PO:" : "PO Qty:"}{" "}
                        {isGram
                          ? `${(Number(poLine?.ordered_qty) / 1000).toFixed(2)} كجم`
                          : `${Number(poLine?.ordered_qty).toLocaleString()} حبة`}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[11px] text-slate-600 block mb-1">
                          {isGram ? (isArabic ? "الوزن الفعلي كجم:" : "Weight (KG):") : (isArabic ? "العدد المستلم (حبة):" : "Received (Pcs):")}
                        </span>
                        <Input
                          type="number"
                          step={isGram ? "0.01" : "1"}
                          value={isGram ? line.weight_kg : line.received_qty}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            const updated = [...grnLines];
                            if (isGram) {
                              updated[idx].weight_kg = val;
                              updated[idx].received_qty = val * 1000; // grams
                            } else {
                              updated[idx].received_qty = val;
                            }
                            setGrnLines(updated);
                          }}
                          className="h-9 text-xs font-mono font-bold"
                        />
                      </div>

                      <div>
                        <span className="text-[11px] text-slate-600 block mb-1">
                          {isArabic ? "رقم تشغيلة المورد (Lot/Batch):" : "Lot/Batch Number:"}
                        </span>
                        <Input
                          value={line.batch_number}
                          onChange={(e) => {
                            const updated = [...grnLines];
                            updated[idx].batch_number = e.target.value;
                            setGrnLines(updated);
                          }}
                          className="h-9 text-xs font-mono"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setGrnModalOpen(false)}
              disabled={submitGrnMutation.isPending}
            >
              {isArabic ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              size="sm"
              onClick={() => submitGrnMutation.mutate()}
              disabled={submitGrnMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
            >
              <CheckCircle2 className="me-1.5 h-4 w-4" />
              <span>{isArabic ? "تأكيد الاستلام وتوليد FIFO" : "Confirm & Post FIFO"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* VAN LOADING DIALOG */}
      {/* ========================================================================= */}
      <Dialog open={vanModalOpen} onOpenChange={setVanModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Truck className="h-5 w-5 text-indigo-600" />
              <span>{isArabic ? "صرف وتحميل بضاعة لسيارة التوزيع" : "Dispatch to Sales Van"}</span>
            </DialogTitle>
            <DialogDescription>
              {isArabic
                ? "نقل بضاعة المنظفات التامة من مستودع المصنع إلى عهدة المندوب (حساب 1135)"
                : "Transfer finished goods to van warehouse custody"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div>
              <Label className="font-semibold text-slate-700 mb-1 block">
                {isArabic ? "سيارة التوزيع المستلمة" : "Target Sales Van"}
              </Label>
              <Select value={selectedVanId} onValueChange={setSelectedVanId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder={isArabic ? "اختر السيارة..." : "Select Van..."} />
                </SelectTrigger>
                <SelectContent>
                  {vanWarehouses.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name_ar} ({v.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="font-semibold text-slate-700 mb-1 block">
                {isArabic ? "صنف المنظف المراد صرفه" : "Finished Good Item"}
              </Label>
              <Select value={vanItemId} onValueChange={setVanItemId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder={isArabic ? "اختر الصنف..." : "Select Item..."} />
                </SelectTrigger>
                <SelectContent>
                  {finishedGoods.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name_ar} ({i.sku}) • {i.pieces_per_carton} حبة/كرتون
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="font-semibold text-slate-700 mb-1 block">
                {isArabic ? "الكمية المحملة (بالكرتون)" : "Cartons Count"}
              </Label>
              <Input
                type="number"
                min="1"
                value={vanCartons}
                onChange={(e) => setVanCartons(parseInt(e.target.value) || 0)}
                className="h-9 text-xs font-mono font-bold"
              />
            </div>

            <div>
              <Label className="font-semibold text-slate-700 mb-1 block">
                {isArabic ? "ملاحظات السند" : "Notes"}
              </Label>
              <Input
                value={vanNotes}
                onChange={(e) => setVanNotes(e.target.value)}
                placeholder={isArabic ? "مثال: تحميل صباحي لخط سير القصيم..." : "e.g., Morning route..."}
                className="h-9 text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVanModalOpen(false)}
              disabled={submitVanLoadingMutation.isPending}
            >
              {isArabic ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              size="sm"
              onClick={() => submitVanLoadingMutation.mutate()}
              disabled={submitVanLoadingMutation.isPending}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
            >
              <CheckCircle2 className="me-1.5 h-4 w-4" />
              <span>{isArabic ? "تأكيد الصرف والتحميل" : "Confirm Loading"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
export default WarehouseShell;
