import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import {
  Receipt,
  Plus,
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRightLeft,
  Filter,
  Truck,
  Building,
  User,
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
import { VoucherPrint } from "@/components/accounting/VoucherPrint";
import type { Voucher, Account, Vehicle, Customer, Supplier, FactorySettings } from "@/types/database";

export function VouchersPage() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const isArabic = i18n.language === "ar";

  const [activeTab, setActiveTab] = useState<"all" | "receipt" | "payment" | "transfer">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Form State for new voucher
  const [voucherType, setVoucherType] = useState<"receipt" | "payment" | "transfer">("receipt");
  const [voucherDate, setVoucherDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [accountId, setAccountId] = useState<string>("");
  const [contraAccountId, setContraAccountId] = useState<string>("");
  const [amount, setAmount] = useState<number>(0);
  const [taxRate, setTaxRate] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank_transfer" | "check" | "pos" | "advance">("cash");
  const [referenceType, setReferenceType] = useState<string>("manual");
  const [customerId, setCustomerId] = useState<string>("");
  const [supplierId, setSupplierId] = useState<string>("");
  const [vehicleId, setVehicleId] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [checkNumber, setCheckNumber] = useState<string>("");
  const [checkBank, setCheckBank] = useState<string>("");
  const [checkDueDate, setCheckDueDate] = useState<string>(new Date().toISOString().split("T")[0]);

  // Fetch Factory Settings
  const { data: settings } = useQuery<FactorySettings | null>({
    queryKey: ["factory_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("factory_settings").select("*").single();
      if (error) return null;
      return data as FactorySettings;
    },
  });

  // Fetch Accounts
  const { data: accounts } = useQuery<Account[]>({
    queryKey: ["voucher_accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .neq("type", "header")
        .eq("is_active", true)
        .order("code", { ascending: true });
      if (error) throw error;
      return (data || []) as Account[];
    },
  });

  // Cash & Bank Accounts (Asset)
  const treasuryAccounts = accounts?.filter((a) =>
    ["1101", "1102", "1103", "1104", "1105"].includes(a.code)
  );

  // Fetch Vehicles
  const { data: vehicles } = useQuery<Vehicle[]>({
    queryKey: ["vehicles_list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicles").select("*").eq("is_active", true);
      if (error) throw error;
      return (data || []) as Vehicle[];
    },
  });

  // Fetch Customers
  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["customers_dropdown"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").eq("is_active", true);
      if (error) throw error;
      return (data || []) as Customer[];
    },
  });

  // Fetch Suppliers
  const { data: suppliers } = useQuery<Supplier[]>({
    queryKey: ["suppliers_dropdown"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").eq("is_active", true);
      if (error) throw error;
      return (data || []) as Supplier[];
    },
  });

  // Fetch Vouchers
  const { data: vouchers, isLoading } = useQuery<Voucher[]>({
    queryKey: ["vouchers_list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vouchers")
        .select(`
          *,
          account:accounts!account_id(code, name_ar, name_en),
          contra_account:accounts!contra_account_id(code, name_ar, name_en),
          customer:customers(name_ar, code),
          supplier:suppliers(name_ar, contact_phone),
          vehicle:vehicles(name, plate_number)
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Voucher[];
    },
  });

  // Post Voucher Mutation
  const postMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("rpc_post_voucher", {
        p_voucher_type: voucherType,
        p_voucher_date: voucherDate,
        p_account_id: accountId,
        p_contra_account_id: contraAccountId,
        p_amount: Number(amount),
        p_tax_rate: Number(taxRate),
        p_payment_method: paymentMethod,
        p_reference_type: referenceType,
        p_reference_id: null,
        p_customer_id: customerId || null,
        p_supplier_id: supplierId || null,
        p_vehicle_id: vehicleId || null,
        p_sales_rep_id: null,
        p_description: description,
        p_check_number: paymentMethod === "check" ? checkNumber : null,
        p_check_bank: paymentMethod === "check" ? checkBank : null,
        p_check_due_date: paymentMethod === "check" ? checkDueDate : null,
        p_created_by: user?.id,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(isArabic ? "تم إصدار وترحيل السند بنجاح" : "Voucher posted successfully");
      queryClient.invalidateQueries({ queryKey: ["vouchers_list"] });
      queryClient.invalidateQueries({ queryKey: ["journal_entries_list"] });
      queryClient.invalidateQueries({ queryKey: ["checks_list"] });
      setCreateModalOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      toast.error(err.message || (isArabic ? "فشل إصدار السند" : "Failed to post voucher"));
    },
  });

  const resetForm = () => {
    setAmount(0);
    setTaxRate(0);
    setDescription("");
    setCheckNumber("");
    setCheckBank("");
    setCustomerId("");
    setSupplierId("");
    setVehicleId("");
  };

  const calculatedVat = Number(taxRate) > 0 ? (Number(amount) * Number(taxRate)) / 100 : 0;
  const calculatedTotal = Number(amount) + calculatedVat;

  const filteredVouchers = vouchers?.filter((v) => {
    const matchesTab = activeTab === "all" || v.voucher_type === activeTab;
    const matchesSearch =
      v.voucher_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.customer?.name_ar && v.customer.name_ar.includes(searchTerm)) ||
      (v.supplier?.name_ar && v.supplier.name_ar.includes(searchTerm));
    return matchesTab && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Receipt className="h-6 w-6 text-industrial-accent" />
            {isArabic ? "سندات القبض والصرف والتحويل" : "Receipt & Payment Vouchers"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isArabic
              ? "إدارة المقبوضات والمدفوعات، مصاريف أسطول التوزيع، شيكات التحصيل، وترحيل القيود المزدوجة آلياً"
              : "Manage receipt, payment, and transfer vouchers with automated double-entry postings"}
          </p>
        </div>

        <Button
          onClick={() => {
            resetForm();
            setCreateModalOpen(true);
          }}
          className="gap-2 bg-slate-900 text-white hover:bg-slate-800 shadow-sm font-semibold"
        >
          <Plus className="h-4 w-4" />
          <span>{isArabic ? "إصدار سند جديد" : "New Voucher"}</span>
        </Button>
      </div>

      {/* Tabs & Search */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg border border-industrial-border w-full md:w-auto">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
              activeTab === "all" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {isArabic ? "جميع السندات" : "All"}
          </button>
          <button
            onClick={() => setActiveTab("receipt")}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === "receipt" ? "bg-emerald-700 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <ArrowDownLeft className="h-3.5 w-3.5" />
            <span>{isArabic ? "سندات قبض (RV)" : "Receipts"}</span>
          </button>
          <button
            onClick={() => setActiveTab("payment")}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === "payment" ? "bg-rose-700 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
            <span>{isArabic ? "سندات صرف (PV)" : "Payments"}</span>
          </button>
          <button
            onClick={() => setActiveTab("transfer")}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === "transfer" ? "bg-indigo-700 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
            <span>{isArabic ? "تحويلات داخلية (TV)" : "Transfers"}</span>
          </button>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={isArabic ? "بحث برقم السند أو الجهة..." : "Search voucher # or party..."}
            className="ps-9 bg-slate-50 border-industrial-border text-xs"
          />
        </div>
      </div>

      {/* Vouchers Table */}
      <Card className="border-industrial-border bg-white shadow-sm overflow-hidden">
        <CardHeader className="py-3 px-4 border-b border-industrial-border bg-slate-50">
          <CardTitle className="text-sm font-bold text-slate-800 flex items-center justify-between">
            <span>{isArabic ? "سجل السندات المالية الصادرة" : "Issued Vouchers Register"}</span>
            <span className="text-xs font-normal text-slate-500 font-mono">
              {filteredVouchers?.length || 0} {isArabic ? "سند" : "vouchers"}
            </span>
          </CardTitle>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start border-collapse">
              <thead>
                <tr className="border-b border-industrial-border bg-slate-100/75 text-slate-700 font-semibold">
                  <th className="py-2.5 px-3 text-start">رقم السند</th>
                  <th className="py-2.5 px-3 text-start">النوع</th>
                  <th className="py-2.5 px-3 text-start">التاريخ</th>
                  <th className="py-2.5 px-3 text-start">الحساب / الخزينة</th>
                  <th className="py-2.5 px-3 text-start">الطرف المقابل / المستفيد</th>
                  <th className="py-2.5 px-3 text-start">طريقة الدفع</th>
                  <th className="py-2.5 px-3 text-end">المبلغ الإجمالي</th>
                  <th className="py-2.5 px-3 text-center">الطباعة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-industrial-border">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={8} className="p-3">
                        <Skeleton className="h-6 w-full" />
                      </td>
                    </tr>
                  ))
                ) : filteredVouchers?.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      {isArabic ? "لا توجد سندات مالية مطابقة" : "No vouchers found"}
                    </td>
                  </tr>
                ) : (
                  filteredVouchers?.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                        {v.voucher_number}
                      </td>
                      <td className="py-2.5 px-3">
                        {v.voucher_type === "receipt" ? (
                          <Badge variant="emerald" className="text-[10px]">
                            سند قبض
                          </Badge>
                        ) : v.voucher_type === "payment" ? (
                          <Badge variant="rose" className="text-[10px]">
                            سند صرف
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">
                            تحويل
                          </Badge>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {v.voucher_date}
                      </td>
                      <td className="py-2.5 px-3 text-slate-800 font-medium">
                        {v.account?.name_ar}
                      </td>
                      <td className="py-2.5 px-3 text-slate-800">
                        {v.customer?.name_ar || v.supplier?.name_ar || v.contra_account?.name_ar}
                        {v.vehicle && (
                          <span className="block text-[10px] text-slate-400 font-mono">
                            سيارة: {v.vehicle.plate_number}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {v.payment_method}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono tabular-nums font-bold text-slate-900">
                        {v.total_amount.toFixed(2)} ر.س
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <VoucherPrint voucher={v} settings={settings || null} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create Voucher Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Plus className="h-5 w-5 text-industrial-accent" />
              <span>إصدار سند مالي وترحيل القيد آلياً</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Voucher Type Selector */}
            <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setVoucherType("receipt")}
                className={`py-2 text-xs font-bold rounded-md transition-all ${
                  voucherType === "receipt" ? "bg-emerald-700 text-white shadow-sm" : "text-slate-600"
                }`}
              >
                سند قبض (RV)
              </button>
              <button
                type="button"
                onClick={() => setVoucherType("payment")}
                className={`py-2 text-xs font-bold rounded-md transition-all ${
                  voucherType === "payment" ? "bg-rose-700 text-white shadow-sm" : "text-slate-600"
                }`}
              >
                سند صرف (PV)
              </button>
              <button
                type="button"
                onClick={() => setVoucherType("transfer")}
                className={`py-2 text-xs font-bold rounded-md transition-all ${
                  voucherType === "transfer" ? "bg-indigo-700 text-white shadow-sm" : "text-slate-600"
                }`}
              >
                تحويل داخلي (TV)
              </button>
            </div>

            {/* Date & Payment Method */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  تاريخ السند *
                </label>
                <Input
                  type="date"
                  value={voucherDate}
                  onChange={(e) => setVoucherDate(e.target.value)}
                  className="bg-slate-50 border-industrial-border text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  طريقة السداد / القبض *
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full h-9 px-3 rounded-md border border-industrial-border bg-slate-50 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="cash">نقداً (Cash)</option>
                  <option value="bank_transfer">تحويل بنكي (Bank Transfer)</option>
                  <option value="check">شيك مصرفي (Check)</option>
                  <option value="pos">مدى / شبكة (POS)</option>
                  <option value="advance">خصم من دفعة مقدمة (Advance)</option>
                </select>
              </div>
            </div>

            {/* Check Details if Method is Check */}
            {paymentMethod === "check" && (
              <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div>
                  <label className="font-bold text-amber-900 block mb-1">رقم الشيك *</label>
                  <Input
                    value={checkNumber}
                    onChange={(e) => setCheckNumber(e.target.value)}
                    placeholder="مثال: 987654"
                    className="h-8 bg-white border-amber-300 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-amber-900 block mb-1">البنك المسحوب عليه *</label>
                  <Input
                    value={checkBank}
                    onChange={(e) => setCheckBank(e.target.value)}
                    placeholder="مثال: مصرف الراجحي"
                    className="h-8 bg-white border-amber-300 text-xs"
                  />
                </div>
                <div>
                  <label className="font-bold text-amber-900 block mb-1">تاريخ استحقاق الشيك *</label>
                  <Input
                    type="date"
                    value={checkDueDate}
                    onChange={(e) => setCheckDueDate(e.target.value)}
                    className="h-8 bg-white border-amber-300 text-xs font-mono"
                  />
                </div>
              </div>
            )}

            {/* Treasury/Bank Account & Contra Account */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  {voucherType === "receipt" ? "حساب الإيداع / الخزينة *" : "حساب الصرف / البنك *"}
                </label>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-industrial-border bg-slate-50 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="">اختر حساب الخزينة أو البنك...</option>
                  {treasuryAccounts?.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.code} - {acc.name_ar}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  الحساب المقابل (العميل / المورد / المصروف) *
                </label>
                <select
                  value={contraAccountId}
                  onChange={(e) => setContraAccountId(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-industrial-border bg-slate-50 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="">اختر الحساب المقابل...</option>
                  {accounts?.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.code} - {acc.name_ar} ({acc.type})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Linked Entity: Customer or Supplier or Vehicle */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {voucherType === "receipt" ? (
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    العميل المرتبط (اختياري لربط الذمة)
                  </label>
                  <select
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className="w-full h-9 px-3 rounded-md border border-industrial-border bg-slate-50 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    <option value="">اختر العميل إن وجد...</option>
                    {customers?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name_ar} ({c.code})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    المورد المرتبط (اختياري لربط الذمة)
                  </label>
                  <select
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    className="w-full h-9 px-3 rounded-md border border-industrial-border bg-slate-50 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    <option value="">اختر المورد إن وجد...</option>
                    {suppliers?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name_ar} ({s.contact_phone || s.tax_number || ""})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Delivery Vehicle linkage for 6109 expense */}
              {voucherType === "payment" && (
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1 flex items-center gap-1.5">
                    <Truck className="h-3.5 w-3.5 text-slate-500" />
                    <span>سيارة التوزيع (لمصاريف البنزين والصيانة 6109)</span>
                  </label>
                  <select
                    value={vehicleId}
                    onChange={(e) => setVehicleId(e.target.value)}
                    className="w-full h-9 px-3 rounded-md border border-industrial-border bg-slate-50 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    <option value="">غير مرتبطة بسيارة محددة</option>
                    {vehicles?.map((veh) => (
                      <option key={veh.id} value={veh.id}>
                        {veh.name} - {veh.plate_number}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Financial Amounts & VAT */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  المبلغ قبل الضريبة (SAR) *
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount || ""}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  placeholder="0.00"
                  className="font-mono text-sm font-bold text-slate-900 bg-white"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  نسبة الضريبة (VAT)
                </label>
                <select
                  value={taxRate}
                  onChange={(e) => setTaxRate(Number(e.target.value))}
                  disabled={voucherType === "transfer"}
                  className="w-full h-9 px-3 rounded-md border border-industrial-border bg-white text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value={0}>0% (معفاة / بدون ضريبة)</option>
                  <option value={15}>15% (ضريبة القيمة المضافة)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  المبلغ الإجمالي الشامل
                </label>
                <div className="h-9 px-3 flex items-center bg-slate-200/70 border border-slate-300 rounded-md font-mono font-bold text-slate-900 text-sm">
                  {calculatedTotal.toFixed(2)} ر.س
                </div>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                البيان والشرح التفصيلي *
              </label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="مثال: سداد دفعة من فاتورة مبيعات رقم INV-2024-0012 / بنزين سيارة دينا..."
                className="bg-slate-50 border-industrial-border text-xs"
              />
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
              onClick={() => postMutation.mutate()}
              disabled={
                !accountId ||
                !contraAccountId ||
                amount <= 0 ||
                !description.trim() ||
                postMutation.isPending
              }
              className="gap-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold"
            >
              {postMutation.isPending ? "جاري الإصدار..." : "إصدار وترحيل السند"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
