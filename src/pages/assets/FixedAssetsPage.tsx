import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import {
  Wrench,
  Plus,
  Play,
  Search,
  CheckCircle2,
  Clock,
  Truck,
  Building,
  Layers,
  Calendar,
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

        <div className="flex items-center gap-2">
          <Button
            onClick={() => setDepreciationModalOpen(true)}
            variant="outline"
            className="gap-2 border-emerald-300 text-emerald-800 hover:bg-emerald-50 font-bold"
          >
            <Play className="h-4 w-4" />
            <span>{isArabic ? "تشغيل الإهلاك الشهري" : "Run Depreciation"}</span>
          </Button>

          <Button
            onClick={() => setCreateModalOpen(true)}
            className="gap-2 bg-slate-900 text-white hover:bg-slate-800 shadow-sm font-semibold"
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

      {/* Add Asset Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Plus className="h-4 w-4 text-industrial-accent" />
              <span>إضافة أصل ثابت جديد للنظام</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 pt-2 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">اسم الأصل بالعربية *</label>
                <Input
                  value={assetNameAr}
                  onChange={(e) => setAssetNameAr(e.target.value)}
                  placeholder="مثال: خلاط 5000 لتر ستانلس ستيل"
                  className="h-8 text-xs bg-slate-50 border-industrial-border"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">اسم الأصل بالإنجليزية</label>
                <Input
                  value={assetNameEn}
                  onChange={(e) => setAssetNameEn(e.target.value)}
                  placeholder="Stainless Steel Tank 5000L"
                  className="h-8 text-xs bg-slate-50 border-industrial-border"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">تصنيف الأصل *</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="w-full h-8 px-2 rounded border border-industrial-border bg-slate-50 text-xs font-medium text-slate-800"
                >
                  <option value="machinery_equipment">آلات ومعدات وخطوط تعبئة</option>
                  <option value="tanks_infrastructure">تانكات الخلط والبنية التحتية</option>
                  <option value="vehicles">سيارات التوزيع والنقل</option>
                  <option value="computers_software">أجهزة وبرامج تقنية</option>
                  <option value="furniture_fixtures">أثاث وتجهيزات مكاتب</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">تاريخ الشراء والتشغيل *</label>
                <Input
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="h-8 text-xs font-mono bg-slate-50 border-industrial-border"
                />
              </div>
            </div>

            {category === "vehicles" && (
              <div>
                <label className="font-bold text-slate-700 block mb-1">ربط بسيارة من الأسطول</label>
                <select
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                  className="w-full h-8 px-2 rounded border border-industrial-border bg-slate-50 text-xs font-medium text-slate-800"
                >
                  <option value="">اختر السيارة إن وجدت...</option>
                  {vehicles?.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.plate_number})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="font-bold text-slate-700 block mb-1">حساب الأصل في شجرة الحسابات (1201) *</label>
              <select
                value={assetAccountId}
                onChange={(e) => setAssetAccountId(e.target.value)}
                className="w-full h-8 px-2 rounded border border-industrial-border bg-slate-50 text-xs font-medium text-slate-800"
              >
                <option value="">اختر حساب الأصل...</option>
                {accounts
                  ?.filter((a) => a.code.startsWith("120"))
                  .map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.code} - {acc.name_ar}
                    </option>
                  ))}
              </select>
            </div>

            {/* Financial Parameters */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">تكلفة الشراء (SAR) *</label>
                <Input
                  type="number"
                  min="1"
                  step="0.01"
                  value={purchaseCost || ""}
                  onChange={(e) => setPurchaseCost(Number(e.target.value))}
                  placeholder="0.00"
                  className="h-8 text-xs font-mono text-end font-bold text-slate-900 bg-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">قيمة الخردة (SAR)</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={salvageValue || ""}
                  onChange={(e) => setSalvageValue(Number(e.target.value))}
                  placeholder="0.00"
                  className="h-8 text-xs font-mono text-end bg-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">العمر الإنتاجي (شهور) *</label>
                <Input
                  type="number"
                  min="1"
                  value={usefulLifeMonths}
                  onChange={(e) => setUsefulLifeMonths(Number(e.target.value))}
                  placeholder="60"
                  className="h-8 text-xs font-mono text-center font-bold bg-white"
                />
              </div>
            </div>

            <p className="text-[11px] text-slate-500">
              * يتم احتساب الإهلاك بطريقة القسط الثابت شهرياً: <code>(التكلفة - الخردة) / العمر بالشهور</code> ويرحل آلياً لحساب المصروف 6108 والمجمع 1290.
            </p>
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
              disabled={!assetNameAr || purchaseCost <= 0 || !assetAccountId || createMutation.isPending}
              className="gap-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold"
            >
              {createMutation.isPending ? "جاري الحفظ..." : "حفظ الأصل الثابت"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Run Depreciation Modal */}
      <Dialog open={depreciationModalOpen} onOpenChange={setDepreciationModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-emerald-800">
              <Play className="h-5 w-5" />
              <span>تشغيل وترحيل الإهلاك الشهري للأصول الثابتة</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 pt-2 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">الشهر المستهدف *</label>
                <select
                  value={depMonth}
                  onChange={(e) => setDepMonth(Number(e.target.value))}
                  className="w-full h-8 px-2 rounded border border-industrial-border bg-slate-50 text-xs font-medium text-slate-800"
                >
                  {Array.from({ length: 12 }).map((_, i) => (
                    <option key={i + 1} value={i + 1}>
                      شهر {i + 1}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">السنة المالية *</label>
                <select
                  value={depYear}
                  onChange={(e) => setDepYear(Number(e.target.value))}
                  className="w-full h-8 px-2 rounded border border-industrial-border bg-slate-50 text-xs font-medium text-slate-800"
                >
                  <option value={2024}>2024</option>
                  <option value={2025}>2025</option>
                  <option value={2026}>2026</option>
                </select>
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">تاريخ تسجيل قيد الإهلاك *</label>
              <Input
                type="date"
                value={depDate}
                onChange={(e) => setDepDate(e.target.value)}
                className="h-8 text-xs font-mono bg-slate-50 border-industrial-border"
              />
            </div>

            <div className="p-3 bg-slate-100 rounded-lg text-slate-700 space-y-1">
              <div className="font-bold">القيد المحاسبي المتوازن الذي سيتم ترحيله:</div>
              <div className="font-mono text-emerald-800">من حـ/ مصروف إهلاك الأصول الثابتة (6108)</div>
              <div className="font-mono text-slate-800">إلى حـ/ مجمع إهلاك الأصول الثابتة (1290)</div>
            </div>
          </div>

          <DialogFooter className="pt-3 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDepreciationModalOpen(false)}
            >
              إلغاء
            </Button>
            <Button
              onClick={() => depMutation.mutate()}
              disabled={depMutation.isPending}
              className="gap-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold"
            >
              {depMutation.isPending ? "جاري الاحتساب..." : "احتساب وترحيل قيد الإهلاك"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
