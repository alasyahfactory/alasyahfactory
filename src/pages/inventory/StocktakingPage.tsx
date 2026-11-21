import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import {
  ClipboardCheck,
  Plus,
  Search,
  Warehouse,
  CheckCircle2,
  Clock,
  EyeOff,
  FileCheck,
  Calendar,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { BlindStocktakingPrint } from "@/components/inventory/BlindStocktakingPrint";
import { StockReconciliationPrint } from "@/components/inventory/StockReconciliationPrint";
import type { StocktakingSession, StocktakingLine, Warehouse as WarehouseType, FactorySettings } from "@/types/database";

export function StocktakingPage() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const isArabic = i18n.language === "ar";

  const [searchTerm, setSearchTerm] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [reconcileModalOpen, setReconcileModalOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<StocktakingSession | null>(null);

  // New Session Form
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split("T")[0]);
  const [sessionNotes, setSessionNotes] = useState("");

  // Physical Counts Input Map: lineId -> physicalCount
  const [countsMap, setCountsMap] = useState<Record<string, number>>({});

  // Fetch Factory Settings
  const { data: settings } = useQuery<FactorySettings | null>({
    queryKey: ["factory_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("factory_settings").select("*").single();
      if (error) return null;
      return data as FactorySettings;
    },
  });

  // Fetch Warehouses
  const { data: warehouses } = useQuery<WarehouseType[]>({
    queryKey: ["warehouses_for_stocktaking"],
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouses").select("*").eq("is_active", true);
      if (error) throw error;
      return (data || []) as WarehouseType[];
    },
  });

  // Fetch Stocktaking Sessions
  const { data: sessions, isLoading } = useQuery<StocktakingSession[]>({
    queryKey: ["stocktaking_sessions_list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stocktaking_sessions")
        .select(`
          *,
          warehouse:warehouses(name_ar, warehouse_type),
          lines:stocktaking_lines(
            *,
            item:items(sku, name_ar, base_unit)
          )
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as StocktakingSession[];
    },
  });

  // Create Session Mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("rpc_create_stocktaking_session", {
        p_warehouse_id: selectedWarehouseId,
        p_session_date: sessionDate,
        p_notes: sessionNotes || null,
        p_created_by: user?.id,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (res) => {
      toast.success(isArabic ? `تم بدء جلسة الجرد بنجاح (${res.session_number})` : "Session started");
      queryClient.invalidateQueries({ queryKey: ["stocktaking_sessions_list"] });
      setCreateModalOpen(false);
      setSessionNotes("");
    },
    onError: (err: any) => {
      toast.error(err.message || (isArabic ? "فشل إنشاء جلسة الجرد" : "Failed to create session"));
    },
  });

  // Reconcile and Post Mutation
  const reconcileMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSession) return;

      const formattedCounts = Object.entries(countsMap).map(([lineId, count]) => ({
        line_id: lineId,
        physical_qty: Number(count),
      }));

      const { data, error } = await supabase.rpc("rpc_reconcile_and_post_stocktaking", {
        p_session_id: selectedSession.id,
        p_counts: formattedCounts,
        p_created_by: user?.id,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (res) => {
      toast.success(isArabic ? "تم اعتماد محضر الجرد وترحيل قيود العجز/الفائض بنجاح" : "Reconciliation posted");
      queryClient.invalidateQueries({ queryKey: ["stocktaking_sessions_list"] });
      queryClient.invalidateQueries({ queryKey: ["journal_entries_list"] });
      queryClient.invalidateQueries({ queryKey: ["fifo_layers_inventory"] });
      setReconcileModalOpen(false);
      setSelectedSession(null);
      setCountsMap({});
    },
    onError: (err: any) => {
      toast.error(err.message || (isArabic ? "فشل ترحيل محضر الجرد" : "Failed to reconcile"));
    },
  });

  const handleOpenReconcile = (session: StocktakingSession) => {
    setSelectedSession(session);
    // Pre-populate countsMap with existing physical_qty or default to system_qty
    const initialMap: Record<string, number> = {};
    session.lines?.forEach((line) => {
      initialMap[line.id] = line.physical_qty ?? line.system_qty;
    });
    setCountsMap(initialMap);
    setReconcileModalOpen(true);
  };

  const filteredSessions = sessions?.filter((s) => {
    return (
      s.session_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.warehouse?.name_ar.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-industrial-accent" />
            {isArabic ? "الجرد المخزني الأعمى ومطابقة العجز (Stocktaking)" : "Physical Inventory Stocktaking"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isArabic
              ? "إصدار أوراق الجرد الأعمى (كميات محجوبة لمنع التحيز)، مطابقة الفروقات، وترحيل قيود عجز الجرد (6107)"
              : "Generate blind stock sheets, physical count reconciliation, and automatic inventory shortage postings"}
          </p>
        </div>

        <Button
          onClick={() => setCreateModalOpen(true)}
          className="gap-2 bg-slate-900 text-white hover:bg-slate-800 shadow-sm font-semibold"
        >
          <Plus className="h-4 w-4" />
          <span>{isArabic ? "بدء جلسة جرد جديدة" : "New Stocktaking Session"}</span>
        </Button>
      </div>

      {/* Search Bar */}
      <div className="relative w-full md:w-80">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={isArabic ? "بحث برقم الجلسة أو المستودع..." : "Search session..."}
          className="ps-9 bg-white border-industrial-border text-xs"
        />
      </div>

      {/* Sessions Table */}
      <Card className="border-industrial-border bg-white shadow-sm overflow-hidden">
        <CardHeader className="py-3 px-4 border-b border-industrial-border bg-slate-50">
          <CardTitle className="text-sm font-bold text-slate-800 flex items-center justify-between">
            <span>{isArabic ? "سجل جلسات الجرد الدوري والأعمى" : "Stocktaking Sessions Register"}</span>
            <span className="text-xs font-normal text-slate-500 font-mono">
              {filteredSessions?.length || 0} {isArabic ? "جلسة" : "sessions"}
            </span>
          </CardTitle>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start border-collapse">
              <thead>
                <tr className="border-b border-industrial-border bg-slate-100/75 text-slate-700 font-semibold">
                  <th className="py-2.5 px-3 text-start">رقم الجلسة</th>
                  <th className="py-2.5 px-3 text-start">المستودع</th>
                  <th className="py-2.5 px-3 text-start">تاريخ الجرد</th>
                  <th className="py-2.5 px-3 text-end">عجز الجرد (Shortage)</th>
                  <th className="py-2.5 px-3 text-end">فائض الجرد (Surplus)</th>
                  <th className="py-2.5 px-3 text-end">صافي الفارق المالي</th>
                  <th className="py-2.5 px-3 text-center">الحالة</th>
                  <th className="py-2.5 px-3 text-center">المطبوعات والإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-industrial-border">
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}><td colSpan={8} className="p-3"><Skeleton className="h-6 w-full" /></td></tr>
                  ))
                ) : filteredSessions?.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      {isArabic ? "لا توجد جلسات جرد مسجلة حتى الآن" : "No stocktaking sessions recorded yet"}
                    </td>
                  </tr>
                ) : (
                  filteredSessions?.map((sess) => (
                    <tr key={sess.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                        {sess.session_number}
                      </td>
                      <td className="py-2.5 px-3 text-slate-800 font-bold flex items-center gap-1.5">
                        <Warehouse className="h-3.5 w-3.5 text-slate-400" />
                        <span>{sess.warehouse?.name_ar}</span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {sess.session_date}
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono tabular-nums font-bold text-rose-700">
                        {sess.total_shortage_cost ? `-${sess.total_shortage_cost.toFixed(2)} ر.س` : "0.00 ر.س"}
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono tabular-nums font-bold text-emerald-700">
                        {sess.total_surplus_cost ? `+${sess.total_surplus_cost.toFixed(2)} ر.س` : "0.00 ر.س"}
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono tabular-nums font-black text-slate-900 text-sm">
                        {sess.net_variance_cost.toFixed(2)} ر.س
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {sess.status === "completed" ? (
                          <Badge variant="emerald" className="text-[10px]">
                            معتمد ومرحل
                          </Badge>
                        ) : (
                          <Badge variant="amber" className="text-[10px]">
                            جارٍ الجرد الفعلي
                          </Badge>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <BlindStocktakingPrint session={sess} settings={settings || null} />
                          {sess.status === "completed" ? (
                            <StockReconciliationPrint session={sess} settings={settings || null} />
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenReconcile(sess)}
                              className="h-8 text-xs font-bold text-emerald-800 border-emerald-300 hover:bg-emerald-50"
                            >
                              <FileCheck className="h-3.5 w-3.5 me-1" />
                              <span>إدخال العد والمطابقة</span>
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

      {/* Create Stocktaking Session Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Plus className="h-4 w-4 text-industrial-accent" />
              <span>بدء جلسة جرد مخزني جديدة</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 pt-2 text-xs">
            <div>
              <label className="font-bold text-slate-700 block mb-1">المستودع المراد جرده *</label>
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                className="w-full h-8 px-2 rounded border border-industrial-border bg-slate-50 text-xs font-medium text-slate-800"
              >
                <option value="">اختر المستودع...</option>
                {warehouses?.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name_ar} ({w.warehouse_type})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">تاريخ الجرد *</label>
              <Input
                type="date"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                className="h-8 text-xs font-mono bg-slate-50 border-industrial-border"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">ملاحظات الجلسة (اختياري)</label>
              <Input
                value={sessionNotes}
                onChange={(e) => setSessionNotes(e.target.value)}
                placeholder="مثال: جرد نهاية الربع الأول / جرد مفاجئ لمستودع التام..."
                className="h-8 text-xs bg-slate-50 border-industrial-border"
              />
            </div>

            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-900 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span>آلية الجرد الأعمى في النظام:</span>
              </div>
              <p>
                سيقوم النظام فوراً بأخذ لقطة فورية (Snapshot) لكافة كميات الـ FIFO الحالية بالمستودع وتوليد ورقة الجرد الأعمى (A4) بطمس الكميات لمنع التحيز أثناء العد الفعلي.
              </p>
            </div>
          </div>

          <DialogFooter className="pt-3 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCreateModalOpen(false)}
            >
              إلغاء
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!selectedWarehouseId || createMutation.isPending}
              className="gap-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold"
            >
              {createMutation.isPending ? "جاري البدء..." : "تأكيد وبدء الجلسة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enter Physical Counts & Reconcile Modal */}
      <Dialog open={reconcileModalOpen} onOpenChange={setReconcileModalOpen}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center justify-between">
              <span>إدخال نتائج العد الفعلي ومطابقة الفروقات: {selectedSession?.session_number}</span>
              <span className="text-xs font-mono font-normal text-slate-400">
                {selectedSession?.lines?.length || 0} صنفاً
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2 text-xs">
            <div className="border border-industrial-border rounded-lg overflow-hidden">
              <table className="w-full text-xs text-start border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-industrial-border text-slate-700 font-semibold">
                    <th className="py-2 px-2 text-start">كود الصنف</th>
                    <th className="py-2 px-2 text-start">اسم الصنف / المادة</th>
                    <th className="py-2 px-2 text-end">الرصيد الدفتري (FIFO)</th>
                    <th className="py-2 px-2 text-end w-36">العد الفعلي المجرود *</th>
                    <th className="py-2 px-2 text-end">الفارق بالكمية</th>
                    <th className="py-2 px-2 text-end">تكلفة الوحدة</th>
                    <th className="py-2 px-2 text-end font-bold">الفارق المالي (SAR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-industrial-border">
                  {selectedSession?.lines?.map((line) => {
                    const physical = countsMap[line.id] ?? line.system_qty;
                    const diffQty = physical - line.system_qty;
                    const diffAmt = diffQty * line.unit_cost;
                    const isShortage = diffAmt < 0;
                    const isSurplus = diffAmt > 0;

                    return (
                      <tr key={line.id} className="bg-white hover:bg-slate-50/50">
                        <td className="p-2 font-mono font-bold text-slate-900">{line.item?.sku}</td>
                        <td className="p-2 font-bold text-slate-900">{line.item?.name_ar}</td>
                        <td className="p-2 text-end font-mono tabular-nums text-slate-800">{line.system_qty}</td>
                        <td className="p-1.5">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={countsMap[line.id] ?? ""}
                            onChange={(e) =>
                              setCountsMap({
                                ...countsMap,
                                [line.id]: Number(e.target.value),
                              })
                            }
                            className="h-7 text-xs font-mono font-bold text-end"
                          />
                        </td>
                        <td className={`p-2 text-end font-mono tabular-nums font-bold ${isShortage ? "text-rose-700" : isSurplus ? "text-emerald-700" : "text-slate-500"}`}>
                          {diffQty > 0 ? `+${diffQty}` : diffQty}
                        </td>
                        <td className="p-2 text-end font-mono tabular-nums text-slate-700">
                          {line.unit_cost.toFixed(2)}
                        </td>
                        <td className={`p-2 text-end font-mono tabular-nums font-black text-sm ${isShortage ? "text-rose-700" : isSurplus ? "text-emerald-700" : "text-slate-800"}`}>
                          {diffAmt.toFixed(2)} ر.س
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-3 bg-slate-100 rounded-lg text-slate-700 space-y-1">
              <div className="font-bold">المعالجة المحاسبية التلقائية عند الاعتماد:</div>
              <p>
                في حال وجود عجز مالي (Shortage)، سيقوم النظام آلياً بإصدار قيد تسوية متوازن بخصم كمية العجز من طبقات الـ FIFO وترحيل تكلفتها إلى حساب <strong>6107 عجز وهالك الجرد المخزني</strong>.
              </p>
            </div>
          </div>

          <DialogFooter className="pt-3 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReconcileModalOpen(false)}
            >
              إلغاء
            </Button>
            <Button
              onClick={() => reconcileMutation.mutate()}
              disabled={reconcileMutation.isPending}
              className="gap-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold"
            >
              {reconcileMutation.isPending ? "جاري الترحيل..." : "اعتماد محضر المطابقة وترحيل القيود"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
