import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import {
  Wrench,
  ArrowRight,
  Plus,
  Play,
  Search,
  CheckCircle2,
  Clock,
  Truck,
  Building,
  Layers,
  Calendar,
  Calculator,
  Printer,
  FileDown,
  Share2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { FixedAsset, Account, Vehicle, DepreciationLog } from "@/types/database";

export function FixedAssetsPage() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const isArabic = i18n.language === "ar";

  const [searchTerm, setSearchTerm] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [depreciationModalOpen, setDepreciationModalOpen] = useState(false);

  // Depreciation Run Controls
  const now = new Date();
  const [depMonth, setDepMonth] = useState<number>(now.getMonth() + 1);
  const [depYear, setDepYear] = useState<number>(now.getFullYear());
  const [depDate, setDepDate] = useState<string>(now.toISOString().split("T")[0]);

  // Form State for new asset
  const [assetNameAr, setAssetNameAr] = useState("");
  const [assetNameEn, setAssetNameEn] = useState("");
  const [category, setCategory] = useState<
    "machinery_equipment" | "vehicles" | "tanks_infrastructure" | "furniture_fixtures" | "computers_software"
  >("machinery_equipment");
  const [purchaseDate, setPurchaseDate] = useState(now.toISOString().split("T")[0]);
  const [purchaseCost, setPurchaseCost] = useState<number>(0);
  const [salvageValue, setSalvageValue] = useState<number>(0);
  const [usefulLifeMonths, setUsefulLifeMonths] = useState<number>(60);
  const [assetAccountId, setAssetAccountId] = useState("");
  const [vehicleId, setVehicleId] = useState("");

  // Fetch Accounts
  const { data: accounts } = useQuery<Account[]>({
    queryKey: ["asset_accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("*").eq("is_active", true);
      if (error) throw error;
      return (data || []) as Account[];
    },
  });

  // Fetch Vehicles
  const { data: vehicles } = useQuery<Vehicle[]>({
    queryKey: ["vehicles_for_assets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicles").select("*").eq("is_active", true);
      if (error) throw error;
      return (data || []) as Vehicle[];
    },
  });

  // Fetch Fixed Assets
  const { data: assets, isLoading } = useQuery<FixedAsset[]>({
    queryKey: ["fixed_assets_list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fixed_assets")
        .select(`
          *,
          vehicle:vehicles(name, plate_number),
          asset_account:accounts!asset_account_id(code, name_ar)
        `)
        .order("asset_code", { ascending: true });
      if (error) throw error;
      return (data || []) as FixedAsset[];
    },
  });

  // Fetch Depreciation Logs History
  const { data: depLogs } = useQuery<DepreciationLog[]>({
    queryKey: ["depreciation_logs_history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("depreciation_logs")
        .select(`
          *,
          asset:fixed_assets(asset_code, name_ar)
        `)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as DepreciationLog[];
    },
  });

  // Create Asset Mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const seq = Math.floor(Math.random() * 900) + 100;
      const assetCode = `AST-${seq}`;

      // Default depreciation expense (6108) and accumulated depreciation (1290)
      const depExpAcc = accounts?.find((a) => a.code === "6108");
      const accDepAcc = accounts?.find((a) => a.code === "1290" || a.code === "1202");

      if (!depExpAcc || !accDepAcc) throw new Error("حسابات إهلاك الأصول غير معرفة بالشجرة");

      const { data, error } = await supabase.from("fixed_assets").insert({
        asset_code: assetCode,
        name_ar: assetNameAr,
        name_en: assetNameEn || assetNameAr,
        category,
        purchase_date: purchaseDate,
        purchase_cost: Number(purchaseCost),
        salvage_value: Number(salvageValue),
        useful_life_months: Number(usefulLifeMonths),
        asset_account_id: assetAccountId,
        depreciation_expense_account_id: depExpAcc.id,
        accumulated_depreciation_account_id: accDepAcc.id,
        vehicle_id: category === "vehicles" ? vehicleId || null : null,
        accumulated_depreciation: 0,
        book_value: Number(purchaseCost),
        status: "active",
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(isArabic ? "تم إضافة الأصل الثابت بنجاح" : "Asset added successfully");
      queryClient.invalidateQueries({ queryKey: ["fixed_assets_list"] });
      setCreateModalOpen(false);
      setAssetNameAr("");
      setPurchaseCost(0);
    },
    onError: (err: any) => {
      toast.error(err.message || (isArabic ? "فشل إضافة الأصل" : "Failed to add asset"));
    },
  });

  // Execute Depreciation Mutation
  const depMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("rpc_execute_depreciation_run", {
        p_month: depMonth,
        p_year: depYear,
        p_date: depDate,
        p_created_by: user?.id,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (res) => {
      toast.success(
        isArabic
          ? `تم تنفيذ إهلاك شهر ${depMonth}/${depYear} بنجاح (${res.processed_count} أصل - إجمالي: ${res.total_depreciation} ر.س)`
          : "Depreciation executed successfully"
      );
      queryClient.invalidateQueries({ queryKey: ["fixed_assets_list"] });
      queryClient.invalidateQueries({ queryKey: ["depreciation_logs_history"] });
      queryClient.invalidateQueries({ queryKey: ["journal_entries_list"] });
      queryClient.invalidateQueries({ queryKey: ["financial_reports_rpc"] });
      setDepreciationModalOpen(false);
    },
    onError: (err: any) => {
      toast.error(err.message || (isArabic ? "فشل تشغيل الإهلاك" : "Failed to run depreciation"));
    },
  });

  const totalCost = assets?.reduce((acc, a) => acc + a.purchase_cost, 0) || 0;
  const totalAccumulated = assets?.reduce((acc, a) => acc + a.accumulated_depreciation, 0) || 0;
  const totalBookValue = assets?.reduce((acc, a) => acc + a.book_value, 0) || 0;

  const filteredAssets = assets?.filter((a) => {
    return (
      a.name_ar.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.asset_code.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const handlePrintAssetsRegister = (isPdf = false) => {
    const win = window.open("", "_blank");
    if (!win) return;
    const docTitle = isPdf ? `سجل_الاصول_الثابتة` : `سجل الأصول الثابتة والإهلاك`;

    const totalCostSum = (assets || []).reduce((acc, a) => acc + (Number(a.purchase_cost) || 0), 0);
    const totalDepSum = (assets || []).reduce((acc, a) => acc + (Number(a.accumulated_depreciation) || 0), 0);
    const totalBookSum = (assets || []).reduce((acc, a) => acc + (Number(a.book_value) || 0), 0);

    const rowsHtml = (assets || [])
      .map(
        (a, i) => `
        <tr>
          <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center;">${i + 1}</td>
          <td style="border: 1px solid #cbd5e1; padding: 6px; font-family: monospace;">${a.asset_code}</td>
          <td style="border: 1px solid #cbd5e1; padding: 6px; font-weight: bold;">${a.name_ar}</td>
          <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; font-size: 10px;">${a.category}</td>
          <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; font-family: monospace;">${a.purchase_date}</td>
          <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: right; font-family: monospace;">${Number(a.purchase_cost).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
          <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: right; font-family: monospace;">${Number(a.accumulated_depreciation).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
          <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: right; font-family: monospace; font-weight: bold;">${Number(a.book_value).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
          <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; font-size: 11px;">${a.status === "active" ? "نشط" : a.status === "fully_depreciated" ? "مهلك بالكامل" : a.status}</td>
        </tr>
      `
      )
      .join("");

    win.document.write(`
      <!DOCTYPE html>
      <html dir="${isArabic ? "rtl" : "ltr"}" lang="${isArabic ? "ar" : "en"}">
        <head>
          <meta charset="utf-8" />
          <title>${docTitle}</title>
          <style>
            @page { size: A4 landscape; margin: 10mm; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "IBM Plex Sans Arabic", sans-serif; color: #0f172a; background: #fff; margin: 0; padding: 0; font-size: 11px; }
            .header-grid { display: grid; grid-template-columns: 1fr auto 1fr; gap: 16px; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
            .badge { display: inline-block; padding: 4px 14px; background: #0f172a; color: #fff; font-weight: bold; font-size: 15px; border-radius: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { border: 1px solid #cbd5e1; background: #f1f5f9; padding: 6px; font-size: 10px; font-weight: bold; }
            .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 30px; margin-top: 30px; text-align: center; }
            .sig-box { border-top: 1px dashed #94a3b8; padding-top: 6px; font-size: 10px; }
          </style>
        </head>
        <body>
          <div class="header-grid">
            <div style="text-align: ${isArabic ? "right" : "left"};">
              <div style="font-weight: bold; font-size: 14px;">مصنع الأسياح للمنتجات الكيميائية</div>
              <div style="font-size: 11px; color: #64748b;">سجل تجاري: 1010000000 | الرقم الضريبي: 300000000000003</div>
            </div>
            <div style="text-align: center;">
              <div class="badge">سجل الأصول الثابتة والإهلاك المتراكم</div>
              <div style="font-size: 11px; color: #64748b; margin-top: 4px;">تاريخ الاستخراج: ${new Date().toISOString().split("T")[0]}</div>
            </div>
            <div style="text-align: ${isArabic ? "left" : "right"}; direction: ltr;">
              <div style="font-weight: bold; font-size: 13px;">Al-Asyah Chemical Factory</div>
              <div style="font-size: 11px; color: #64748b;">Fixed Assets & Depreciation Register</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 30px;">#</th>
                <th style="width: 70px;">كود الأصل</th>
                <th>اسم الأصل والمواصفات</th>
                <th style="width: 90px;">التصنيف</th>
                <th style="width: 80px;">تاريخ الشراء</th>
                <th style="width: 90px;">تكلفة الشراء (ر.س)</th>
                <th style="width: 90px;">مجمع الإهلاك (ر.س)</th>
                <th style="width: 90px;">القيمة الدفترية (ر.س)</th>
                <th style="width: 70px;">الحالة</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
            <tfoot>
              <tr style="background: #f8fafc; font-weight: bold;">
                <td colspan="5" style="border: 1px solid #cbd5e1; padding: 6px; text-align: center;">الإجمالي العام</td>
                <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: right; font-family: monospace;">${totalCostSum.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: right; font-family: monospace;">${totalDepSum.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: right; font-family: monospace;">${totalBookSum.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center;">${assets?.length || 0} أصل</td>
              </tr>
            </tfoot>
          </table>

          <div class="signatures">
            <div class="sig-box">
              <div style="font-weight: bold; margin-bottom: 30px;">إدارة الأصول والمستودعات</div>
              <div>التوقيع: ............................</div>
            </div>
            <div class="sig-box">
              <div style="font-weight: bold; margin-bottom: 30px;">المحاسب المسؤول</div>
              <div>التوقيع: ............................</div>
            </div>
            <div class="sig-box">
              <div style="font-weight: bold; margin-bottom: 30px;">اعتماد المدير المالي</div>
              <div>الختم والتوقيع: ............................</div>
            </div>
          </div>

          <script>
            window.onload = function() { window.print(); window.close(); };
          </script>
        </body>
      </html>
    `);
    win.document.close();
  };

  const handleShareWhatsappAssets = () => {
    const totalCostSum = (assets || []).reduce((acc, a) => acc + (Number(a.purchase_cost) || 0), 0);
    const totalBookSum = (assets || []).reduce((acc, a) => acc + (Number(a.book_value) || 0), 0);
    const msg = `*ملخص سجل الأصول الثابتة - مصنع الأسياح للكيماويات*
عدد الأصول المسجلة: ${assets?.length || 0}
إجمالي التكلفة التاريخية: ${totalCostSum.toLocaleString("en-US", { minimumFractionDigits: 2 })} ر.س
صافي القيمة الدفترية الحالية: ${totalBookSum.toLocaleString("en-US", { minimumFractionDigits: 2 })} ر.س
التاريخ: ${new Date().toISOString().split("T")[0]}
_نظام إدارة الأصول والإهلاك الآلي - مصنع الأسياح_`;

    const encoded = encodeURIComponent(msg);
    const waUrl = `https://api.whatsapp.com/send?text=${encoded}`;
    window.open(waUrl, "_blank");
  };

  // 1. Material Design 3 In-Page Canvas View for Running Monthly Depreciation
  if (depreciationModalOpen) {
    const months = [
      { num: 1, name: "يناير" },
      { num: 2, name: "فبراير" },
      { num: 3, name: "مارس" },
      { num: 4, name: "أبريل" },
      { num: 5, name: "مايو" },
      { num: 6, name: "يونيو" },
      { num: 7, name: "يوليو" },
      { num: 8, name: "أغسطس" },
      { num: 9, name: "سبتمبر" },
      { num: 10, name: "أكتوبر" },
      { num: 11, name: "نوفمبر" },
      { num: 12, name: "ديسمبر" },
    ];

    const activeAssets = assets?.filter((a) => a.status === "active" && a.book_value > (a.salvage_value || 0)) || [];
    const estimatedMonthlyDep = activeAssets.reduce((sum, a) => {
      const depBase = a.purchase_cost - (a.salvage_value || 0);
      return sum + (a.useful_life_months > 0 ? depBase / a.useful_life_months : 0);
    }, 0);

    return (
      <div className="space-y-6 max-w-5xl mx-auto pb-16 animate-in fade-in duration-200">
        {/* Top Header Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3">
            <Button
              variant="tonal"
              size="sm"
              onClick={() => setDepreciationModalOpen(false)}
              className="gap-1.5"
            >
              <ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
              <span>{isArabic ? "العودة للأصول الثابتة" : "Back to Assets"}</span>
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <Play className="h-5 w-5 text-emerald-600" />
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  {isArabic ? "معالج تشغيل الإهلاك الشهري للأصول الثابتة" : "Run Monthly Depreciation"}
                </h1>
                <Badge variant="emerald" className="text-xs">
                  القسط الثابت (Straight-Line)
                </Badge>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                احتساب إهلاك شهر {depMonth}/{depYear} وتوليد قيد اليومية الآلي (مدين 6108 / دائن 1290)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button variant="outline" size="sm" onClick={() => setDepreciationModalOpen(false)}>
              {isArabic ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              size="sm"
              disabled={depMutation.isPending || activeAssets.length === 0}
              onClick={() => depMutation.mutate()}
              className="bg-emerald-700 hover:bg-emerald-800 text-white min-h-[38px] px-5 gap-1.5 font-bold shadow-sm"
            >
              <Play className="h-4 w-4" />
              <span>{depMutation.isPending ? "جاري احتساب وترحيل القيد..." : "تنفيذ الإهلاك وترحيل القيد"}</span>
            </Button>
          </div>
        </div>

        {/* 2-Column Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Run Parameters Card */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-sky-600" />
                  <span>معايير الفترة المستهدفة للإهلاك</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs font-semibold">الشهر المستهدف *</Label>
                  <select
                    value={depMonth}
                    onChange={(e) => setDepMonth(Number(e.target.value))}
                    className="mt-1 w-full h-10 px-3 py-2 text-xs rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    {months.map((m) => (
                      <option key={m.num} value={m.num}>
                        {m.num} - {m.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label className="text-xs font-semibold">السنة المالية *</Label>
                  <Input
                    type="number"
                    value={depYear}
                    onChange={(e) => setDepYear(Number(e.target.value))}
                    className="mt-1 font-mono tabular-nums bg-white font-bold"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold">تاريخ قيد اليومية *</Label>
                  <Input
                    type="date"
                    value={depDate}
                    onChange={(e) => setDepDate(e.target.value)}
                    className="mt-1 font-mono bg-white"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Assets Table Preview Card */}
            <Card className="border-slate-200 shadow-sm overflow-hidden">
              <CardHeader className="py-3 px-4 border-b border-slate-100 bg-slate-50 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-bold text-slate-800">
                  الأصول المؤهلة للإهلاك في هذا الشهر ({activeAssets.length} أصل)
                </CardTitle>
                <Badge variant="outline" className="font-mono text-xs">
                  إجمالي تقديري: {estimatedMonthlyDep.toFixed(2)} ر.س
                </Badge>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-start">
                    <thead className="bg-slate-100/75 text-slate-700 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">كود الأصل</th>
                        <th className="py-2.5 px-3">اسم الأصل</th>
                        <th className="py-2.5 px-3 text-end">تكلفة الشراء</th>
                        <th className="py-2.5 px-3 text-end">القيمة الدفترية الحالية</th>
                        <th className="py-2.5 px-3 text-end">قسط الإهلاك الشهري</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeAssets.map((asset) => {
                        const depBase = asset.purchase_cost - (asset.salvage_value || 0);
                        const monthlyDep = asset.useful_life_months > 0 ? depBase / asset.useful_life_months : 0;
                        return (
                          <tr key={asset.id} className="hover:bg-slate-50/50">
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{asset.asset_code}</td>
                            <td className="py-2.5 px-3 font-medium text-slate-900">{asset.name_ar}</td>
                            <td className="py-2.5 px-3 text-end font-mono tabular-nums">{asset.purchase_cost.toFixed(2)} ر.س</td>
                            <td className="py-2.5 px-3 text-end font-mono tabular-nums font-semibold text-slate-800">{asset.book_value.toFixed(2)} ر.س</td>
                            <td className="py-2.5 px-3 text-end font-mono tabular-nums font-bold text-emerald-700">{monthlyDep.toFixed(2)} ر.س</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Sidebar: Double-Entry Impact Card */}
          <div className="space-y-6">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-emerald-600" />
                  <span>الأثر المحاسبي لقيد الإهلاك</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex justify-between items-center text-slate-700">
                    <span className="font-semibold">الطرف المدين (Debit):</span>
                    <span className="font-mono text-emerald-700 font-bold">+{estimatedMonthlyDep.toFixed(2)} ر.س</span>
                  </div>
                  <p className="text-[11px] text-slate-500">حـ/ 6108 - مصروف إهلاك الأصول الثابتة (قائمة الدخل)</p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex justify-between items-center text-slate-700">
                    <span className="font-semibold">الطرف الدائن (Credit):</span>
                    <span className="font-mono text-rose-700 font-bold">+{estimatedMonthlyDep.toFixed(2)} ر.س</span>
                  </div>
                  <p className="text-[11px] text-slate-500">حـ/ 1290 - مجمع إهلاك الأصول الثابتة (الميزانية العمومية)</p>
                </div>

                <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-500 space-y-1">
                  <p className="flex items-center gap-1.5 font-semibold text-slate-800">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>حماية من التكرار المالي:</span>
                  </p>
                  <p className="leading-relaxed">
                    النظام يتحقق برمجياً من عدم تشغيل إهلاك نفس الشهر والسنة مرتين منعاً للازدواجية.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // 2. Material Design 3 In-Page Canvas View for New Asset Registration
  if (createModalOpen) {
    const depreciationBase = Math.max(0, purchaseCost - salvageValue);
    const estimatedMonthlyDep = usefulLifeMonths > 0 ? depreciationBase / usefulLifeMonths : 0;

    return (
      <div className="space-y-6 max-w-5xl mx-auto pb-16 animate-in fade-in duration-200">
        {/* Top Header Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3">
            <Button
              variant="tonal"
              size="sm"
              onClick={() => setCreateModalOpen(false)}
              className="gap-1.5"
            >
              <ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
              <span>{isArabic ? "العودة للأصول الثابتة" : "Back to Assets"}</span>
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <Wrench className="h-5 w-5 text-sky-600" />
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  {isArabic ? "إضافة وتسجيل أصل ثابت جديد" : "Register New Fixed Asset"}
                </h1>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                تسجيل خط إنتاج، تانك، سيارة توزيع، أو معدات صناعية مع ربط شجرة الحسابات
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button variant="outline" size="sm" onClick={() => setCreateModalOpen(false)}>
              {isArabic ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              size="sm"
              disabled={createMutation.isPending || !assetNameAr || purchaseCost <= 0}
              onClick={() => createMutation.mutate()}
              className="bg-slate-900 hover:bg-slate-800 text-white min-h-[38px] px-5 gap-1.5 font-bold shadow-sm"
            >
              <Plus className="h-4 w-4" />
              <span>{createMutation.isPending ? "جاري الحفظ..." : "حفظ الأصل الثابت"}</span>
            </Button>
          </div>
        </div>

        {/* 2-Column Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Info Card */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Building className="h-4 w-4 text-sky-600" />
                  <span>البيانات التعريفية للأصل</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold">اسم الأصل (بالعربية) *</Label>
                    <Input
                      placeholder="مثال: خلاط كيميائي رئيسي تانك 5 طن"
                      value={assetNameAr}
                      onChange={(e) => setAssetNameAr(e.target.value)}
                      className="mt-1 bg-white"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">اسم الأصل (بالإنجليزية)</Label>
                    <Input
                      placeholder="e.g. Main 5-Ton Chemical Mixing Tank"
                      value={assetNameEn}
                      onChange={(e) => setAssetNameEn(e.target.value)}
                      className="mt-1 bg-white font-sans"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold">تصنيف الأصل الثابت *</Label>
                    <select
                      value={category}
                      onChange={(e: any) => setCategory(e.target.value)}
                      className="mt-1 w-full h-10 px-3 py-2 text-xs rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                    >
                      <option value="machinery_equipment">آلات ومعدات صناعية وخطوط إنتاج</option>
                      <option value="tanks_infrastructure">تنكات تخزين وخلط وبنية تحتية</option>
                      <option value="vehicles">شاحنات وسيارات توزيع ونقل</option>
                      <option value="furniture_fixtures">أثاث وتجهيزات مكتبية ومعملية</option>
                      <option value="computers_software">أجهزة حاسب وبرمجيات</option>
                    </select>
                  </div>

                  {category === "vehicles" ? (
                    <div>
                      <Label className="text-xs font-semibold">ربط بشاحنة أو سيارة من الأسطول</Label>
                      <select
                        value={vehicleId}
                        onChange={(e) => setVehicleId(e.target.value)}
                        className="mt-1 w-full h-10 px-3 py-2 text-xs rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                      >
                        <option value="">-- اختر السيارة المرتبطة --</option>
                        {vehicles?.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name} ({v.plate_number})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <Label className="text-xs font-semibold">حساب الأصل في شجرة الحسابات</Label>
                      <select
                        value={assetAccountId}
                        onChange={(e) => setAssetAccountId(e.target.value)}
                        className="mt-1 w-full h-10 px-3 py-2 text-xs rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                      >
                        <option value="">-- تلقائي بحسب التصنيف (حـ/ 1200) --</option>
                        {accounts
                          ?.filter((acc) => acc.code.startsWith("12") && acc.type === "asset")
                          .map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.code} - {acc.name_ar}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Financial & Depreciation Parameters Card */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-emerald-600" />
                  <span>التكلفة المالية ومعايير الإهلاك (القسط الثابت)</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-semibold">تاريخ الشراء / بدء الخدمة *</Label>
                  <Input
                    type="date"
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className="mt-1 font-mono bg-white"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold">تكلفة الشراء الأصلية (ر.س) *</Label>
                  <Input
                    type="number"
                    min="0"
                    step="100"
                    value={purchaseCost || ""}
                    onChange={(e) => setPurchaseCost(Number(e.target.value))}
                    className="mt-1 font-mono tabular-nums bg-white font-bold"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold">القيمة التخريدية المتوقعة (خردة ر.س)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={salvageValue || ""}
                    onChange={(e) => setSalvageValue(Number(e.target.value))}
                    className="mt-1 font-mono tabular-nums bg-white"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">القيمة المتبقية للأصل في نهاية عمره الإنتاجي</p>
                </div>

                <div>
                  <Label className="text-xs font-semibold">العمر الإنتاجي المقدر (بالأشهر) *</Label>
                  <Input
                    type="number"
                    min="1"
                    value={usefulLifeMonths || ""}
                    onChange={(e) => setUsefulLifeMonths(Number(e.target.value))}
                    className="mt-1 font-mono tabular-nums bg-white font-bold"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    {usefulLifeMonths ? `${(usefulLifeMonths / 12).toFixed(1)} سنة (${usefulLifeMonths} شهراً)` : ""}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Sidebar: Real-time Depreciation Calculator Card */}
          <div className="space-y-6">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-800">حاسبة القسط الثابت اللحظية</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3 text-xs">
                <div className="flex justify-between items-center text-slate-600">
                  <span>تكلفة الشراء:</span>
                  <span className="font-mono font-bold text-slate-900">{purchaseCost.toFixed(2)} ر.س</span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>القيمة التخريدية المخصومة:</span>
                  <span className="font-mono text-slate-700">-{salvageValue.toFixed(2)} ر.س</span>
                </div>
                <div className="flex justify-between items-center text-slate-600 pt-1 border-t border-slate-100">
                  <span>الوعاء القابل للإهلاك:</span>
                  <span className="font-mono font-bold text-slate-900">{depreciationBase.toFixed(2)} ر.س</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm font-bold mt-2">
                  <span className="text-emerald-950">قسط الإهلاك الشهري:</span>
                  <span className="font-mono text-emerald-700 text-base">{estimatedMonthlyDep.toFixed(2)} ر.س/شهر</span>
                </div>

                <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-500 space-y-1 leading-relaxed">
                  <p className="font-semibold text-slate-800">التكامل مع الحسابات:</p>
                  <p>عند تشغيل الإهلاك الشهري، سيقوم النظام تلقائياً باحتساب هذا القسط وترحيل قيد اليومية دون تدخل يدوي.</p>
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
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Wrench className="h-6 w-6 text-industrial-accent" />
            {isArabic ? "سجل الأصول الثابتة والإهلاك الآلي" : "Fixed Assets & Depreciation"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isArabic
              ? "إدارة خطوط الإنتاج، التانكات الصناعية، أسطول السيارات، احتساب القسط الثابت، وترحيل قيود الإهلاك (6108 / 1290)"
              : "Machinery, bulk tanks, delivery fleet, straight-line depreciation runs and double-entry postings"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePrintAssetsRegister(false)}
            className="gap-1.5 text-xs text-slate-700 hover:bg-slate-100 min-h-[38px]"
          >
            <Printer className="h-4 w-4 text-slate-600" />
            <span>{isArabic ? "طباعة سجل الأصول A4" : "Print Register A4"}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePrintAssetsRegister(true)}
            className="gap-1.5 text-xs text-sky-700 hover:bg-sky-50 min-h-[38px]"
          >
            <FileDown className="h-4 w-4 text-sky-600" />
            <span>{isArabic ? "حفظ PDF" : "Save PDF"}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleShareWhatsappAssets}
            className="gap-1.5 text-xs text-emerald-700 hover:bg-emerald-50 min-h-[38px]"
          >
            <Share2 className="h-4 w-4 text-emerald-600" />
            <span>{isArabic ? "مشاركة واتساب" : "WhatsApp"}</span>
          </Button>

          <Button
            onClick={() => setDepreciationModalOpen(true)}
            variant="outline"
            className="gap-2 border-emerald-300 text-emerald-800 hover:bg-emerald-50 font-bold min-h-[38px]"
          >
            <Play className="h-4 w-4" />
            <span>{isArabic ? "تشغيل الإهلاك الشهري" : "Run Depreciation"}</span>
          </Button>

          <Button
            onClick={() => setCreateModalOpen(true)}
            className="gap-2 bg-slate-900 text-white hover:bg-slate-800 shadow-sm font-semibold min-h-[38px]"
          >
            <Plus className="h-4 w-4" />
            <span>{isArabic ? "إضافة أصل جديد" : "New Fixed Asset"}</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-industrial-border bg-white shadow-sm p-4">
          <span className="text-xs text-slate-500 font-semibold block">إجمالي تكلفة الشراء التاريخية</span>
          <div className="font-mono font-black text-2xl text-slate-900 mt-1">
            {totalCost.toFixed(2)} ر.س
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">كافة الأصول والمعدات المسجلة</span>
        </Card>

        <Card className="border-industrial-border bg-white shadow-sm p-4">
          <span className="text-xs text-slate-500 font-semibold block">مجمع الإهلاك المتراكم (1290)</span>
          <div className="font-mono font-black text-2xl text-rose-700 mt-1">
            {totalAccumulated.toFixed(2)} ر.س
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">إجمالي ما تم استهلاكه دفترياً</span>
        </Card>

        <Card className="border-industrial-border bg-white shadow-sm p-4">
          <span className="text-xs text-emerald-800 font-semibold block">صافي القيمة الدفترية الحالية</span>
          <div className="font-mono font-black text-2xl text-emerald-700 mt-1">
            {totalBookValue.toFixed(2)} ر.س
          </div>
          <span className="text-[11px] text-emerald-600 mt-1 block">القيمة المتبقية المدرجة بالميزانية</span>
        </Card>
      </div>

      {/* Assets Table */}
      <Card className="border-industrial-border bg-white shadow-sm overflow-hidden">
        <CardHeader className="py-3 px-4 border-b border-industrial-border bg-slate-50 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold text-slate-800">
            {isArabic ? "دليل الأصول الثابتة التشغيلية" : "Fixed Assets Registry"}
          </CardTitle>
          <div className="relative w-64">
            <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={isArabic ? "بحث في الأصول..." : "Search assets..."}
              className="h-7 ps-8 bg-white border-industrial-border text-xs"
            />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start border-collapse">
              <thead>
                <tr className="border-b border-industrial-border bg-slate-100/75 text-slate-700 font-semibold">
                  <th className="py-2.5 px-3 text-start">كود الأصل</th>
                  <th className="py-2.5 px-3 text-start">اسم الأصل والمعدّة</th>
                  <th className="py-2.5 px-3 text-start">التصنيف</th>
                  <th className="py-2.5 px-3 text-start">تاريخ الشراء</th>
                  <th className="py-2.5 px-3 text-center">العمر (شهر)</th>
                  <th className="py-2.5 px-3 text-end">تكلفة الشراء</th>
                  <th className="py-2.5 px-3 text-end">مجمع الإهلاك</th>
                  <th className="py-2.5 px-3 text-end">صافي القيمة الدفترية</th>
                  <th className="py-2.5 px-3 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-industrial-border">
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={9} className="p-3">
                        <Skeleton className="h-6 w-full" />
                      </td>
                    </tr>
                  ))
                ) : filteredAssets?.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400">
                      {isArabic ? "لا توجد أصول ثابتة مسجلة" : "No fixed assets found"}
                    </td>
                  </tr>
                ) : (
                  filteredAssets?.map((asset) => (
                    <tr key={asset.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                        {asset.asset_code}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">
                        {asset.name_ar}
                        {asset.vehicle && (
                          <span className="block font-mono text-[10px] text-slate-400">
                            سيارة: {asset.vehicle.plate_number}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge variant="outline" className="text-[10px]">
                          {asset.category === "machinery_equipment"
                            ? "آلات ومعدات"
                            : asset.category === "vehicles"
                            ? "سيارات نقل"
                            : asset.category === "tanks_infrastructure"
                            ? "تانكات وبنية تحتية"
                            : "أثاث وتجهيزات"}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {asset.purchase_date}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700">
                        {asset.useful_life_months}
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono tabular-nums font-bold text-slate-900">
                        {asset.purchase_cost.toFixed(2)} ر.س
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono tabular-nums font-bold text-rose-700">
                        {asset.accumulated_depreciation.toFixed(2)} ر.س
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono tabular-nums font-black text-emerald-800 text-sm">
                        {asset.book_value.toFixed(2)} ر.س
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {asset.status === "active" ? (
                          <Badge variant="emerald" className="text-[10px]">
                            نشط ويعمل
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">
                            مستهلك بالكامل
                          </Badge>
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
    </div>
  );
}
