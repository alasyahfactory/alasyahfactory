import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import type { FactorySettings } from "@/types/database";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Save, Upload, Trash2, ShieldAlert, Download, FileSpreadsheet, FileJson, Database } from "lucide-react";
import * as XLSX from "xlsx";

const vatRegex = /^3[0-9]{13}3$/;

const factorySchema = z.object({
  name_ar: z.string().min(2, "اسم المصنع بالعربية مطلوب"),
  name_en: z.string().min(2, "اسم المصنع بالإنجليزية مطلوب"),
  vat_number: z
    .string()
    .length(15, "الرقم الضريبي يجب أن يتكون من 15 رقماً بالضبط")
    .regex(vatRegex, "يجب أن يتكون الرقم الضريبي من 15 رقماً ويبدأ وينتهي بالرقم 3 حسب معايير هيئة الزكاة (ZATCA)"),
  cr_number: z.string().min(3, "رقم السجل التجاري مطلوب"),
  national_address: z.string().min(5, "العنوان الوطني مطلوب"),
  iban: z
    .string()
    .min(15, "رقم الـ IBAN مطلوب")
    .regex(/^SA[0-9A-Z]{22}$/, "صيغة الـ IBAN السعودي غير صحيحة (يجب أن تبدأ بـ SA متبوعة بـ 22 رقماً وحرفاً)"),
  label_width_mm: z.coerce.number().min(20, "أقل عرض للملصق هو 20 مم").max(200, "أقصى عرض 200 مم"),
  label_height_mm: z.coerce.number().min(15, "أقل ارتفاع للملصق هو 15 مم").max(200, "أقصى ارتفاع 200 مم"),
  near_expiry_days: z.coerce.number().min(1, "أيام التنبيه يجب أن تكون 1 على الأقل"),
  enable_fixed_assets: z.boolean(),
});

type FactoryFormData = z.infer<typeof factorySchema>;

