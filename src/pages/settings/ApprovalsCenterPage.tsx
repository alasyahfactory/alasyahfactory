import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Search,
  Filter,
  Check,
  X,
  FileText,
  DollarSign,
  User,
  Calendar,
  AlertTriangle,
  Send,
  Plus,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ApprovalRequest } from "@/types/database";

export function ApprovalsCenterPage() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const queryClient = useQueryClient();

  // Filters & State
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Reject Dialog State
  const [rejectDialogItem, setRejectDialogItem] = useState<ApprovalRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  // Create Dialog State
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newRequestType, setNewRequestType] = useState<ApprovalRequest["request_type"]>("credit_limit_override");
  const [newReferenceNumber, setNewReferenceNumber] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newReason, setNewReason] = useState("");

  // 1. Fetch Approval Requests with requester and approver
  const { data: requests = [], isLoading } = useQuery<ApprovalRequest[]>({
    queryKey: ["approval_requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("approval_requests")
        .select(`
          *,
          requester:requester_id (id, full_name, phone, role),
          approver:approved_by (id, full_name, role)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as ApprovalRequest[];
    },
  });

  // 2. Respond Mutation (Approve / Reject)
  const respondMutation = useMutation({
    mutationFn: async ({
      requestId,
      decision,
      reason,
    }: {
      requestId: string;
      decision: "approved" | "rejected";
      reason?: string;
    }) => {
      const { data, error } = await supabase.rpc("rpc_respond_approval_request", {
        p_request_id: requestId,
        p_decision: decision,
        p_rejection_reason: reason || null,
        p_user_id: user?.id,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["approval_requests"] });
      queryClient.invalidateQueries({ queryKey: ["owner_dashboard_stats"] });
      if (variables.decision === "approved") {
        toast.success(isAr ? "تم اعتماد الطلب بنجاح وتحديث السجلات" : "Request approved successfully");
      } else {
        toast.error(isAr ? "تم رفض الطلب وتسجيل سبب الرفض" : "Request rejected");
      }
      setRejectDialogItem(null);
      setRejectionReason("");
    },
    onError: (err: any) => {
      toast.error(err.message || (isAr ? "حدث خطأ أثناء معالجة الطلب" : "Error responding to request"));
    },
  });

  // 3. Create Manual Approval Request Mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!newReferenceNumber.trim()) throw new Error(isAr ? "رقم المرجع مطلوب" : "Reference is required");
      if (!newReason.trim()) throw new Error(isAr ? "سبب الطلب ومبرراته مطلوبة" : "Reason is required");

      const { data, error } = await supabase
        .from("approval_requests")
        .insert({
          request_type: newRequestType,
          reference_number: newReferenceNumber.trim(),
          requester_id: user?.id,
          reason: newReason.trim(),
          amount: newAmount ? parseFloat(newAmount) : null,
          status: "pending",
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approval_requests"] });
      toast.success(isAr ? "تم إرسال طلب الاعتماد بنجاح إلى الإدارة العليا" : "Approval request submitted");
      setCreateDialogOpen(false);
      setNewReferenceNumber("");
      setNewAmount("");
      setNewReason("");
    },
    onError: (err: any) => {
      toast.error(err.message || (isAr ? "فشل إنشاء طلب الاعتماد" : "Failed to create request"));
    },
  });

  // Filtered List
  const filteredRequests = requests.filter((req) => {
    if (statusFilter !== "all" && req.status !== statusFilter) return false;
    if (typeFilter !== "all" && req.request_type !== typeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchRef = req.reference_number?.toLowerCase().includes(q);
      const matchReason = req.reason?.toLowerCase().includes(q);
      const matchUser = (req.requester as any)?.full_name?.toLowerCase().includes(q);
      if (!matchRef && !matchReason && !matchUser) return false;
    }
    return true;
  });

  // Counts
  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const approvedCount = requests.filter((r) => r.status === "approved").length;
  const rejectedCount = requests.filter((r) => r.status === "rejected").length;
  const pendingValue = requests
    .filter((r) => r.status === "pending" && r.amount)
    .reduce((sum, r) => sum + (r.amount || 0), 0);

  const getTypeLabel = (type: ApprovalRequest["request_type"]) => {
    switch (type) {
      case "purchase_order":
        return isAr ? "أمر شراء (PO)" : "Purchase Order";
      case "credit_limit_override":
        return isAr ? "تجاوز حد ائتماني" : "Credit Limit Override";
      case "manual_journal_entry":
        return isAr ? "قيد يومية يدوي" : "Manual Journal Entry";
      case "spoilage_write_off":
        return isAr ? "إتلاف / هالك مخزني" : "Spoilage Write-Off";
      case "discount_override":
        return isAr ? "خصم بيع استثنائي" : "Discount Override";
      case "payroll_approval":
        return isAr ? "اعتماد مسير رواتب" : "Payroll Approval";
      default:
        return type;
    }
  };

  const getTypeBadgeClass = (type: ApprovalRequest["request_type"]) => {
    switch (type) {
      case "purchase_order":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "credit_limit_override":
        return "bg-amber-100 text-amber-800 border-amber-200";
      case "manual_journal_entry":
        return "bg-purple-100 text-purple-800 border-purple-200";
      case "spoilage_write_off":
        return "bg-rose-100 text-rose-800 border-rose-200";
      case "discount_override":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "payroll_approval":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      default:
        return "bg-slate-100 text-slate-800 border-slate-200";
    }
  };


  // Full-page in-place Canvas for Submitting Approval Request
  if (createDialogOpen) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto pb-16 animate-in fade-in duration-200">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3">
            <Button
              variant="tonal"
              size="sm"
              onClick={() => setCreateDialogOpen(false)}
              className="gap-1.5"
            >
              <ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
              <span>{isAr ? "العودة لمركز الموافقات" : "Back to Approvals"}</span>
            </Button>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Plus className="h-5 w-5 text-industrial-accent" />
                <span>{isAr ? "رفع طلب اعتماد إداري جديد" : "Submit Approval Request"}</span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {isAr
                  ? "إرسال طلب خاص يتطلب توقيع واعتماد المدير العام بموجب لائحة الصلاحيات."
                  : "Submit a request requiring General Manager authorization per factory bylaws."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCreateDialogOpen(false)}
              disabled={createMutation.isPending}
            >
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!newReason.trim() || createMutation.isPending}
              className="gap-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold min-h-[40px] px-6"
            >
              {createMutation.isPending ? (isAr ? "جاري الإرسال..." : "Submitting...") : (isAr ? "إرسال الطلب للاعتماد" : "Submit")}
            </Button>
          </div>
        </div>

        <Card className="shadow-sm">
          <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
            <CardTitle className="text-base font-semibold">تفاصيل الطلب ومبررات الاستثناء</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4 text-xs">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                {isAr ? "نوع الطلب" : "Request Type"}
              </label>
              <Select
                value={newRequestType}
                onValueChange={(val: any) => setNewRequestType(val)}
              >
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit_limit_override">{isAr ? "تجاوز حد ائتماني لعميل" : "Credit Limit Override"}</SelectItem>
                  <SelectItem value="discount_override">{isAr ? "خصم بيع استثنائي" : "Discount Override"}</SelectItem>
                  <SelectItem value="manual_journal_entry">{isAr ? "قيد يومية تسوية يدوي" : "Manual JV"}</SelectItem>
                  <SelectItem value="spoilage_write_off">{isAr ? "إتلاف / هالك مخزني" : "Spoilage Write-Off"}</SelectItem>
                  <SelectItem value="purchase_order">{isAr ? "طلب شراء استثنائي" : "Purchase Order"}</SelectItem>
                  <SelectItem value="payroll_approval">{isAr ? "اعتماد مسير رواتب" : "Payroll"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  {isAr ? "رقم المرجع / المعرف" : "Reference Number"}
                </label>
                <Input
                  value={newReferenceNumber}
                  onChange={(e) => setNewReferenceNumber(e.target.value)}
                  placeholder={isAr ? "مثال: CUST-104 / PO-2026-004" : "e.g., CUST-104"}
                  className="h-10 text-xs"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  {isAr ? "المبلغ المعني (ر.س) - اختياري" : "Amount (SAR) - Optional"}
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  placeholder="0.00"
                  className="h-10 text-xs font-mono"
                />
              </div>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                {isAr ? "المبررات والتفاصيل (إلزامي)" : "Justification & Details (Required)"}
              </label>
              <textarea
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                placeholder={isAr ? "اشرح سبب الاستثناء ومبرراته للإدارة..." : "Explain reason..."}
                className="w-full h-28 p-3 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-industrial-accent focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreateDialogOpen(false)}
                disabled={createMutation.isPending}
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={!newReason.trim() || createMutation.isPending}
                className="gap-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold min-h-[40px] px-6"
              >
                {createMutation.isPending ? (isAr ? "جاري الإرسال..." : "Submitting...") : (isAr ? "إرسال الطلب للاعتماد" : "Submit")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Full-page in-place Canvas for Rejecting an Approval Request
  if (rejectDialogItem) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto pb-16 animate-in fade-in duration-200">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-rose-200 dark:border-rose-950 shadow-sm">
          <div className="flex items-center gap-3">
            <Button
              variant="tonal"
              size="sm"
              onClick={() => setRejectDialogItem(null)}
              className="gap-1.5"
            >
              <ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
              <span>{isAr ? "العودة للطلبات" : "Back"}</span>
            </Button>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-rose-700 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                <span>{isAr ? "رفض طلب الاعتماد" : "Reject Request"}</span>
                <span className="font-mono text-xs text-slate-500 font-normal">
                  ({rejectDialogItem.reference_number})
                </span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {isAr
                  ? `يرجى توضيح سبب رفض الطلب لإشعار مقدم الطلب.`
                  : `Please specify rejection reason for the requester.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRejectDialogItem(null)}
              disabled={respondMutation.isPending}
            >
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              size="sm"
              disabled={!rejectionReason.trim() || respondMutation.isPending}
              onClick={() => {
                respondMutation.mutate({
                  requestId: rejectDialogItem.id,
                  decision: "rejected",
                  reason: rejectionReason.trim(),
                });
              }}
              className="bg-rose-700 hover:bg-rose-800 text-white font-semibold min-h-[40px] px-6"
            >
              {respondMutation.isPending ? (isAr ? "جاري الرفض..." : "Rejecting...") : (isAr ? "تأكيد الرفض" : "Confirm Reject")}
            </Button>
          </div>
        </div>

        <Card className="border-rose-200 shadow-sm p-6 bg-white dark:bg-slate-900">
          <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-2">
            {isAr ? "سبب الرفض وملاحظات الإدارة (إلزامي) *" : "Rejection Reason (Required) *"}
          </label>
          <textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            placeholder={isAr ? "مثال: تجاوز الميزانية المخصصة للشهر الحالي، أو يرجى مراجعة الأسعار أولاً..." : "Enter reason..."}
            className="w-full h-32 p-3 text-xs border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none bg-slate-50 dark:bg-slate-800"
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-industrial-border pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <ShieldCheck className="h-7 w-7 text-industrial-accent" />
            <span>{isAr ? "مركز الاعتمادات والرقابة الإدارية" : "Executive Approvals Center"}</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isAr
              ? "صلاحية حصرية للمدير العام: مراجعة واعتماد أوامر الشراء الكبيرة، تجاوزات الائتمان، قيود التسوية، والرواتب"
              : "Exclusive to General Manager: Review & authorize high-value POs, credit overrides, adjustments, and payroll"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={() => setCreateDialogOpen(true)}
            size="sm"
            variant="outline"
            className="border-slate-300 hover:bg-slate-50"
          >
            <Plus className="me-1.5 h-4 w-4" />
            <span>{isAr ? "طلب اعتماد جديد" : "New Request"}</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-industrial-border bg-white shadow-sm p-4">
          <span className="text-xs text-slate-500 font-semibold block flex items-center justify-between">
            <span>{isAr ? "طلبات معلقة بانتظار البت" : "Pending Approvals"}</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </span>
          <div className="font-mono font-black text-2xl text-amber-600 mt-1">
            {isLoading ? "..." : pendingCount}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {isAr ? "تتطلب قرار المدير العام" : "Requires GM approval"}
          </span>
        </Card>

        <Card className="border-industrial-border bg-white shadow-sm p-4">
          <span className="text-xs text-slate-500 font-semibold block flex items-center justify-between">
            <span>{isAr ? "قيمة الطلبات المعلقة" : "Pending Amount"}</span>
            <DollarSign className="h-4 w-4 text-industrial-accent" />
          </span>
          <div className="font-mono font-black text-2xl text-slate-900 mt-1">
            {isLoading ? "..." : `${pendingValue.toLocaleString("en-US", { minimumFractionDigits: 2 })} ر.س`}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {isAr ? "إجمالي السيولة المقيدة للطلبات" : "Total contingent liquidity"}
          </span>
        </Card>

        <Card className="border-industrial-border bg-white shadow-sm p-4">
          <span className="text-xs text-slate-500 font-semibold block flex items-center justify-between">
            <span>{isAr ? "طلبات معتمدة" : "Approved Requests"}</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </span>
          <div className="font-mono font-black text-2xl text-emerald-600 mt-1">
            {isLoading ? "..." : approvedCount}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {isAr ? "تم اعتمادها ومباشرة أثرها" : "Approved and executed"}
          </span>
        </Card>

        <Card className="border-industrial-border bg-white shadow-sm p-4">
          <span className="text-xs text-slate-500 font-semibold block flex items-center justify-between">
            <span>{isAr ? "طلبات مرفوضة" : "Rejected Requests"}</span>
            <XCircle className="h-4 w-4 text-rose-600" />
          </span>
          <div className="font-mono font-black text-2xl text-rose-600 mt-1">
            {isLoading ? "..." : rejectedCount}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {isAr ? "تم رفضها مع ذكر الأسباب" : "Rejected with justification"}
          </span>
        </Card>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white border border-industrial-border rounded-lg p-3 shadow-sm flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Status Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-md text-xs font-medium">
          <button
            onClick={() => setStatusFilter("pending")}
            className={`px-3 py-1.5 rounded transition ${
              statusFilter === "pending"
                ? "bg-white text-slate-900 shadow-sm font-bold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {isAr ? "قيد الانتظار" : "Pending"} ({pendingCount})
          </button>
          <button
            onClick={() => setStatusFilter("approved")}
            className={`px-3 py-1.5 rounded transition ${
              statusFilter === "approved"
                ? "bg-white text-emerald-700 shadow-sm font-bold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {isAr ? "المعتمدة" : "Approved"} ({approvedCount})
          </button>
          <button
            onClick={() => setStatusFilter("rejected")}
            className={`px-3 py-1.5 rounded transition ${
              statusFilter === "rejected"
                ? "bg-white text-rose-700 shadow-sm font-bold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {isAr ? "المرفوضة" : "Rejected"} ({rejectedCount})
          </button>
          <button
            onClick={() => setStatusFilter("all")}
            className={`px-3 py-1.5 rounded transition ${
              statusFilter === "all"
                ? "bg-white text-slate-900 shadow-sm font-bold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {isAr ? "جميع الطلبات" : "All"} ({requests.length})
          </button>
        </div>

        {/* Search & Type Select */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 md:w-56">
            <Search className="absolute start-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isAr ? "بحث بالمرجع أو السبب..." : "Search ref or reason..."}
              className="h-8 ps-8 text-xs"
            />
          </div>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 text-xs w-[170px]">
              <SelectValue placeholder={isAr ? "نوع الطلب" : "Request Type"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isAr ? "جميع الأنواع" : "All Types"}</SelectItem>
              <SelectItem value="purchase_order">{isAr ? "أمر شراء" : "Purchase Order"}</SelectItem>
              <SelectItem value="credit_limit_override">{isAr ? "تجاوز ائتماني" : "Credit Override"}</SelectItem>
              <SelectItem value="manual_journal_entry">{isAr ? "قيد يدوي" : "Manual JV"}</SelectItem>
              <SelectItem value="spoilage_write_off">{isAr ? "هالك مخزني" : "Spoilage"}</SelectItem>
              <SelectItem value="discount_override">{isAr ? "خصم بيع" : "Discount"}</SelectItem>
              <SelectItem value="payroll_approval">{isAr ? "مسير رواتب" : "Payroll"}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Requests List */}
      {isLoading ? (
        <div className="bg-white border border-industrial-border rounded-lg p-12 text-center text-slate-400 text-sm">
          {isAr ? "جاري تحميل سجلات الاعتمادات..." : "Loading approval requests..."}
        </div>
      ) : filteredRequests.length === 0 ? (
        <Card className="border-industrial-border bg-white shadow-sm p-12 text-center">
          <ShieldCheck className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-700">
            {isAr ? "لا توجد طلبات اعتماد مطابقة" : "No approval requests found"}
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {isAr
              ? "كافة طلبات الاعتماد مفروزة ومحدثة بحسب التصفية الحالية."
              : "All requests are processed and up to date for this view filter."}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredRequests.map((req) => (
            <Card
              key={req.id}
              className={`border transition-all shadow-sm ${
                req.status === "pending"
                  ? "border-amber-200 bg-amber-50/20 hover:border-amber-300"
                  : req.status === "approved"
                  ? "border-slate-200 bg-white hover:border-emerald-200"
                  : "border-slate-200 bg-white opacity-85 hover:opacity-100"
              }`}
            >
              <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                {/* Left Info Column */}
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={`text-xs font-semibold px-2.5 py-0.5 border ${getTypeBadgeClass(req.request_type)}`}>
                      {getTypeLabel(req.request_type)}
                    </Badge>
                    <span className="font-mono font-bold text-sm text-slate-900">
                      {req.reference_number}
                    </span>

                    {req.status === "pending" && (
                      <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 text-[11px] gap-1">
                        <Clock className="h-3 w-3" />
                        <span>{isAr ? "بانتظار القرار" : "Pending"}</span>
                      </Badge>
                    )}
                    {req.status === "approved" && (
                      <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[11px] gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>{isAr ? "معتمد" : "Approved"}</span>
                      </Badge>
                    )}
                    {req.status === "rejected" && (
                      <Badge variant="outline" className="bg-rose-100 text-rose-800 border-rose-300 text-[11px] gap-1">
                        <XCircle className="h-3 w-3" />
                        <span>{isAr ? "مرفوض" : "Rejected"}</span>
                      </Badge>
                    )}
                  </div>

                  {/* Reason / Details */}
                  <div className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded p-2.5">
                    <span className="font-semibold text-slate-900 me-1">
                      {isAr ? "المبررات والملاحظات:" : "Justification:"}
                    </span>
                    <span>{req.reason}</span>
                  </div>

                  {/* Rejection Note if Rejected */}
                  {req.status === "rejected" && req.rejection_reason && (
                    <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2 flex items-start gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <div>
                        <span className="font-bold me-1">{isAr ? "سبب الرفض الإداري:" : "Rejection Reason:"}</span>
                        <span>{req.rejection_reason}</span>
                      </div>
                    </div>
                  )}

                  {/* Meta Details Row */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 pt-1">
                    <div className="flex items-center gap-1">
                      <User className="h-3.5 w-3.5 text-slate-400" />
                      <span>{isAr ? "مقدم الطلب:" : "Requester:"}</span>
                      <span className="font-medium text-slate-700">
                        {(req.requester as any)?.full_name || (isAr ? "موظف بالنظام" : "Staff")}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      <span>{new Date(req.created_at).toLocaleDateString("en-GB")}</span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(req.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>

                    {req.approved_at && (
                      <div className="flex items-center gap-1 text-slate-600">
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        <span>{isAr ? "تاريخ القرار:" : "Decided:"}</span>
                        <span>{new Date(req.approved_at).toLocaleDateString("en-GB")}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Amount & Actions Column */}
                <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between lg:justify-center gap-3 border-t lg:border-t-0 pt-3 lg:pt-0">
                  {req.amount !== null && req.amount !== undefined && (
                    <div className="text-start lg:text-end">
                      <span className="text-[11px] text-slate-500 block">{isAr ? "المبلغ المعني" : "Amount"}</span>
                      <span className="font-mono font-black text-lg text-slate-900">
                        {req.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} ر.س
                      </span>
                    </div>
                  )}

                  {/* Pending Decision Buttons */}
                  {req.status === "pending" && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() =>
                          respondMutation.mutate({
                            requestId: req.id,
                            decision: "approved",
                          })
                        }
                        disabled={respondMutation.isPending}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white min-h-[38px] px-3.5"
                      >
                        <Check className="me-1.5 h-4 w-4" />
                        <span>{isAr ? "اعتماد / موافقة" : "Approve"}</span>
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRejectDialogItem(req);
                          setRejectionReason("");
                        }}
                        disabled={respondMutation.isPending}
                        className="border-rose-300 text-rose-700 hover:bg-rose-50 min-h-[38px] px-3"
                      >
                        <X className="me-1.5 h-4 w-4" />
                        <span>{isAr ? "رفض" : "Reject"}</span>
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
export default ApprovalsCenterPage;
