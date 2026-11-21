import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import type { Customer, UserProfile, FactorySettings } from "@/types/database";
import { CommercialGuaranteePrint } from "@/components/sales/CommercialGuaranteePrint";
import { BalanceConfirmationPrint } from "@/components/sales/BalanceConfirmationPrint";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  Users,
  Plus,
  Search,
  Building,
  CreditCard,
  Phone,
  Calendar,
  FileCheck,
  ShieldCheck,
} from "lucide-react";

export function CustomersPage() {
  const { t, i18n } = useTranslation();
  const { isOwner, isAccountant } = useAuth();
  const queryClient = useQueryClient();
  const isArabic = i18n.language === "ar";

  const [searchTerm, setSearchTerm] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Form State
  const [code, setCode] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [crNumber, setCrNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [nationalAddress, setNationalAddress] = useState("");
  const [creditLimit, setCreditLimit] = useState<number>(50000);
  const [paymentDays, setPaymentDays] = useState<number>(30);
  const [assignedRepId, setAssignedRepId] = useState("");
  const [guaranteeText, setGuaranteeText] = useState("");

  // 1. Fetch Customers
  const { data: customers, isLoading } = useQuery<Customer[]>({
    queryKey: ["customers-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select(`
          *,
          assigned_rep:users_profile!customers_assigned_rep_id_fkey(id, full_name, phone)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as Customer[];
    },
  });

  // 2. Fetch Sales Reps for assignment
  const { data: reps } = useQuery<UserProfile[]>({
    queryKey: ["sales-reps-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users_profile")
        .select("*")
        .eq("role", "sales_rep")
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data || [];
    },
    enabled: createModalOpen,
  });

  // 3. Fetch Factory Settings for printouts
  const { data: settings } = useQuery<FactorySettings | null>({
    queryKey: ["factory-settings-print"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("factory_settings")
        .select("*")
        .eq("id", 1)
        .single();
      if (error) return null;
      return data as FactorySettings;
    },
  });

  // Create Mutation
  const createCustomerMutation = useMutation({
    mutationFn: async () => {
      if (!code || !nameAr || !phone) {
        throw new Error(isArabic ? "يرجى تعبئة الحقول الإلزامية المطلوبة" : "Please fill required fields");
      }

      const { data, error } = await supabase
        .from("customers")
        .insert({
          code,
          name_ar: nameAr,
          name_en: nameEn || nameAr,
          vat_number: vatNumber || null,
          cr_number: crNumber || null,
          phone,
          national_address: nationalAddress || null,
          credit_limit: creditLimit,
          default_payment_days: paymentDays,
          assigned_rep_id: assignedRepId || null,
          guarantee_text: guaranteeText || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(isArabic ? "تم حفظ بيانات العميل بنجاح" : "Customer created successfully");
      queryClient.invalidateQueries({ queryKey: ["customers-list"] });
      setCreateModalOpen(false);
      // Reset form
      setCode("");
      setNameAr("");
      setNameEn("");
      setVatNumber("");
      setCrNumber("");
      setPhone("");
      setNationalAddress("");
      setGuaranteeText("");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    },
  });

  const filteredCustomers = customers?.filter((c) => {
    const term = searchTerm.toLowerCase();
    return (
      c.code.toLowerCase().includes(term) ||
      c.name_ar.toLowerCase().includes(term) ||
      c.name_en.toLowerCase().includes(term) ||
      c.phone.includes(term)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Building className="h-6 w-6 text-sky-600" />
            <span>{t("sales.customersTitle")}</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            {t("sales.customersSubtitle")}
          </p>
        </div>

        {(isOwner || isAccountant) && (
          <Button
            onClick={() => setCreateModalOpen(true)}
            className="bg-slate-900 hover:bg-slate-800 text-white min-h-[44px]"
          >
            <Plus className="me-2 h-4 w-4" />
            <span>{t("sales.createCustomer")}</span>
          </Button>
        )}
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder={isArabic ? "بحث بكود، اسم العميل، أو الجوال..." : "Search by code, name, phone..."}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="ps-9 bg-white"
        />
      </div>

      {/* Grid of Customers */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      ) : filteredCustomers?.length === 0 ? (
        <Card className="text-center py-12 border-dashed">
          <Building className="h-12 w-12 mx-auto text-slate-300 mb-3" />
          <h3 className="font-semibold text-slate-700">لا يوجد عملاء مسجلون</h3>
          <p className="text-xs text-slate-500 mt-1">
            أضف عملاء جدد لتحديد الحدود الائتمانية وربطهم بمناديب المبيعات
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCustomers?.map((customer) => (
            <Card
              key={customer.id}
              className="border-industrial-border bg-white shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono text-xs font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-100">
                      {customer.code}
                    </span>
                    <CardTitle className="text-base font-bold mt-2 text-slate-900">
                      {isArabic ? customer.name_ar : customer.name_en}
                    </CardTitle>
                    <CardDescription className="text-xs line-clamp-1 mt-0.5">
                      {isArabic ? customer.name_en : customer.name_ar}
                    </CardDescription>
                  </div>
                  <Badge variant={customer.is_active ? "emerald" : "outline"} className="text-[10px]">
                    {customer.is_active ? t("common.active") : t("common.inactive")}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-3 pt-0 text-xs">
                <div className="space-y-1.5 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <CreditCard className="h-3.5 w-3.5 text-slate-400" />
                      {t("sales.creditLimit")}:
                    </span>
                    <span className="font-mono font-bold tabular-nums text-slate-900">
                      {customer.credit_limit.toLocaleString()} ر.س
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      {t("sales.paymentDays")}:
                    </span>
                    <span className="font-mono font-bold tabular-nums text-slate-800">
                      {customer.default_payment_days} يوم
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-slate-400" />
                      {t("common.phone")}:
                    </span>
                    <span className="font-mono tabular-nums text-slate-700">
                      {customer.phone}
                    </span>
                  </div>

                  {customer.assigned_rep && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-slate-400" />
                        {t("sales.assignedRep")}:
                      </span>
                      <span className="font-semibold text-slate-800">
                        {customer.assigned_rep.full_name}
                      </span>
                    </div>
                  )}
                </div>

                {customer.vat_number && (
                  <div className="text-[11px] text-slate-500 font-mono">
                    الرقم الضريبي: <span className="font-bold text-slate-700">{customer.vat_number}</span>
                  </div>
                )}

                {/* Printout Actions */}
                <div className="pt-2 flex items-center gap-2 border-t border-slate-100">
                  <CommercialGuaranteePrint customer={customer} settings={settings || null} />
                  <BalanceConfirmationPrint customer={customer} currentBalance={0} settings={settings || null} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Customer Dialog */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Building className="h-5 w-5 text-sky-600" />
              <span>{t("sales.createCustomer")}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              أدخل بيانات العميل الرسمية، الرقم الضريبي، الحد الائتماني وشروط الضمان
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-2 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-semibold">{t("sales.customerCode")} *</Label>
                <Input
                  placeholder="مثال: CUST-0003"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="mt-1 font-mono uppercase"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">{t("sales.customerNameAr")} *</Label>
                <Input
                  placeholder="شركة أسواق..."
                  value={nameAr}
                  onChange={(e) => setNameAr(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">{t("sales.customerNameEn")}</Label>
                <Input
                  placeholder="Market Co."
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-semibold">الرقم الضريبي (15 رقم)</Label>
                <Input
                  placeholder="3000XXXXXXXX003"
                  value={vatNumber}
                  onChange={(e) => setVatNumber(e.target.value)}
                  maxLength={15}
                  className="mt-1 font-mono"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">رقم السجل التجاري</Label>
                <Input
                  placeholder="1010XXXXXX"
                  value={crNumber}
                  onChange={(e) => setCrNumber(e.target.value)}
                  className="mt-1 font-mono"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">{t("common.phone")} *</Label>
                <Input
                  placeholder="05XXXXXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-semibold">{t("sales.creditLimit")} *</Label>
                <Input
                  type="number"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(Number(e.target.value))}
                  className="mt-1 font-mono tabular-nums"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">{t("sales.paymentDays")} *</Label>
                <Input
                  type="number"
                  value={paymentDays}
                  onChange={(e) => setPaymentDays(Number(e.target.value))}
                  className="mt-1 font-mono tabular-nums"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">{t("sales.assignedRep")}</Label>
                <Select value={assignedRepId} onValueChange={setAssignedRepId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="اختر مندوب المبيعات..." />
                  </SelectTrigger>
                  <SelectContent>
                    {reps?.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.full_name} ({r.phone})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold">العنوان الوطني والفرع</Label>
              <Input
                placeholder="المدينة، الحي، الشارع..."
                value={nationalAddress}
                onChange={(e) => setNationalAddress(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold">{t("sales.guaranteeText")}</Label>
              <Input
                placeholder="نص الضمان التجاري المخصص الذي يطبع في شهادة الضمان A4..."
                value={guaranteeText}
                onChange={(e) => setGuaranteeText(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={createCustomerMutation.isPending}
              onClick={() => createCustomerMutation.mutate()}
              className="bg-slate-900 hover:bg-slate-800 text-white min-h-[44px]"
            >
              {createCustomerMutation.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
