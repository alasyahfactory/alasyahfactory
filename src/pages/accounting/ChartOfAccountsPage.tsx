import React, { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import type { Account, AccountType } from "@/types/database";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookOpen,
  ArrowRight, Plus, Search, Shield, ChevronDown, ChevronRight } from "lucide-react";

const subAccountSchema = z.object({
  code: z.string().min(4, "كود الحساب يجب أن يتكون من 4 أرقام على الأقل").regex(/^\d+$/, "كود الحساب يجب أن يحتوي على أرقام فقط"),
  name_ar: z.string().min(2, "اسم الحساب بالعربية مطلوب"),
  name_en: z.string().min(2, "اسم الحساب بالإنجليزية مطلوب"),
  parent_id: z.string().min(1, "الحساب الرئيسي مطلوب"),
  type: z.enum(["asset", "contra_asset", "liability", "equity", "revenue", "contra_revenue", "expense"] as const),
});

type SubAccountFormData = z.infer<typeof subAccountSchema>;

export function ChartOfAccountsPage() {
  const { user, role } = useAuth();
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const isOwner = role === "owner";

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [isAddOpen, setIsAddOpen] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SubAccountFormData>({
    resolver: zodResolver(subAccountSchema),
    defaultValues: {
      code: "",
      name_ar: "",
      name_en: "",
      parent_id: "",
      type: "asset",
    },
  });

  const selectedParentId = watch("parent_id");
  const selectedType = watch("type");

  const loadAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .order("code", { ascending: true });

      if (error) throw error;
      setAccounts((data as Account[]) || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load COA";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  // Filter accounts
  const filteredData = useMemo(() => {
    return accounts.filter((acc) => {
      const matchesSearch =
        acc.code.toLowerCase().includes(globalFilter.toLowerCase()) ||
        acc.name_ar.toLowerCase().includes(globalFilter.toLowerCase()) ||
        acc.name_en.toLowerCase().includes(globalFilter.toLowerCase());

      const matchesType = typeFilter === "all" || acc.type === typeFilter;

      return matchesSearch && matchesType;
    });
  }, [accounts, globalFilter, typeFilter]);

  // Headers list for selecting parent
  const headerAccounts = useMemo(() => {
    return accounts.filter((a) => a.type === "header" || a.code.length <= 4);
  }, [accounts]);

  // Handle create sub-account
  const onSubmitSubAccount = async (data: SubAccountFormData) => {
    try {
      const { error } = await supabase.from("accounts").insert({
        code: data.code,
        name_ar: data.name_ar,
        name_en: data.name_en,
        type: data.type,
        parent_id: data.parent_id,
        is_system: false,
        is_active: true,
        current_balance: 0,
      });

      if (error) throw error;

      if (user?.id) {
        await supabase.from("audit_logs").insert({
          user_id: user.id,
          action: "ACCOUNT_CREATED",
          table_name: "accounts",
          record_id: data.code,
          details: `Owner created sub-account ${data.code} - ${data.name_ar}`,
        });
      }

      toast.success(isArabic ? "تم إنشاء الحساب الفرعي بنجاح" : "Sub-account created");
      setIsAddOpen(false);
      reset();
      loadAccounts();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error creating account";
      toast.error(msg);
    }
  };

  const getAccountTypeBadgeVariant = (type: AccountType) => {
    switch (type) {
      case "header":
        return "default";
      case "asset":
      case "contra_asset":
        return "emerald";
      case "liability":
        return "rose";
      case "equity":
        return "purple";
      case "revenue":
      case "contra_revenue":
        return "amber";
      case "expense":
        return "secondary";
    }
  };


  // Full-page in-place Canvas for Adding Sub-Account
  if (isAddOpen) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto pb-16 animate-in fade-in duration-200">
        {/* Top Header Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3">
            <Button
              variant="tonal"
              size="sm"
              onClick={() => setIsAddOpen(false)}
              className="gap-1.5"
            >
              <ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
              <span>العودة لدليل الحسابات</span>
            </Button>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-industrial-accent" />
                <span>{t("coa.addSubAccount")}</span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                إضافة حساب فرعي جديد لشجرة الحسابات المحاسبية وفق المعايير السعودية
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddOpen(false)}
              disabled={isSubmitting}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={isSubmitting}
              onClick={handleSubmit(onSubmitSubAccount)}
              className="bg-slate-900 hover:bg-slate-800 text-white min-h-[40px] px-6"
            >
              {isSubmitting ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </div>

        {/* Form Card */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
            <CardTitle className="text-base font-semibold">بيانات وتصنيف الحساب المالي</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit(onSubmitSubAccount)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="sub_parent">{t("coa.parentAccount")}</Label>
                <Select
                  value={selectedParentId}
                  onValueChange={(val) => {
                    setValue("parent_id", val);
                    const parent = accounts.find((a) => a.id === val);
                    if (parent) {
                      if (parent.type === "header") {
                        if (parent.code === "1000") setValue("type", "asset");
                        else if (parent.code === "2000") setValue("type", "liability");
                        else if (parent.code === "3000") setValue("type", "equity");
                        else if (parent.code === "4000") setValue("type", "revenue");
                        else if (parent.code === "5000" || parent.code === "6000") setValue("type", "expense");
                      } else {
                        setValue("type", parent.type as SubAccountFormData["type"]);
                      }
                    }
                  }}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="sub_parent" className="h-10">
                    <SelectValue placeholder="اختر الحساب الرئيسي..." />
                  </SelectTrigger>
                  <SelectContent>
                    {headerAccounts.map((h) => (
                      <SelectItem key={h.id} value={h.id}>
                        {h.code} — {h.name_ar} ({h.name_en})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.parent_id && (
                  <p className="text-xs text-rose-600">{errors.parent_id.message}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="sub_code">{t("coa.accountCode")}</Label>
                  <Input
                    id="sub_code"
                    dir="ltr"
                    placeholder="1106"
                    className="font-mono text-sm h-10"
                    disabled={isSubmitting}
                    {...register("code")}
                  />
                  {errors.code && (
                    <p className="text-xs text-rose-600">{errors.code.message}</p>
                  )}
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="sub_type">{t("coa.accountType")}</Label>
                  <Select
                    value={selectedType}
                    onValueChange={(val) => setValue("type", val as SubAccountFormData["type"])}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger id="sub_type" className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asset">أصل (Asset)</SelectItem>
                      <SelectItem value="contra_asset">مجمع إهلاك / مقابل أصل (Contra-Asset)</SelectItem>
                      <SelectItem value="liability">التزام (Liability)</SelectItem>
                      <SelectItem value="equity">حقوق ملكية (Equity)</SelectItem>
                      <SelectItem value="revenue">إيراد (Revenue)</SelectItem>
                      <SelectItem value="contra_revenue">مردودات ومسموحات (Contra-Revenue)</SelectItem>
                      <SelectItem value="expense">مصروف (Expense)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="sub_name_ar">{t("coa.accountNameAr")}</Label>
                  <Input
                    id="sub_name_ar"
                    placeholder="خزنة مستودع التعبئة"
                    className="h-10"
                    disabled={isSubmitting}
                    {...register("name_ar")}
                  />
                  {errors.name_ar && (
                    <p className="text-xs text-rose-600">{errors.name_ar.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="sub_name_en">{t("coa.accountNameEn")}</Label>
                  <Input
                    id="sub_name_en"
                    dir="ltr"
                    placeholder="Packaging Cash Box"
                    className="h-10"
                    disabled={isSubmitting}
                    {...register("name_en")}
                  />
                  {errors.name_en && (
                    <p className="text-xs text-rose-600">{errors.name_en.message}</p>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddOpen(false)}
                  disabled={isSubmitting}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-slate-900 hover:bg-slate-800 text-white min-h-[40px] px-6"
                >
                  {isSubmitting ? t("common.saving") : t("common.save")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-industrial-primary sm:text-2xl flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-amber-600" />
            <span>{t("coa.title")}</span>
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            {t("coa.subtitle")}
          </p>
        </div>

        {isOwner && (
          <Button
            onClick={() => {
              reset();
              setIsAddOpen(true);
            }}
            className="bg-industrial-primary hover:bg-slate-800 text-white font-medium shadow-sm"
          >
            <Plus className="me-2 h-4 w-4" />
            <span>{t("coa.addSubAccount")}</span>
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="p-4 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute start-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder={t("coa.searchPlaceholder")}
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className="ps-9 h-9"
              />
            </div>

            {/* Type Filter */}
            <div className="flex items-center gap-2">
              <Label className="text-xs text-slate-500 whitespace-nowrap">
                {t("common.filter")}:
              </Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-36 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.all")}</SelectItem>
                  <SelectItem value="header">رئيسي (Headers)</SelectItem>
                  <SelectItem value="asset">أصول (Assets)</SelectItem>
                  <SelectItem value="liability">التزامات (Liabilities)</SelectItem>
                  <SelectItem value="equity">حقوق ملكية (Equity)</SelectItem>
                  <SelectItem value="revenue">إيرادات (Revenue)</SelectItem>
                  <SelectItem value="expense">مصروفات (Expenses)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : filteredData.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">
              {isArabic ? "لا توجد حسابات مطابقة للبحث" : "No matching accounts"}
            </div>
          ) : (
            <div
              className="table-accessible-wrapper heavy-section-deferred"
              tabIndex={0}
              role="region"
              aria-label={isArabic ? "شجرة الحسابات المحاسبية" : "Chart of Accounts"}
            >
              <table className="w-full text-start text-xs sm:text-sm">
                <caption className="sr-only">
                  {isArabic ? "دليل شجرة الحسابات العامة" : "General Chart of Accounts"}
                </caption>
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-industrial-border bg-slate-50/95 text-slate-600 font-semibold backdrop-blur-sm">
                    <th scope="col" className="p-3 text-start w-32">{t("coa.accountCode")}</th>
                    <th scope="col" className="p-3 text-start">{t("coa.accountNameAr")}</th>
                    <th scope="col" className="p-3 text-start">{t("coa.accountNameEn")}</th>
                    <th scope="col" className="p-3 text-start">{t("coa.accountType")}</th>
                    <th scope="col" className="p-3 text-start text-end">{t("coa.balance")}</th>
                    <th scope="col" className="p-3 text-center w-24">{t("common.status")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-industrial-border font-sans">
                  {filteredData.map((acc) => {
                    const isHeader = acc.type === "header";
                    const isIndented = !isHeader;

                    return (
                      <tr
                        key={acc.id}
                        className={`transition-colors ${
                          isHeader
                            ? "bg-slate-100/70 font-bold text-slate-900"
                            : "hover:bg-slate-50/60 text-slate-700"
                        }`}
                      >
                        <td className="p-3 font-mono tabular-nums font-bold" dir="ltr">
                          {acc.code}
                        </td>
                        <td className={`p-3 ${isIndented ? (isArabic ? "ps-8" : "pe-8") : ""}`}>
                          <div className="flex items-center gap-1.5">
                            {isHeader && (
                              <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                            )}
                            <span className={isHeader ? "text-slate-900" : ""}>
                              {acc.name_ar}
                            </span>
                          </div>
                        </td>
                        <td
                          className={`p-3 text-slate-500 ${isIndented ? "ps-4" : ""}`}
                          dir="ltr"
                        >
                          {acc.name_en}
                        </td>
                        <td className="p-3">
                          <Badge
                            variant={getAccountTypeBadgeVariant(acc.type)}
                            className="text-[10px]"
                          >
                            {acc.type}
                          </Badge>
                        </td>
                        <td className="p-3 text-end font-mono tabular-nums font-medium">
                          {formatCurrency(Number(acc.current_balance), isArabic ? "ar-SA" : "en-SA")}
                        </td>
                        <td className="p-3 text-center">
                          {acc.is_system ? (
                            <span
                              title={t("coa.systemAccount")}
                              className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-slate-100 text-slate-600"
                            >
                              <Shield className="h-3.5 w-3.5" />
                            </span>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              {isArabic ? "فرعي" : "Custom"}
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