export function FactorySettingsPage() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";

  const [loading, setLoading] = useState(true);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [exportingJson, setExportingJson] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  const fetchBackupData = async () => {
    const [
      { data: settings },
      { data: items },
      { data: warehouses },
      { data: tanks },
      { data: accounts },
      { data: customers },
      { data: suppliers },
      { data: formulas },
      { data: salesInvoices },
      { data: purchaseOrders },
      { data: journalEntries },
    ] = await Promise.all([
      supabase.from("factory_settings").select("*"),
      supabase.from("items").select("*"),
      supabase.from("warehouses").select("*"),
      supabase.from("tanks").select("*"),
      supabase.from("accounts").select("*"),
      supabase.from("customers").select("*"),
      supabase.from("suppliers").select("*"),
      supabase.from("formulas").select("*"),
      supabase.from("sales_invoices").select("*"),
      supabase.from("purchase_orders").select("*"),
      supabase.from("journal_entries").select("*"),
    ]);

    return {
      backupDate: new Date().toISOString(),
      factorySettings: settings || [],
      items: items || [],
      warehouses: warehouses || [],
      tanks: tanks || [],
      chartOfAccounts: accounts || [],
      customers: customers || [],
      suppliers: suppliers || [],
      formulas: formulas || [],
      salesInvoices: salesInvoices || [],
      purchaseOrders: purchaseOrders || [],
      journalEntries: journalEntries || [],
    };
  };

  const exportBackupJson = async () => {
    try {
      setExportingJson(true);
      const data = await fetchBackupData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `alasyah_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(isArabic ? "تم تنزيل النسخة الاحتياطية بصيغة JSON بنجاح" : "JSON backup downloaded successfully");
    } catch (err) {
      console.error(err);
      toast.error(isArabic ? "فشل إنشاء النسخة الاحتياطية" : "Failed to create backup");
    } finally {
      setExportingJson(false);
    }
  };

  const exportBackupExcel = async () => {
    try {
      setExportingExcel(true);
      const data = await fetchBackupData();
      const wb = XLSX.utils.book_new();

      if (data.items.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.items), "Items");
      if (data.chartOfAccounts.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.chartOfAccounts), "Accounts");
      if (data.tanks.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.tanks), "Tanks");
      if (data.warehouses.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.warehouses), "Warehouses");
      if (data.customers.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.customers), "Customers");
      if (data.suppliers.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.suppliers), "Suppliers");
      if (data.salesInvoices.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.salesInvoices), "SalesInvoices");
      if (data.journalEntries.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.journalEntries), "JournalEntries");

      XLSX.writeFile(wb, `alasyah_backup_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success(isArabic ? "تم تنزيل النسخة الاحتياطية بصيغة Excel بنجاح" : "Excel backup downloaded successfully");
    } catch (err) {
      console.error(err);
      toast.error(isArabic ? "فشل إنشاء النسخة الاحتياطية" : "Failed to create backup");
    } finally {
      setExportingExcel(false);
    }
  };

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FactoryFormData>({
    resolver: zodResolver(factorySchema),
    defaultValues: {
      name_ar: "",
      name_en: "",
      vat_number: "",
      cr_number: "",
      national_address: "",
      iban: "",
      label_width_mm: 50,
      label_height_mm: 30,
      near_expiry_days: 60,
      enable_fixed_assets: false,
    },
  });

  const enableFixedAssets = watch("enable_fixed_assets");

  useEffect(() => {
    async function fetchSettings() {
      try {
        const { data, error } = await supabase
          .from("factory_settings")
          .select("*")
          .eq("id", 1)
          .single();

        if (error && error.code !== "PGRST116") {
          toast.error(isArabic ? "تعذر جلب إعدادات المصنع" : "Failed to load factory settings");
        } else if (data) {
          reset({
            name_ar: data.name_ar,
            name_en: data.name_en,
            vat_number: data.vat_number,
            cr_number: data.cr_number,
            national_address: data.national_address,
            iban: data.iban,
            label_width_mm: data.label_width_mm,
            label_height_mm: data.label_height_mm,
            near_expiry_days: data.near_expiry_days,
            enable_fixed_assets: data.enable_fixed_assets,
          });
          setLogoBase64(data.logo_base64 || null);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    fetchSettings();
  }, [reset, isArabic]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size <= 150KB
    if (file.size > 150 * 1024) {
      toast.error(
        isArabic
          ? "حجم الشعار يتجاوز 150 كيلوبايت. يرجى ضغط الصورة أولاً لحفظ مساحة Supabase"
          : "Logo size exceeds 150KB. Please compress the file."
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setLogoBase64(reader.result as string);
      toast.success(isArabic ? "تم تحميل الشعار بنجاح" : "Logo loaded");
    };
    reader.readAsDataURL(file);
  };

  const removeLogo = () => {
    setLogoBase64(null);
  };

  const onSubmit = async (data: FactoryFormData) => {
    try {
      const payload = {
        id: 1,
        ...data,
        logo_base64: logoBase64,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("factory_settings")
        .upsert(payload, { onConflict: "id" });

      if (error) throw error;

      // Write to audit_logs
      if (user?.id) {
        await supabase.from("audit_logs").insert({
          user_id: user.id,
          action: "FACTORY_SETTINGS_UPDATED",
          table_name: "factory_settings",
          record_id: "1",
          details: "Owner updated official factory settings and tax details",
        });
      }

      toast.success(t("common.saved"));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error saving settings";
      toast.error(msg);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-industrial-primary sm:text-2xl flex items-center gap-2">
          <Building2 className="h-6 w-6 text-accent" />
          <span>{t("factory.title")}</span>
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-slate-500">
          {t("factory.subtitle")}
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic & Tax Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              {isArabic ? "البيانات الرسمية والضريبية" : "Official & Tax Information"}
            </CardTitle>
            <CardDescription className="text-xs">
              {isArabic
                ? "تُطبع هذه البيانات على فواتير المبيعات الضريبية وإشعارات الدائن المتوافقة مع ZATCA"
                : "Printed on official ZATCA tax invoices and commercial documents"}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="name_ar">{t("factory.nameAr")}</Label>
              <Input
                id="name_ar"
                placeholder="مصنع الأسياح للمنظفات"
                disabled={isSubmitting}
                {...register("name_ar")}
              />
              {errors.name_ar && (
                <p className="text-xs text-rose-600">{errors.name_ar.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="name_en">{t("factory.nameEn")}</Label>
              <Input
                id="name_en"
                dir="ltr"
                placeholder="Al-Asyah Detergent Factory"
                disabled={isSubmitting}
                {...register("name_en")}
              />
              {errors.name_en && (
                <p className="text-xs text-rose-600">{errors.name_en.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="vat_number">{t("factory.vatNumber")}</Label>
              <Input
                id="vat_number"
                dir="ltr"
                tabularNums
                placeholder="3XXXXXXXXXXXXX3"
                className="font-mono"
                disabled={isSubmitting}
                {...register("vat_number")}
              />
              {errors.vat_number ? (
                <p className="text-xs text-rose-600">{errors.vat_number.message}</p>
              ) : (
                <p className="text-[11px] text-slate-400">{t("factory.vatNumberHelp")}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cr_number">{t("factory.crNumber")}</Label>
              <Input
                id="cr_number"
                dir="ltr"
                tabularNums
                placeholder="1010XXXXXX"
                className="font-mono"
                disabled={isSubmitting}
                {...register("cr_number")}
              />
              {errors.cr_number && (
                <p className="text-xs text-rose-600">{errors.cr_number.message}</p>
              )}
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="national_address">{t("factory.nationalAddress")}</Label>
              <Input
                id="national_address"
                placeholder="الرياض، منطقة المصانع، مبنى 1234، الرمز البريدي 12345"
                disabled={isSubmitting}
                {...register("national_address")}
              />
              {errors.national_address && (
                <p className="text-xs text-rose-600">{errors.national_address.message}</p>
              )}
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="iban">{t("factory.iban")}</Label>
              <Input
                id="iban"
                dir="ltr"
                tabularNums
                placeholder="SA0000000000000000000000"
                className="font-mono uppercase"
                disabled={isSubmitting}
                {...register("iban")}
              />
              {errors.iban && (
                <p className="text-xs text-rose-600">{errors.iban.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Thermal Barcode Labels & System Switches */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              {t("factory.labelDimensions")} & {isArabic ? "الخيارات التشغيلية" : "Operational Settings"}
            </CardTitle>
            <CardDescription className="text-xs">
              {isArabic
                ? "تحديد مقاس استيكر الباركود والتشغيلة الحراري وأيام التنبيه وتفعيل الأصول الثابتة"
                : "Thermal label size, expiry thresholds, and fixed assets activation"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="label_width_mm">{t("factory.labelWidth")}</Label>
                <Input
                  id="label_width_mm"
                  type="number"
                  tabularNums
                  disabled={isSubmitting}
                  {...register("label_width_mm")}
                />
                {errors.label_width_mm && (
                  <p className="text-xs text-rose-600">{errors.label_width_mm.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="label_height_mm">{t("factory.labelHeight")}</Label>
                <Input
                  id="label_height_mm"
                  type="number"
                  tabularNums
                  disabled={isSubmitting}
                  {...register("label_height_mm")}
                />
                {errors.label_height_mm && (
                  <p className="text-xs text-rose-600">{errors.label_height_mm.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="near_expiry_days">{t("factory.nearExpiryDays")}</Label>
                <Input
                  id="near_expiry_days"
                  type="number"
                  tabularNums
                  disabled={isSubmitting}
                  {...register("near_expiry_days")}
                />
                {errors.near_expiry_days && (
                  <p className="text-xs text-rose-600">{errors.near_expiry_days.message}</p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5 pe-4">
                  <Label htmlFor="enable_fixed_assets" className="text-sm font-semibold">
                    {t("factory.enableFixedAssets")}
                  </Label>
                  <p className="text-xs text-slate-500">
                    {t("factory.enableFixedAssetsHelp")}
                  </p>
                </div>
                <Switch
                  id="enable_fixed_assets"
                  checked={enableFixedAssets}
                  onCheckedChange={(checked) => setValue("enable_fixed_assets", checked)}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Factory Logo Base64 (Zero-cost, <= 150KB) */}
            <div className="space-y-2">
              <Label>{t("factory.logo")}</Label>
              <div className="flex items-center gap-4">
                {logoBase64 ? (
                  <div className="relative flex h-20 w-32 items-center justify-center rounded-md border border-industrial-border bg-white p-1">
                    <img
                      src={logoBase64}
                      alt="Factory Logo"
                      className="max-h-full max-w-full object-contain"
                    />
                    <button
                      type="button"
                      onClick={removeLogo}
                      className="absolute -top-2 -end-2 flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-white hover:bg-rose-700 shadow"
                      title="Remove Logo"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex h-20 w-32 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-400">
                    {isArabic ? "لا يوجد شعار" : "No Logo"}
                  </div>
                )}

                <div>
                  <label className="cursor-pointer inline-flex items-center gap-2 rounded-md border border-industrial-border bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm">
                    <Upload className="h-4 w-4 text-accent" />
                    <span>{logoBase64 ? t("factory.changeLogo") : t("factory.uploadLogo")}</span>
                    <input
                      type="file"
                      accept="image/png, image/jpeg, image/webp"
                      className="hidden"
                      onChange={handleLogoUpload}
                      disabled={isSubmitting}
                    />
                  </label>
                  <p className="mt-1 text-[11px] text-slate-400">
                    PNG / JPG • Max 150KB
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button
            type="submit"
            variant="default"
            size="lg"
            isLoading={isSubmitting}
            className="w-full sm:w-auto bg-industrial-primary hover:bg-slate-800 text-white font-semibold"
          >
            <Save className="me-2 h-4 w-4" />
            <span>{isSubmitting ? t("common.saving") : t("common.save")}</span>
          </Button>
        </div>
      </form>

      {/* Manual Backup & Data Export (SPEC v3.1 Section 2.3) */}
      <Card className="border-industrial-border bg-white shadow-sm mt-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-industrial-primary" />
            <CardTitle className="text-lg">
              {isArabic ? "النسخ الاحتياطي وحفظ البيانات للمدير العام" : "Manual System Backup & Data Export"}
            </CardTitle>
          </div>
          <CardDescription>
            {isArabic
              ? "تصدير فوري لكامل جداول المصنع (الأصناف، الخلطات، الحسابات، العملاء، الموردين، الفواتير، والقيود) بصيغة JSON أو ملف Excel متعدد الصفحات وحفظها محلياً بأمان"
              : "Export all master records, ledger entries, formulas and invoices to JSON or multi-sheet Excel for offline security"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={exportBackupExcel}
              isLoading={exportingExcel}
              className="flex-1 border-emerald-300 text-emerald-800 hover:bg-emerald-50 hover:text-emerald-900 font-semibold"
            >
              <FileSpreadsheet className="me-2 h-4 w-4 text-emerald-600" />
              <span>{isArabic ? "تصدير نسخة احتياطية كاملة (Excel)" : "Export All Tables to Excel (.xlsx)"}</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={exportBackupJson}
              isLoading={exportingJson}
              className="flex-1 border-sky-300 text-sky-800 hover:bg-sky-50 hover:text-sky-900 font-semibold"
            >
              <FileJson className="me-2 h-4 w-4 text-sky-600" />
              <span>{isArabic ? "تصدير قاعدة البيانات (JSON Backup)" : "Export Full Database (JSON Backup)"}</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
