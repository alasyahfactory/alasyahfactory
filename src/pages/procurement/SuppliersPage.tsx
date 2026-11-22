import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/lib/supabase";
import { Supplier } from "@/types/database";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus,
  ArrowRight, Building2, Search, Phone, Mail, FileText, Loader2, CheckCircle2 } from "lucide-react";

const supplierSchema = z.object({
  name_ar: z.string().min(2, "اسم المورد بالعربية مطلوب"),
  name_en: z.string().optional().nullable(),
  tax_number: z
    .string()
    .regex(/^3\d{13}3$/, "الرقم الضريبي لـ ZATCA يجب أن يتكون من 15 خانة تبدأ وتنتهي بـ 3")
    .or(z.literal(""))
    .optional()
    .nullable(),
  contact_phone: z.string().min(8, "رقم الجوال مطلوب").optional().nullable(),
  contact_email: z.string().email("البريد الإلكتروني غير صحيح").or(z.literal("")).optional().nullable(),
  address: z.string().optional().nullable(),
  credit_limit: z.coerce.number().min(0).default(0),
});

type SupplierFormData = z.infer<typeof supplierSchema>;

export function SuppliersPage() {
  const { i18n } = useTranslation();
  const queryClient = useQueryClient();
  const isAr = i18n.language === "ar";

  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  // Fetch Suppliers
  const { data: suppliers = [], isLoading } = useQuery<Supplier[]>({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Supplier[];
    },
  });

  const form = useForm<SupplierFormData>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name_ar: "",
      name_en: "",
      tax_number: "",
      contact_phone: "",
      contact_email: "",
      address: "",
      credit_limit: 0,
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (formData: SupplierFormData) => {
      if (editingSupplier) {
        const { error } = await supabase
          .from("suppliers")
          .update({
            name_ar: formData.name_ar,
            name_en: formData.name_en || null,
            tax_number: formData.tax_number || null,
            contact_phone: formData.contact_phone || null,
            contact_email: formData.contact_email || null,
            address: formData.address || null,
            credit_limit: formData.credit_limit,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingSupplier.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("suppliers").insert([
          {
            name_ar: formData.name_ar,
            name_en: formData.name_en || null,
            tax_number: formData.tax_number || null,
            contact_phone: formData.contact_phone || null,
            contact_email: formData.contact_email || null,
            address: formData.address || null,
            credit_limit: formData.credit_limit,
            current_balance: 0,
          },
        ]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success(editingSupplier ? "تم تحديث بيانات المورد" : "تمت إضافة المورد بنجاح");
      setIsDialogOpen(false);
      setEditingSupplier(null);
      form.reset();
    },
    onError: (err: any) => {
      toast.error(err.message || "حدث خطأ أثناء حفظ المورد");
    },
  });

  const openCreateDialog = () => {
    setEditingSupplier(null);
    form.reset({
      name_ar: "",
      name_en: "",
      tax_number: "",
      contact_phone: "",
      contact_email: "",
      address: "",
      credit_limit: 0,
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    form.reset({
      name_ar: supplier.name_ar,
      name_en: supplier.name_en || "",
      tax_number: supplier.tax_number || "",
      contact_phone: supplier.contact_phone || "",
      contact_email: supplier.contact_email || "",
      address: supplier.address || "",
      credit_limit: supplier.credit_limit || 0,
    });
    setIsDialogOpen(true);
  };

  const filteredSuppliers = suppliers.filter((s) => {
    const q = searchQuery.toLowerCase();
    return (
      s.name_ar.toLowerCase().includes(q) ||
      (s.name_en && s.name_en.toLowerCase().includes(q)) ||
      (s.tax_number && s.tax_number.includes(q)) ||
      (s.contact_phone && s.contact_phone.includes(q))
    );
  });


  // Full-page in-place Canvas for Adding / Editing a Supplier
  if (isDialogOpen) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto pb-16 animate-in fade-in duration-200">
        {/* Top Header Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3">
            <Button
              variant="tonal"
              size="sm"
              onClick={() => setIsDialogOpen(false)}
              className="gap-1.5"
            >
              <ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
              <span>{isAr ? "العودة لقائمة الموردين" : "Back to Suppliers"}</span>
            </Button>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-sky-600" />
                <span>
                  {editingSupplier
                    ? isAr ? "تعديل بيانات المورد" : "Edit Supplier"
                    : isAr ? "إضافة مورد جديد" : "Add New Supplier"}
                </span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {isAr ? "بيانات المورد الرسمية، الرقم الضريبي لـ ZATCA والحد الائتماني" : "Supplier official details & tax information"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={saveMutation.isPending}
            >
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              type="button"
              disabled={saveMutation.isPending}
              onClick={form.handleSubmit((d) => saveMutation.mutate(d))}
              className="bg-slate-900 hover:bg-slate-800 text-white min-h-[40px] px-6"
            >
              {saveMutation.isPending && <Loader2 className="w-4 h-4 me-2 animate-spin" />}
              {saveMutation.isPending
                ? isAr ? "جاري الحفظ..." : "Saving..."
                : editingSupplier
                ? isAr ? "تحديث المورد" : "Update Supplier"
                : isAr ? "حفظ المورد" : "Save Supplier"}
            </Button>
          </div>
        </div>

        {/* Form Card */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Building2 className="h-4 w-4 text-sky-600" />
              <span>{isAr ? "بيانات المورد والاتصال" : "Supplier Information"}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={form.handleSubmit((d) => saveMutation.mutate(d))} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name_ar">{isAr ? "اسم المورد بالعربية *" : "Arabic Name *"}</Label>
                  <Input id="name_ar" placeholder="شركة سابك للبتروكيماويات" {...form.register("name_ar")} />
                  {form.formState.errors.name_ar && (
                    <p className="text-xs text-rose-600">{form.formState.errors.name_ar.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="name_en">{isAr ? "اسم المورد بالإنجليزية" : "English Name"}</Label>
                  <Input id="name_en" placeholder="SABIC Petrochemicals Co." {...form.register("name_en")} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="tax_number">{isAr ? "الرقم الضريبي (15 رقم)" : "ZATCA Tax Number"}</Label>
                  <Input
                    id="tax_number"
                    placeholder="300000000000003"
                    maxLength={15}
                    className="font-mono"
                    {...form.register("tax_number")}
                  />
                  {form.formState.errors.tax_number && (
                    <p className="text-xs text-rose-600">{form.formState.errors.tax_number.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="contact_phone">{isAr ? "رقم الهاتف / الجوال" : "Contact Phone"}</Label>
                  <Input id="contact_phone" placeholder="0501234567" {...form.register("contact_phone")} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="contact_email">{isAr ? "البريد الإلكتروني" : "Email"}</Label>
                  <Input id="contact_email" placeholder="orders@supplier.com" {...form.register("contact_email")} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="credit_limit">{isAr ? "الحد الائتماني (ر.س)" : "Credit Limit (SAR)"}</Label>
                  <Input
                    id="credit_limit"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0"
                    {...form.register("credit_limit")}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="address">{isAr ? "العنوان أو المدينة" : "Address"}</Label>
                <Input id="address" placeholder="الرياض، المدينة الصناعية الثانية" {...form.register("address")} />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  {isAr ? "إلغاء" : "Cancel"}
                </Button>
                <Button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="bg-slate-900 hover:bg-slate-800 text-white min-h-[40px] px-6"
                >
                  {saveMutation.isPending && <Loader2 className="w-4 h-4 me-2 animate-spin" />}
                  {saveMutation.isPending
                    ? isAr ? "جاري الحفظ..." : "Saving..."
                    : editingSupplier
                    ? isAr ? "تحديث المورد" : "Update Supplier"
                    : isAr ? "حفظ المورد" : "Save Supplier"}
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
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {isAr ? "دليل الموردين وشركاء التوريد" : "Suppliers Directory"}
          </h1>
          <p className="text-sm text-slate-500">
            {isAr
              ? "إدارة موردي المواد الخام، العبوات، والخدمات مع ربط الأرقام الضريبية والحدود الائتمانية"
              : "Manage suppliers of chemicals, packaging, and logistics with ZATCA tax numbers and credit limits"}
          </p>
        </div>
        <Button onClick={openCreateDialog} className="bg-slate-900 hover:bg-slate-800 text-white gap-2">
          <Plus className="w-4 h-4" />
          <span>{isAr ? "إضافة مورد جديد" : "Add Supplier"}</span>
        </Button>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder={isAr ? "بحث بالاسم، الرقم الضريبي، أو الهاتف..." : "Search by name, VAT or phone..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ps-9"
            />
          </div>
          <div className="text-xs text-slate-500 font-medium">
            {isAr ? `إجمالي الموردين: ${suppliers.length}` : `Total: ${suppliers.length}`}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            {isAr ? "الموردين المسجلين" : "Registered Suppliers"}
          </CardTitle>
          <CardDescription>
            {isAr ? "كشف حسابات الموردين وذمم الشراء (2101)" : "Accounts Payable & Supplier Directory (2101)"}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-semibold">{isAr ? "اسم المورد" : "Supplier Name"}</TableHead>
                  <TableHead className="w-44 font-semibold">{isAr ? "الرقم الضريبي (ZATCA)" : "VAT Number"}</TableHead>
                  <TableHead className="w-36 font-semibold">{isAr ? "رقم الاتصال" : "Contact Phone"}</TableHead>
                  <TableHead className="w-36 text-end font-semibold">{isAr ? "الحد الائتماني" : "Credit Limit"}</TableHead>
                  <TableHead className="w-36 text-end font-semibold">{isAr ? "الرصيد المستحق (ر.س)" : "Balance (SAR)"}</TableHead>
                  <TableHead className="w-24 text-center font-semibold">{isAr ? "الحالة" : "Status"}</TableHead>
                  <TableHead className="w-20 text-center font-semibold">{isAr ? "إجراء" : "Action"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24 ms-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24 ms-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-12 mx-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredSuppliers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-slate-500">
                      {isAr ? "لا يوجد موردين مطابقين للبحث" : "No suppliers found"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSuppliers.map((s) => (
                    <TableRow key={s.id} className="hover:bg-slate-50/80">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                          <div>
                            <span className="font-medium text-slate-900 block">{s.name_ar}</span>
                            {s.name_en && <span className="text-xs text-slate-400 block">{s.name_en}</span>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm tabular-nums text-slate-700">
                        {s.tax_number ? (
                          <span className="flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-slate-400" />
                            <span>{s.tax_number}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">{isAr ? "غير محدد" : "N/A"}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm font-mono tabular-nums">
                        {s.contact_phone ? (
                          <span className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-slate-400" />
                            <span>{s.contact_phone}</span>
                          </span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="text-end font-mono tabular-nums text-slate-700">
                        {s.credit_limit > 0 ? `${s.credit_limit.toLocaleString("en-US")} ر.س` : "-"}
                      </TableCell>
                      <TableCell className="text-end font-mono font-semibold tabular-nums text-slate-900">
                        {s.current_balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className="bg-emerald-600 text-white text-xs">
                          {isAr ? "نشط" : "Active"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button variant="ghost" size="sm" onClick={() => openEditDialog(s)} className="text-xs">
                          {isAr ? "تعديل" : "Edit"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
