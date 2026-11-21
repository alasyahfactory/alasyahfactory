import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import {
  BarChart3,
  TrendingUp,
  Truck,
  Users,
  AlertTriangle,
  FlaskConical,
  Calculator,
  Download,
  Calendar,
  Layers,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export function AnalyticsReportsPage() {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";

  const now = new Date();
  const [selectedReport, setSelectedReport] = useState<
    "items_profit" | "customers_velocity" | "rep_vehicle_profit" | "mixing_variances" | "near_expiry" | "final_unit_cost"
  >("items_profit");

  // Overhead Unit Cost calculator parameters
  const [calcMonth, setCalcMonth] = useState<number>(now.getMonth() + 1);
  const [calcYear, setCalcYear] = useState<number>(now.getFullYear());

  // 1. Fetch Item Profitability
  const { data: itemProfitability, isLoading: isItemsLoading } = useQuery({
    queryKey: ["director_analytics_items"],
    enabled: selectedReport === "items_profit",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_invoice_lines")
        .select(`
          quantity, pieces_count, total_line,
          item:items(sku, name_ar, item_type)
        `);
      if (error) throw error;

      // Group by Item
      const map = new Map<string, { sku: string; name: string; pieces: number; revenue: number }>();
      data?.forEach((line: any) => {
        const sku = line.item?.sku || "UNKNOWN";
        const name = line.item?.name_ar || "صنف";
        const cur = map.get(sku) || { sku, name, pieces: 0, revenue: 0 };
        cur.pieces += line.pieces_count || 0;
        cur.revenue += line.total_line || 0;
        map.set(sku, cur);
      });

      return Array.from(map.values());
    },
  });

  // 2. Fetch Customer Profitability & Settlement Velocity
  const { data: customerAnalytics, isLoading: isCustLoading } = useQuery({
    queryKey: ["director_analytics_customers"],
    enabled: selectedReport === "customers_velocity",
    queryFn: async () => {
      const { data: custs, error: custErr } = await supabase
        .from("customers")
        .select(`
          id, customer_code, name_ar, credit_limit, default_payment_days,
          invoices:sales_invoices(invoice_date, due_date, net_amount_due, paid_amount, payment_status)
        `);
      if (custErr) throw custErr;

      return (custs || []).map((c: any) => {
        const totalSales = c.invoices?.reduce((acc: number, inv: any) => acc + inv.net_amount_due, 0) || 0;
        const totalPaid = c.invoices?.reduce((acc: number, inv: any) => acc + inv.paid_amount, 0) || 0;
        const outstanding = totalSales - totalPaid;
        const invoiceCount = c.invoices?.length || 0;

        return {
          code: c.customer_code,
          name: c.name_ar,
          creditLimit: c.credit_limit,
          paymentDays: c.default_payment_days,
          totalSales,
          totalPaid,
          outstanding,
          invoiceCount,
        };
      });
    },
  });

  // 3. Fetch Net Sales Rep & Delivery Vehicle Profitability
  const { data: repVehicleAnalytics, isLoading: isRepVehLoading } = useQuery({
    queryKey: ["director_analytics_rep_vehicles"],
    enabled: selectedReport === "rep_vehicle_profit",
    queryFn: async () => {
      const { data: vehicles, error: vehErr } = await supabase
        .from("vehicles")
        .select(`
          id, plate_number, name,
          assigned_rep:users_profile!assigned_rep_id(id, full_name)
        `);
      if (vehErr) throw vehErr;

      // Fetch vehicle expenses (6109 vouchers)
      const { data: vehExpenses } = await supabase
        .from("vouchers")
        .select("vehicle_id, total_amount")
        .eq("voucher_type", "payment")
        .not("vehicle_id", "is", null);

      // Fetch rep commissions
      const { data: commissions } = await supabase
        .from("sales_rep_commissions")
        .select("rep_id, commission_amount");

      return (vehicles || []).map((v: any) => {
        const totalExpenses = vehExpenses
          ?.filter((e: any) => e.vehicle_id === v.id)
          .reduce((acc: number, e: any) => acc + e.total_amount, 0) || 0;

        const totalCommissions = commissions
          ?.filter((comm: any) => comm.rep_id === v.assigned_rep?.id)
          .reduce((acc: number, c: any) => acc + c.commission_amount, 0) || 0;

        return {
          vehicleName: v.name,
          plateNumber: v.plate_number,
          repName: v.assigned_rep?.full_name || "غير معين",
          expenses: totalExpenses,
          commissions: totalCommissions,
          totalCost: totalExpenses + totalCommissions,
        };
      });
    },
  });

  // 4. Fetch Mixing Recipe Variances & Tank Spoilage
  const { data: mixingVariances, isLoading: isMixingLoading } = useQuery({
    queryKey: ["director_analytics_mixing_variances"],
    enabled: selectedReport === "mixing_variances",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mixing_batches")
        .select(`
          batch_number, planned_qty_grams, actual_output_grams, actual_yield_grams,
          yield_variance_grams, variance_cost, qc_status, created_at,
          formula:formulas(code, name_ar),
          tank:tanks(tank_code, name_ar)
        `)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data || [];
    },
  });

  // 5. Fetch Near-Expiry Inventory
  const { data: nearExpiryItems, isLoading: isExpiryLoading } = useQuery({
    queryKey: ["director_analytics_near_expiry"],
    enabled: selectedReport === "near_expiry",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fifo_layers")
        .select(`
          layer_number, remaining_qty, expiry_date, unit_cost, created_at,
          item:items(sku, name_ar, item_type)
        `)
        .gt("remaining_qty", 0)
        .not("expiry_date", "is", null)
        .order("expiry_date", { ascending: true })
        .limit(30);
      if (error) throw error;
      return data || [];
    },
  });

  // 6. Monthly Final Unit Cost Calculator Query (RPC)
  const { data: finalUnitCost, refetch: refetchUnitCost, isLoading: isCostLoading } = useQuery({
    queryKey: ["monthly_final_unit_cost_rpc", calcMonth, calcYear],
    enabled: selectedReport === "final_unit_cost",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_calculate_monthly_final_unit_cost", {
        p_month: calcMonth,
        p_year: calcYear,
      });
      if (error) throw error;
      return data;
    },
  });

  // Export current report to Excel
  const exportCurrentReport = () => {
    let wsData: any[] = [];
    let title = "تقرير_تحليلي";

    if (selectedReport === "items_profit" && itemProfitability) {
      title = "ربحية_الأصناف_والأحجام";
      wsData = itemProfitability.map((i) => ({
        "كود الصنف (SKU)": i.sku,
        "اسم المنتج": i.name,
        "إجمالي الحبات المباعة": i.pieces,
        "إيراد المبيعات (SAR)": i.revenue,
      }));
    } else if (selectedReport === "customers_velocity" && customerAnalytics) {
      title = "تحليل_العملاء_وسرعة_السداد";
      wsData = customerAnalytics.map((c: any) => ({
        "كود العميل": c.code,
        "اسم العميل": c.name,
        "الحد الائتماني": c.creditLimit,
        "أيام السداد": c.paymentDays,
        "إجمالي المبيعات": c.totalSales,
        "المسدد": c.totalPaid,
        "الرصيد القائم": c.outstanding,
      }));
    } else if (selectedReport === "rep_vehicle_profit" && repVehicleAnalytics) {
      title = "ربحية_المناديب_والسيارات";
      wsData = repVehicleAnalytics.map((r: any) => ({
        "اسم السيارة": r.vehicleName,
        "رقم اللوحة": r.plateNumber,
        "المندوب المسؤول": r.repName,
        "مصاريف السيارة (بنزين/صيانة)": r.expenses,
        "عمولات المندوب": r.commissions,
        "إجمالي التكلفة المباشرة": r.totalCost,
      }));
    }

    if (wsData.length === 0) {
      toast.error("لا توجد بيانات للتصدير");
      return;
    }

    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Analytics");
    XLSX.writeFile(wb, `${title}.xlsx`);
    toast.success("تم تصدير ملف Excel بنجاح");
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-industrial-accent" />
            {isArabic ? "التقارير التحليلية الخمسة للمدير العام" : "Director Analytics & Unit Cost"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isArabic
              ? "تحليل ربحية الأصناف، سرعة تحصيل العملاء، صافي ربحية سيارات التوزيع، انحرافات الخلط، وتكلفة الوحدة النهائية"
              : "Executive analytical intelligence: item profitability, customer velocity, fleet margins, yield variances, and actual unit cost"}
          </p>
        </div>

        <Button
          onClick={exportCurrentReport}
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs font-semibold text-emerald-800 border-emerald-300 hover:bg-emerald-50"
        >
          <Download className="h-3.5 w-3.5" />
          <span>تصدير التقرير الحالي Excel</span>
        </Button>
      </div>

      {/* Navigation Buttons for the 6 Analytic Reports */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <button
          onClick={() => setSelectedReport("items_profit")}
          className={`p-3 rounded-lg border text-start transition-all ${
            selectedReport === "items_profit"
              ? "border-slate-900 bg-slate-900 text-white shadow-sm"
              : "border-industrial-border bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          <TrendingUp className="h-4 w-4 mb-1.5" />
          <div className="font-bold text-xs">1. ربحية الأصناف</div>
          <div className="text-[10px] opacity-75 mt-0.5">حجم المبيعات والإيراد</div>
        </button>

        <button
          onClick={() => setSelectedReport("customers_velocity")}
          className={`p-3 rounded-lg border text-start transition-all ${
            selectedReport === "customers_velocity"
              ? "border-slate-900 bg-slate-900 text-white shadow-sm"
              : "border-industrial-border bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          <Users className="h-4 w-4 mb-1.5" />
          <div className="font-bold text-xs">2. تحصيل العملاء</div>
          <div className="text-[10px] opacity-75 mt-0.5">سرعة السداد والمديونيات</div>
        </button>

        <button
          onClick={() => setSelectedReport("rep_vehicle_profit")}
          className={`p-3 rounded-lg border text-start transition-all ${
            selectedReport === "rep_vehicle_profit"
              ? "border-slate-900 bg-slate-900 text-white shadow-sm"
              : "border-industrial-border bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          <Truck className="h-4 w-4 mb-1.5" />
          <div className="font-bold text-xs">3. المناديب والسيارات</div>
          <div className="text-[10px] opacity-75 mt-0.5">العمولات ومصاريف 6109</div>
        </button>

        <button
          onClick={() => setSelectedReport("mixing_variances")}
          className={`p-3 rounded-lg border text-start transition-all ${
            selectedReport === "mixing_variances"
              ? "border-slate-900 bg-slate-900 text-white shadow-sm"
              : "border-industrial-border bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          <FlaskConical className="h-4 w-4 mb-1.5" />
          <div className="font-bold text-xs">4. انحراف الخلطات</div>
          <div className="text-[10px] opacity-75 mt-0.5">فاقد التانكات وهالك 6105</div>
        </button>

        <button
          onClick={() => setSelectedReport("near_expiry")}
          className={`p-3 rounded-lg border text-start transition-all ${
            selectedReport === "near_expiry"
              ? "border-slate-900 bg-slate-900 text-white shadow-sm"
              : "border-industrial-border bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          <AlertTriangle className="h-4 w-4 mb-1.5" />
          <div className="font-bold text-xs">5. قرب الانتهاء</div>
          <div className="text-[10px] opacity-75 mt-0.5">المخزون الحرج والأقدمية</div>
        </button>

        <button
          onClick={() => setSelectedReport("final_unit_cost")}
          className={`p-3 rounded-lg border text-start transition-all ${
            selectedReport === "final_unit_cost"
              ? "border-emerald-700 bg-emerald-700 text-white shadow-sm"
              : "border-industrial-border bg-white text-emerald-800 hover:bg-emerald-50"
          }`}
        >
          <Calculator className="h-4 w-4 mb-1.5" />
          <div className="font-bold text-xs">التكلفة النهائية للوحدة</div>
          <div className="text-[10px] opacity-75 mt-0.5">حاسبة تكاليف التشغيل</div>
        </button>
      </div>

      {/* Report 1: Item Profitability */}
      {selectedReport === "items_profit" && (
        <Card className="border-industrial-border bg-white shadow-sm overflow-hidden">
          <CardHeader className="py-3 px-4 border-b border-industrial-border bg-slate-50">
            <CardTitle className="text-sm font-bold text-slate-800">
              تقرير مبيعات وربحية الأصناف والأحجام المباعة
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-xs text-start border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-industrial-border text-slate-700 font-semibold">
                  <th className="py-2.5 px-3 text-start">كود الصنف (SKU)</th>
                  <th className="py-2.5 px-3 text-start">اسم المنتج التام</th>
                  <th className="py-2.5 px-3 text-end">إجمالي الحبات المباعة</th>
                  <th className="py-2.5 px-3 text-end">إجمالي إيراد المبيعات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-industrial-border">
                {isItemsLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}><td colSpan={4} className="p-3"><Skeleton className="h-5 w-full" /></td></tr>
                  ))
                ) : itemProfitability?.length === 0 ? (
                  <tr><td colSpan={4} className="py-8 text-center text-slate-400">لا توجد مبيعات مسجلة حتى الآن</td></tr>
                ) : (
                  itemProfitability?.map((item) => (
                    <tr key={item.sku} className="hover:bg-slate-50/70">
                      <td className="py-2 px-3 font-mono font-bold text-slate-900">{item.sku}</td>
                      <td className="py-2 px-3 font-bold text-slate-900">{item.name}</td>
                      <td className="py-2 px-3 text-end font-mono tabular-nums font-bold text-slate-800">
                        {item.pieces.toLocaleString()} حبة
                      </td>
                      <td className="py-2 px-3 text-end font-mono tabular-nums font-black text-emerald-700 text-sm">
                        {item.revenue.toFixed(2)} ر.س
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Report 2: Customers Velocity */}
      {selectedReport === "customers_velocity" && (
        <Card className="border-industrial-border bg-white shadow-sm overflow-hidden">
          <CardHeader className="py-3 px-4 border-b border-industrial-border bg-slate-50">
            <CardTitle className="text-sm font-bold text-slate-800">
              تقرير أداء العملاء وسرعة سداد المديونيات
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-xs text-start border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-industrial-border text-slate-700 font-semibold">
                  <th className="py-2.5 px-3 text-start">العميل</th>
                  <th className="py-2.5 px-3 text-center">الحد الائتماني</th>
                  <th className="py-2.5 px-3 text-center">مهلة السداد (يوم)</th>
                  <th className="py-2.5 px-3 text-center">عدد الفواتير</th>
                  <th className="py-2.5 px-3 text-end">إجمالي المبيعات</th>
                  <th className="py-2.5 px-3 text-end">إجمالي المسدد</th>
                  <th className="py-2.5 px-3 text-end">الرصيد المتبقي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-industrial-border">
                {isCustLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}><td colSpan={7} className="p-3"><Skeleton className="h-5 w-full" /></td></tr>
                  ))
                ) : customerAnalytics?.length === 0 ? (
                  <tr><td colSpan={7} className="py-8 text-center text-slate-400">لا توجد بيانات عملاء مسجلة</td></tr>
                ) : (
                  customerAnalytics?.map((c: any) => (
                    <tr key={c.code} className="hover:bg-slate-50/70">
                      <td className="py-2 px-3 font-bold text-slate-900">
                        {c.name}
                        <span className="block font-mono text-[10px] text-slate-400">{c.code}</span>
                      </td>
                      <td className="py-2 px-3 text-center font-mono text-slate-700">{c.creditLimit.toFixed(2)} ر.س</td>
                      <td className="py-2 px-3 text-center font-mono font-bold text-slate-800">{c.paymentDays} يوم</td>
                      <td className="py-2 px-3 text-center font-mono text-slate-700">{c.invoiceCount}</td>
                      <td className="py-2 px-3 text-end font-mono tabular-nums font-bold text-slate-900">{c.totalSales.toFixed(2)} ر.س</td>
                      <td className="py-2 px-3 text-end font-mono tabular-nums text-emerald-700 font-bold">{c.totalPaid.toFixed(2)} ر.س</td>
                      <td className="py-2 px-3 text-end font-mono tabular-nums font-black text-rose-700">{c.outstanding.toFixed(2)} ر.س</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Report 3: Sales Rep & Vehicle Profitability */}
      {selectedReport === "rep_vehicle_profit" && (
        <Card className="border-industrial-border bg-white shadow-sm overflow-hidden">
          <CardHeader className="py-3 px-4 border-b border-industrial-border bg-slate-50">
            <CardTitle className="text-sm font-bold text-slate-800">
              تقرير تكاليف وأداء سيارات التوزيع وعمولات المناديب
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-xs text-start border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-industrial-border text-slate-700 font-semibold">
                  <th className="py-2.5 px-3 text-start">سيارة التوزيع</th>
                  <th className="py-2.5 px-3 text-start">رقم اللوحة</th>
                  <th className="py-2.5 px-3 text-start">المندوب المسؤول</th>
                  <th className="py-2.5 px-3 text-end">مصاريف السيارة (بنزين/صيانة 6109)</th>
                  <th className="py-2.5 px-3 text-end">عمولات المندوب المعتمدة</th>
                  <th className="py-2.5 px-3 text-end font-bold">إجمالي التكلفة المباشرة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-industrial-border">
                {isRepVehLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i}><td colSpan={6} className="p-3"><Skeleton className="h-5 w-full" /></td></tr>
                  ))
                ) : repVehicleAnalytics?.length === 0 ? (
                  <tr><td colSpan={6} className="py-8 text-center text-slate-400">لا توجد سيارات مسجلة</td></tr>
                ) : (
                  repVehicleAnalytics?.map((r: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3 font-bold text-slate-900">{r.vehicleName}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-700">{r.plateNumber}</td>
                      <td className="py-2.5 px-3 text-slate-900 font-medium">{r.repName}</td>
                      <td className="py-2.5 px-3 text-end font-mono tabular-nums text-rose-700 font-bold">{r.expenses.toFixed(2)} ر.س</td>
                      <td className="py-2.5 px-3 text-end font-mono tabular-nums text-slate-800">{r.commissions.toFixed(2)} ر.س</td>
                      <td className="py-2.5 px-3 text-end font-mono tabular-nums font-black text-slate-900 text-sm">{r.totalCost.toFixed(2)} ر.س</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Report 4: Recipe Variances & Tank Spoilage */}
      {selectedReport === "mixing_variances" && (
        <Card className="border-industrial-border bg-white shadow-sm overflow-hidden">
          <CardHeader className="py-3 px-4 border-b border-industrial-border bg-slate-50">
            <CardTitle className="text-sm font-bold text-slate-800">
              تقرير انحرافات الخلط وفاقد التانكات (Standard vs Actual Yield & Spoilage 6105)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-xs text-start border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-industrial-border text-slate-700 font-semibold">
                  <th className="py-2.5 px-3 text-start">رقم التشغيلة</th>
                  <th className="py-2.5 px-3 text-start">التركيبة والخلطة</th>
                  <th className="py-2.5 px-3 text-start">التانك</th>
                  <th className="py-2.5 px-3 text-end">المخطط (كجم)</th>
                  <th className="py-2.5 px-3 text-end">الناتج الفعلي (كجم)</th>
                  <th className="py-2.5 px-3 text-end">انحراف الفاقد (كجم)</th>
                  <th className="py-2.5 px-3 text-end">تكلفة الفاقد (6105)</th>
                  <th className="py-2.5 px-3 text-center">فحص QC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-industrial-border">
                {isMixingLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}><td colSpan={8} className="p-3"><Skeleton className="h-5 w-full" /></td></tr>
                  ))
                ) : mixingVariances?.length === 0 ? (
                  <tr><td colSpan={8} className="py-8 text-center text-slate-400">لا توجد تشغيلات خلط منتهية</td></tr>
                ) : (
                  mixingVariances?.map((m: any) => {
                    const plannedKg = Math.round(m.planned_qty_grams / 1000);
                    const actualKg = m.actual_output_grams ? Math.round(m.actual_output_grams / 1000) : 0;
                    const varianceKg = m.yield_variance_grams ? Math.round(m.yield_variance_grams / 1000) : 0;

                    return (
                      <tr key={m.batch_number} className="hover:bg-slate-50/70">
                        <td className="py-2 px-3 font-mono font-bold text-slate-900">{m.batch_number}</td>
                        <td className="py-2 px-3 font-bold text-slate-900">{m.formula?.name_ar}</td>
                        <td className="py-2 px-3 font-mono text-slate-700">{m.tank?.tank_code}</td>
                        <td className="py-2 px-3 text-end font-mono tabular-nums text-slate-800">{plannedKg} كجم</td>
                        <td className="py-2 px-3 text-end font-mono tabular-nums font-bold text-slate-900">{actualKg} كجم</td>
                        <td className="py-2 px-3 text-end font-mono tabular-nums font-bold text-rose-700">{varianceKg} كجم</td>
                        <td className="py-2 px-3 text-end font-mono tabular-nums font-bold text-rose-700">{m.variance_cost?.toFixed(2) || "0.00"} ر.س</td>
                        <td className="py-2 px-3 text-center">
                          <Badge variant={m.qc_status === "passed" ? "emerald" : "amber"} className="text-[10px]">
                            {m.qc_status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Report 5: Near Expiry */}
      {selectedReport === "near_expiry" && (
        <Card className="border-industrial-border bg-white shadow-sm overflow-hidden">
          <CardHeader className="py-3 px-4 border-b border-industrial-border bg-slate-50">
            <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span>قائمة المخزون القريب من انتهاء الصلاحية (Near-Expiry Watchlist)</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-xs text-start border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-industrial-border text-slate-700 font-semibold">
                  <th className="py-2.5 px-3 text-start">رقم طبقة FIFO</th>
                  <th className="py-2.5 px-3 text-start">الصنف</th>
                  <th className="py-2.5 px-3 text-start">تاريخ الانتهاء</th>
                  <th className="py-2.5 px-3 text-end">الكمية المتبقية</th>
                  <th className="py-2.5 px-3 text-end">تكلفة الوحدة FIFO</th>
                  <th className="py-2.5 px-3 text-end font-bold">إجمالي القيمة المعرضة للخطر</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-industrial-border">
                {isExpiryLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}><td colSpan={6} className="p-3"><Skeleton className="h-5 w-full" /></td></tr>
                  ))
                ) : nearExpiryItems?.length === 0 ? (
                  <tr><td colSpan={6} className="py-8 text-center text-slate-400">لا توجد دفعات مخزون منتهية أو قريبة من الانتهاء</td></tr>
                ) : (
                  nearExpiryItems?.map((l: any) => {
                    const totalRisk = l.remaining_qty * l.unit_cost;
                    return (
                      <tr key={l.layer_number} className="hover:bg-slate-50/70">
                        <td className="py-2 px-3 font-mono font-bold text-slate-900">{l.layer_number}</td>
                        <td className="py-2 px-3 font-bold text-slate-900">{l.item?.name_ar}</td>
                        <td className="py-2 px-3 font-mono font-bold text-rose-700">{l.expiry_date}</td>
                        <td className="py-2 px-3 text-end font-mono tabular-nums font-bold text-slate-900">{l.remaining_qty}</td>
                        <td className="py-2 px-3 text-end font-mono tabular-nums text-slate-800">{l.unit_cost.toFixed(2)} ر.س</td>
                        <td className="py-2 px-3 text-end font-mono tabular-nums font-black text-rose-700">{totalRisk.toFixed(2)} ر.س</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Report 6: Monthly Final Unit Cost */}
      {selectedReport === "final_unit_cost" && (
        <div className="space-y-4">
          <Card className="border-industrial-border bg-white shadow-sm p-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900">حاسبة التكلفة الصناعية النهائية للوحدة</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  تقسيم إجمالي المصروفات التشغيلية الفعلية (حسابات 6101..6109) على حجم الإنتاج الفعلي للشهر
                </p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={calcMonth}
                  onChange={(e) => setCalcMonth(Number(e.target.value))}
                  className="h-8 px-2 rounded border border-industrial-border text-xs font-bold"
                >
                  {Array.from({ length: 12 }).map((_, i) => (
                    <option key={i + 1} value={i + 1}>شهر {i + 1}</option>
                  ))}
                </select>
                <select
                  value={calcYear}
                  onChange={(e) => setCalcYear(Number(e.target.value))}
                  className="h-8 px-2 rounded border border-industrial-border text-xs font-bold"
                >
                  <option value={2024}>2024</option>
                  <option value={2025}>2025</option>
                  <option value={2026}>2026</option>
                </select>
                <Button size="sm" onClick={() => refetchUnitCost()} className="h-8 text-xs bg-slate-900 text-white">
                  إعادة الاحتساب
                </Button>
              </div>
            </div>
          </Card>

          {isCostLoading ? (
            <Skeleton className="h-44 w-full" />
          ) : finalUnitCost && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <Card className="border-industrial-border bg-white shadow-sm p-4">
                <span className="text-xs text-slate-500 font-semibold block">إجمالي المصروفات التشغيلية (Opex)</span>
                <div className="font-mono font-black text-2xl text-slate-900 mt-1">
                  {finalUnitCost.total_opex.toFixed(2)} ر.س
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">رواتب، إيجار، طاقة، إهلاك، نقل</span>
              </Card>

              <Card className="border-industrial-border bg-white shadow-sm p-4">
                <span className="text-xs text-slate-500 font-semibold block">إجمالي اللترات المنتجة (Tanks)</span>
                <div className="font-mono font-black text-2xl text-slate-900 mt-1">
                  {finalUnitCost.total_produced_liters.toFixed(0)} لتر
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">إنتاج الخلط الفعلي المعتمد</span>
              </Card>

              <Card className="border-industrial-border bg-white shadow-sm p-4">
                <span className="text-xs text-slate-500 font-semibold block">إجمالي الكراتين المعبأة</span>
                <div className="font-mono font-black text-2xl text-slate-900 mt-1">
                  {finalUnitCost.total_produced_cartons.toLocaleString()} كرتون
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">أوامر التعبئة المغلقة</span>
              </Card>

              <Card className="border-industrial-border bg-emerald-50 border-emerald-200 shadow-sm p-4">
                <span className="text-xs text-emerald-800 font-bold block">نصيب اللتر من المصاريف غير المباشرة</span>
                <div className="font-mono font-black text-3xl text-emerald-700 mt-1">
                  {finalUnitCost.overhead_per_liter.toFixed(4)} ر.س
                </div>
                <span className="text-[11px] text-emerald-600 mt-1 block">يُضاف لتكلفة FIFO المباشرة للتر</span>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
