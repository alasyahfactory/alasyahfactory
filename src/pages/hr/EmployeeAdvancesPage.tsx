import { printDocumentHtml, saveDocumentPdfFromHtml, shareDocumentWhatsApp } from "@/utils/printAndPdf";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import {
  Banknote,
  Calculator,
  ArrowRight,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  Calendar,
  AlertCircle,
  Eye,
  Printer,
  FileDown,
  Share2,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import type { EmployeeAdvance, Employee, Account } from "@/types/database";

export function EmployeeAdvancesPage() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const isArabic = i18n.language === "ar";

  const [searchTerm, setSearchTerm] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedAdvance, setSelectedAdvance] = useState<EmployeeAdvance | null>(null);

  // Form State
  const [employeeId, setEmployeeId] = useState("");
  const [advanceDate, setAdvanceDate] = useState(new Date().toISOString().split("T")[0]);
  const [amount, setAmount] = useState<number>(0);
  const [installmentMonths, setInstallmentMonths] = useState<number>(1);
  const [paymentAccount, setPaymentAccount] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // Fetch Treasury Accounts for Cash Out
  const { data: treasuryAccounts } = useQuery<Account[]>({
    queryKey: ["treasury_accounts_advances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .in("code", ["1101", "1102"])
        .eq("is_active", true);
      if (error) throw error;
      return (data || []) as Account[];
    },
  });

  // Fetch Active Employees
  const { data: employees } = useQuery<Employee[]>({
    queryKey: ["active_employees_advances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .eq("is_active", true)
        .order("name_ar", { ascending: true });
      if (error) throw error;
      return (data || []) as Employee[];
    },
  });

  // Fetch Advances List
  const { data: advances, isLoading } = useQuery<EmployeeAdvance[]>({
    queryKey: ["employee_advances_list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_advances")
        .select(`
          *,
          employee:employees(*)
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as EmployeeAdvance[];
    },
  });

  // Create Advance Mutation with balanced JV (Dr: 1120 / Cr: Treasury Account)
  const createMutation = useMutation({
    mutationFn: async () => {
      const seq = Math.floor(Math.random() * 9000) + 1000;
      const advNum = `ADV-${new Date().getFullYear()}-${seq}`;
      const monthlyDeduction = Number((amount / installmentMonths).toFixed(2));

      // 1. Get Employee Advances Account (1120 or 1150)
      const { data: advAcc } = await supabase
        .from("accounts")
        .select("id")
        .in("code", ["1120", "1150"])
        .limit(1)
        .single();

      if (!advAcc) throw new Error("حساب سلف الموظفين (1120) غير موجود");

      // 2. Insert Journal Entry (Dr: 1120, Cr: Treasury Account)
      const { data: jvData, error: jvError } = await supabase.rpc(
        "rpc_create_manual_journal_entry",
        {
          p_entry_date: advanceDate,
          p_description: `صرف سلفة موظف: ${advNum}`,
          p_lines: [
            {
              account_id: advAcc.id,
              debit: Number(amount),
              credit: 0,
              description: `سلفة موظف رقم ${advNum}`,
            },
            {
              account_id: paymentAccount,
              debit: 0,
              credit: Number(amount),
              description: `صرف سلفة نقداً / بنك`,
            },
          ],
          p_created_by: user?.id,
        }
      );

      if (jvError) throw jvError;

      // 3. Insert Employee Advance Record
      const { data, error } = await supabase.from("employee_advances").insert({
        advance_number: advNum,
        employee_id: employeeId,
        advance_date: advanceDate,
        amount: Number(amount),
        installment_months: installmentMonths,
        monthly_deduction: monthlyDeduction,
        recovered_amount: 0,
        remaining_balance: Number(amount),
        journal_entry_id: jvData?.journal_entry_id || null,
        notes: notes || null,
        status: "active",
        created_by: user?.id,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(isArabic ? "تم صرف وترحيل السلفة بنجاح" : "Advance issued successfully");
      queryClient.invalidateQueries({ queryKey: ["employee_advances_list"] });
      queryClient.invalidateQueries({ queryKey: ["journal_entries_list"] });
      setCreateModalOpen(false);
      setAmount(0);
      setNotes("");
    },
    onError: (err: any) => {
      toast.error(err.message || (isArabic ? "فشل تسجيل السلفة" : "Failed to issue advance"));
    },
  });

  const monthlyDeductionCalc = amount > 0 && installmentMonths > 0 ? (amount / installmentMonths).toFixed(2) : "0.00";

  
  const getAdvanceHtml = (adv: EmployeeAdvance) => {
    const docTitle = `طلب وسند سلفة موظف - ${adv.id.slice(0, 8)}`;
    return `
      <!DOCTYPE html>
      <html dir="${isArabic ? "rtl" : "ltr"}" lang="${isArabic ? "ar" : "en"}">
        <head>
          <meta charset="utf-8" />
          <title>${docTitle}</title>
          <style>
            @page { size: A4 portrait; margin: 15mm; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "IBM Plex Sans Arabic", sans-serif; color: #0f172a; background: #fff; margin: 0; padding: 0; font-size: 13px; line-height: 1.6; }
            .header-grid { display: grid; grid-template-columns: 1fr auto 1fr; gap: 16px; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; }
            .badge-title { display: inline-block; padding: 4px 14px; background: #0f172a; color: #fff; font-weight: bold; font-size: 16px; border-radius: 4px; }
            .meta-card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px; background: #f8fafc; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 12.5px; }
            .amount-box { border: 2px solid #0f172a; background: #f1f5f9; padding: 16px; border-radius: 6px; text-align: center; margin-bottom: 20px; }
            .tabular { font-family: monospace; font-variant-numeric: tabular-nums; }
            .statement { background: #fff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 16px; margin-bottom: 30px; font-size: 13px; line-height: 1.8; text-align: justify; }
            .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-top: 40px; text-align: center; }
            .sig-box { border-top: 1px dashed #94a3b8; padding-top: 8px; font-size: 11px; }
          </style>
        </head>
        <body>
          <div class="header-grid">
            <div style="text-align: ${isArabic ? "right" : "left"};">
              <div style="font-weight: bold; font-size: 15px;">مصنع الأسياح للمنتجات الكيميائية</div>
              <div style="font-size: 11px; color: #64748b;">سجل تجاري: 1010000000 | الرقم الضريبي: 300000000000003</div>
              <div style="font-size: 11px; color: #64748b;">إدارة الموارد البشرية وشؤون الموظفين</div>
            </div>
            <div style="text-align: center;">
              <div class="badge-title">سند وإقرار صرف سلفة موظف</div>
              <div style="font-size: 13px; font-family: monospace; font-weight: bold; margin-top: 4px;">${adv.advance_number}</div>
            </div>
            <div style="text-align: ${isArabic ? "left" : "right"}; direction: ltr;">
              <div style="font-weight: bold; font-size: 14px;">Al-Asyah Chemical Factory</div>
              <div style="font-size: 11px; color: #64748b;">Employee Advance Voucher</div>
              <div style="font-size: 11px; color: #64748b;">Date: ${adv.advance_date}</div>
            </div>
          </div>

          <div class="amount-box">
            <span style="font-size: 12px; color: #64748b; font-weight: bold;">مبلغ السلفة المعتمد والمصروف:</span>
            <div style="font-size: 24px; font-weight: bold; margin-top: 4px;">
              <span class="tabular">${adv.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span> ريال سعودي
            </div>
          </div>

          <div class="meta-card">
            <div>
              <span style="color: #64748b; display: block;">اسم الموظف المستفيد:</span>
              <strong style="font-size: 14px;">${adv.employee?.name_ar || "-"}</strong>
              <div style="font-size: 11px; color: #64748b; margin-top: 2px;">الرقم الوظيفي: <span class="tabular">${adv.employee?.emp_code || "-"}</span> | القسم: ${adv.employee?.department || "-"}</div>
            </div>
            <div>
              <span style="color: #64748b; display: block;">تاريخ الصرف:</span>
              <strong class="tabular" style="font-size: 13px;">${adv.advance_date}</strong>
              <div style="font-size: 11px; color: #64748b; margin-top: 2px;">الآيبان البنكي: <span class="tabular">${adv.employee?.iban || "محول نقداً"}</span></div>
            </div>
            <div>
              <span style="color: #64748b; display: block;">خطة السداد والاستقطاع:</span>
              <strong>${adv.installment_months} أشهر (القسط الشهري: <span class="tabular">${adv.monthly_deduction.toFixed(2)} ر.س</span>)</strong>
            </div>
            <div>
              <span style="color: #64748b; display: block;">المتبقي بذمة الموظف:</span>
              <strong class="tabular" style="color: #b91c1c;">${adv.remaining_balance.toFixed(2)} ريال سعودي</strong>
            </div>
          </div>

          <div class="statement">
            <strong>إقرار وتفويض استقطاع:</strong><br />
            أقر أنا الموظف الموقع أدناه بأنني قد استلمت كامل مبلغ السلفة الموضح أعلاه وقدره (${adv.amount.toFixed(2)} ريال سعودي)، وأفوض إدارة المصنع تفويضاً لا رجعة فيه بخصم القسط الشهري البالغ (${adv.monthly_deduction.toFixed(2)} ريال سعودي) من راتبي ومستحقاتي الشهرية بمسير الرواتب حتى سداد كامل مبلغ السلفة، وفي حال انتهاء خدماتي لأي سبب قبل تمام السداد، يُخصم الرصيد المتبقي دفعة واحدة من مستحقات نهاية الخدمة.
          </div>

          <div class="signatures">
            <div class="sig-box">
              <div style="font-weight: bold; margin-bottom: 35px;">الموظف المستفيد (المقر بما فيه)</div>
              <div>التوقيع: ............................</div>
            </div>
            <div class="sig-box">
              <div style="font-weight: bold; margin-bottom: 35px;">إدارة الموارد البشرية</div>
              <div>التوقيع: ............................</div>
            </div>
            <div class="sig-box">
              <div style="font-weight: bold; margin-bottom: 35px;">اعتماد المحاسبة المالية</div>
              <div>الختم والتوقيع: ............................</div>
            </div>
          </div>

          
        </body>
      </html>
    `;
  };

  const handlePrintAdvance = (adv: EmployeeAdvance) => {
    printDocumentHtml(getAdvanceHtml(adv), `سلفة_موظف_${adv.id.slice(0, 8)}`);
  };

  const handleSavePdfAdvance = (adv: EmployeeAdvance) => {
    saveDocumentPdfFromHtml(getAdvanceHtml(adv), `سلفة_موظف_${adv.id.slice(0, 8)}`);
  };

  const handleShareWhatsapp = (adv: EmployeeAdvance) => {
    const empName = adv.employee?.name_ar || "";
    const msg = `*إشعار صرف سلفة موظف (سند مالي)*
الموظف: ${empName}
رقم السلفة: ${adv.advance_number}
تاريخ الصرف: ${adv.advance_date}
مبلغ السلفة: ${adv.amount.toFixed(2)} ريال سعودي
عدد الأقساط: ${adv.installment_months} شهر
القسط الشهري المستقطع بالراتب: ${adv.monthly_deduction.toFixed(2)} ريال سعودي
المتبقي بذمتكم: ${adv.remaining_balance.toFixed(2)} ريال سعودي
_مصنع الأسياح للمنتجات الكيميائية - الموارد البشرية والشؤون المالية_`;

    const encoded = encodeURIComponent(msg);
    const phone = adv.employee?.phone?.replace(/[^0-9]/g, "") || "";
    const waUrl = phone ? `https://api.whatsapp.com/send?phone=${phone}&text=${encoded}` : `https://api.whatsapp.com/send?text=${encoded}`;
    window.open(waUrl, "_blank");
  };

  const filteredAdvances = advances?.filter((adv) => {
    return (
      adv.advance_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      adv.employee?.name_ar.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  // In-Page Canvas View for Advance Creation (Replacing modal popup)
  if (createModalOpen) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto pb-16 animate-in fade-in duration-200">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <Button
              variant="tonal"
              size="sm"
              onClick={() => setCreateModalOpen(false)}
              className="gap-1.5"
            >
              <ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
              <span>{isArabic ? "العودة لسجل السلف" : "Back to Advances"}</span>
            </Button>
            <div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">
                {isArabic ? "صرف سلفة موظف جديدة" : "Issue New Employee Advance"}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                إنشاء السلفة المالية وجدولة الأقساط وترحيل القيد المحاسبي التلقائي (1120 مدين / الخزينة دائن)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setCreateModalOpen(false)}>
              {isArabic ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              disabled={createMutation.isPending || !employeeId || amount <= 0 || !paymentAccount}
              onClick={() => createMutation.mutate()}
              className="bg-slate-900 hover:bg-slate-800 text-white min-h-[40px] px-6 font-semibold"
            >
              {createMutation.isPending ? "جاري الترحيل..." : "تأكيد وصرف السلفة"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-800">بيانات السلفة والموظف</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div>
                  <Label className="text-xs font-semibold">الموظف المستفيد *</Label>
                  <select
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    className="mt-1 w-full h-10 px-3 py-2 text-xs rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    <option value="">-- اختر الموظف --</option>
                    {employees?.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name_ar} ({emp.emp_code} - {emp.department})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold">تاريخ الصرف *</Label>
                    <Input
                      type="date"
                      value={advanceDate}
                      onChange={(e) => setAdvanceDate(e.target.value)}
                      className="mt-1 font-mono text-xs bg-white"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">حساب الخزينة / البنك المصروف منه *</Label>
                    <select
                      value={paymentAccount}
                      onChange={(e) => setPaymentAccount(e.target.value)}
                      className="mt-1 w-full h-10 px-3 py-2 text-xs rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                    >
                      <option value="">-- اختر حساب الصرف --</option>
                      {treasuryAccounts?.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.code} - {acc.name_ar}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold">مبلغ السلفة الإجمالي (ر.س) *</Label>
                    <Input
                      type="number"
                      step="50"
                      min="1"
                      value={amount || ""}
                      onChange={(e) => setAmount(Number(e.target.value))}
                      placeholder="0.00"
                      className="mt-1 font-mono text-center font-bold text-base bg-white"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">عدد أشهر الاستقطاع (الأقساط) *</Label>
                    <Input
                      type="number"
                      min="1"
                      max="36"
                      value={installmentMonths}
                      onChange={(e) => setInstallmentMonths(Math.max(1, Number(e.target.value)))}
                      className="mt-1 font-mono text-center font-bold text-base bg-white"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-semibold">البيان والشرح / سبب السلفة</Label>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="سلفة طارئة، زواج، إيجار..."
                    className="mt-1 text-xs bg-white"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-emerald-600" />
                  <span>جدولة الاستقطاع الشهري</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3 text-xs">
                <div className="flex justify-between items-center text-slate-600">
                  <span>إجمالي السلفة:</span>
                  <span className="font-mono font-bold text-slate-900">{amount.toFixed(2)} ر.س</span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>فترة السداد:</span>
                  <span className="font-mono font-bold text-slate-800">{installmentMonths} أشهر</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm font-bold mt-2">
                  <span className="text-emerald-950">الخصم الشهري بالراتب:</span>
                  <span className="font-mono text-emerald-700 text-base">{monthlyDeductionCalc} ر.س</span>
                </div>
                <div className="pt-2 text-[11px] text-slate-500 leading-relaxed">
                  * سيقوم النظام تلقائياً بخصم هذا القسط شهرياً عند تشغيل مسير الرواتب حتى سداد كامل الرصيد.
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // In-Page Canvas View for Selected Employee Advance Details & Actions
  if (selectedAdvance) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto pb-16 animate-in fade-in duration-200">
        {/* Top Header Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <Button
              variant="tonal"
              size="sm"
              onClick={() => setSelectedAdvance(null)}
              className="gap-1.5"
            >
              <ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
              <span>{isArabic ? "العودة لسجل السلف" : "Back to Advances"}</span>
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-sky-600" />
                <h1 className="text-lg sm:text-xl font-bold font-mono text-slate-900">
                  {selectedAdvance.advance_number}
                </h1>
                <Badge variant={selectedAdvance.status === "settled" ? "emerald" : "amber"} className="text-xs">
                  {selectedAdvance.status === "settled" ? "تم السداد بالكامل" : "جارٍ الاستقطاع"}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                الموظف: {selectedAdvance.employee?.name_ar} • تاريخ الصرف: {selectedAdvance.advance_date}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePrintAdvance(selectedAdvance)}
              className="gap-1.5"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              <span>{isArabic ? "طباعة A4" : "Print A4"}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSavePdfAdvance(selectedAdvance)}
              className="gap-1.5"
            >
              <FileDown className="w-4 h-4 text-sky-600" />
              <span>{isArabic ? "حفظ PDF" : "Save PDF"}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleShareWhatsapp(selectedAdvance)}
              className="gap-1.5 text-emerald-700 hover:text-emerald-800"
            >
              <Share2 className="w-4 h-4 text-emerald-600" />
              <span>{isArabic ? "مشاركة واتساب" : "WhatsApp"}</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedAdvance(null)}>
              {isArabic ? "إغلاق" : "Close"}
            </Button>
          </div>
        </div>

        {/* Details Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-800">بيانات الموظف والسلفة</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-3 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">اسم الموظف:</span>
                <strong className="text-slate-900 text-sm">{selectedAdvance.employee?.name_ar}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">الرقم الوظيفي:</span>
                <span className="font-mono text-slate-800">{selectedAdvance.employee?.emp_code}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">القسم / الوظيفة:</span>
                <span className="text-slate-800">{selectedAdvance.employee?.department || "-"} - {selectedAdvance.employee?.job_title || "-"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">تاريخ الصرف:</span>
                <span className="font-mono text-slate-800">{selectedAdvance.advance_date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">الآيبان البنكي:</span>
                <span className="font-mono text-slate-800">{selectedAdvance.employee?.iban || "استلام نقدي"}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-800">الملخص المالي وخطة الاستقطاع</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-3 text-xs">
              <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-600 font-medium">مبلغ السلفة الإجمالي:</span>
                <strong className="font-mono text-slate-900 text-base">{selectedAdvance.amount.toFixed(2)} ر.س</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">مدة التقسيط:</span>
                <span className="font-mono font-bold text-slate-800">{selectedAdvance.installment_months} أشهر</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">القسط الشهري المستقطع:</span>
                <span className="font-mono font-bold text-sky-700">{selectedAdvance.monthly_deduction.toFixed(2)} ر.س / شهر</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">إجمالي المسترد حتى الآن:</span>
                <span className="font-mono font-bold text-emerald-700">{selectedAdvance.recovered_amount.toFixed(2)} ر.س</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                <span className="text-slate-700 font-bold">المتبقي بذمة الموظف:</span>
                <strong className="font-mono text-rose-700 text-base">{selectedAdvance.remaining_balance.toFixed(2)} ر.س</strong>
              </div>
            </CardContent>
          </Card>
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
            <Banknote className="h-6 w-6 text-industrial-accent" />
            {isArabic ? "سُلف الموظفين والأقساط المستردة" : "Employee Advances & Deductions"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isArabic
              ? "صرف السلف للعاملين، جدولة الأقساط الشهرية، والخصم التلقائي من مسيرات الرواتب"
              : "Track employee cash advances, monthly installment plans, and automatic payroll recoveries"}
          </p>
        </div>

        <Button
          onClick={() => setCreateModalOpen(true)}
          className="gap-2 bg-slate-900 text-white hover:bg-slate-800 shadow-sm font-semibold"
        >
          <Plus className="h-4 w-4" />
          <span>{isArabic ? "صرف سلفة جديدة" : "Issue New Advance"}</span>
        </Button>
      </div>

      {/* Search Bar */}
      <div className="relative w-full md:w-80">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={isArabic ? "بحث برقم السلفة أو اسم الموظف..." : "Search advance..."}
          className="ps-9 bg-white border-industrial-border text-xs"
        />
      </div>

      {/* Advances Table */}
      <Card className="border-industrial-border bg-white shadow-sm overflow-hidden">
        <CardHeader className="py-3 px-4 border-b border-industrial-border bg-slate-50">
          <CardTitle className="text-sm font-bold text-slate-800 flex items-center justify-between">
            <span>{isArabic ? "سجل السلف المالية النشطة والمستردة" : "Active & Settled Advances"}</span>
            <span className="text-xs font-normal text-slate-500 font-mono">
              {filteredAdvances?.length || 0} {isArabic ? "سلفة" : "advances"}
            </span>
          </CardTitle>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start border-collapse">
              <thead>
                <tr className="border-b border-industrial-border bg-slate-100/75 text-slate-700 font-semibold">
                  <th className="py-2.5 px-3 text-start">رقم السلفة</th>
                  <th className="py-2.5 px-3 text-start">اسم الموظف</th>
                  <th className="py-2.5 px-3 text-start">تاريخ الصرف</th>
                  <th className="py-2.5 px-3 text-end">مبلغ السلفة</th>
                  <th className="py-2.5 px-3 text-center">الأقساط (شهر)</th>
                  <th className="py-2.5 px-3 text-end">القسط الشهري</th>
                  <th className="py-2.5 px-3 text-end">المسترد بالرواتب</th>
                  <th className="py-2.5 px-3 text-end">المتبقي للتحصيل</th>
                  <th className="py-2.5 px-3 text-center">الحالة</th>
                  <th className="py-2.5 px-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-industrial-border">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={10} className="p-3">
                        <Skeleton className="h-6 w-full" />
                      </td>
                    </tr>
                  ))
                ) : filteredAdvances?.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-400">
                      {isArabic ? "لا توجد سلف مسجلة حالياً" : "No advances recorded"}
                    </td>
                  </tr>
                ) : (
                  filteredAdvances?.map((adv) => (
                    <tr key={adv.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                        <button
                          type="button"
                          onClick={() => setSelectedAdvance(adv)}
                          className="text-sky-700 hover:text-sky-900 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Wallet className="h-3.5 w-3.5" />
                          <span>{adv.advance_number}</span>
                        </button>
                      </td>
                      <td className="py-2.5 px-3 text-slate-900 font-medium">
                        {adv.employee?.name_ar}
                        <span className="block text-[10px] text-slate-400 font-mono">
                          {adv.employee?.emp_code} - {adv.employee?.department}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {adv.advance_date}
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono tabular-nums font-bold text-slate-900">
                        {adv.amount.toFixed(2)} ر.س
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700">
                        {adv.installment_months}
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono tabular-nums text-slate-700">
                        {adv.monthly_deduction.toFixed(2)} ر.س
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono tabular-nums text-emerald-700 font-bold">
                        {adv.recovered_amount.toFixed(2)} ر.س
                      </td>
                      <td className="py-2.5 px-3 text-end font-mono tabular-nums font-bold text-rose-700">
                        {adv.remaining_balance.toFixed(2)} ر.س
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {adv.status === "settled" ? (
                          <Badge variant="emerald" className="text-[10px]">
                            تم السداد بالكامل
                          </Badge>
                        ) : (
                          <Badge variant="amber" className="text-[10px]">
                            جارٍ الاستقطاع
                          </Badge>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedAdvance(adv)}
                            className="h-7 px-2 text-xs text-sky-700 hover:bg-sky-50"
                            title="معاينة السلفة"
                          >
                            <Eye className="h-3.5 w-3.5 me-1" />
                            <span>معاينة</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handlePrintAdvance(adv)}
                            className="h-7 w-7 p-0 text-slate-600 hover:bg-slate-100"
                            title="طباعة A4"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSavePdfAdvance(adv)}
                            className="h-7 w-7 p-0 text-sky-700 hover:bg-sky-50"
                            title="حفظ PDF"
                          >
                            <FileDown className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleShareWhatsapp(adv)}
                            className="h-7 w-7 p-0 text-emerald-600 hover:bg-emerald-50"
                            title="مشاركة واتساب"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </Button>
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
    </div>
  );
}
