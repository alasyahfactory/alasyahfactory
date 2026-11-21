import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import type { UserProfile, UserRole } from "@/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  UserPlus,
  KeyRound,
  UserX,
  Trash2,
  Shield,
  CheckCircle,
  XCircle,
  FlaskConical,
  DollarSign,
  FileCheck,
} from "lucide-react";

const createUserSchema = z.object({
  full_name: z.string().min(3, "الاسم الكامل مطلوب"),
  phone: z
    .string()
    .min(9, "رقم الجوال يجب أن يتكون من 9 أرقام على الأقل")
    .regex(/^(05|5|9665|\+9665)[0-9]{8}$/, "صيغة رقم الجوال غير صحيحة (مثال: 05XXXXXXXX)"),
  password: z.string().min(6, "كلمة المرور يجب ألا تقل عن 6 خانات"),
  role: z.enum(["owner", "accountant", "production", "warehouse", "sales_rep"] as const),
  can_view_formulas: z.boolean(),
  can_view_costs: z.boolean(),
  can_approve_on_behalf: z.boolean(),
});

type CreateUserFormData = z.infer<typeof createUserSchema>;

export function UsersPage() {
  const { user: currentAuthUser } = useAuth();
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Create User Modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Reset Password Modal state
  const [resetTargetUser, setResetTargetUser] = useState<UserProfile | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  // Disable / Force Logout state
  const [disableTargetUser, setDisableTargetUser] = useState<UserProfile | null>(null);
  const [isDisabling, setIsDisabling] = useState(false);

  // Smart Delete state
  const [deleteTargetUser, setDeleteTargetUser] = useState<UserProfile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserFormData>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      full_name: "",
      phone: "",
      password: "",
      role: "production",
      can_view_formulas: false,
      can_view_costs: false,
      can_approve_on_behalf: false,
    },
  });

  const selectedRole = watch("role");
  const canViewFormulas = watch("can_view_formulas");
  const canViewCosts = watch("can_view_costs");
  const canApproveOnBehalf = watch("can_approve_on_behalf");

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase
        .from("users_profile")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setUsers((data as UserProfile[]) || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load users";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const onCreateUser = async (data: CreateUserFormData) => {
    try {
      const { data: edgeRes, error: edgeErr } = await supabase.functions.invoke("manage-users", {
        body: {
          action: "create_user",
          ...data,
        },
      });

      if (edgeErr || (edgeRes && edgeRes.error)) {
        throw new Error(edgeErr?.message || edgeRes?.error || "Failed to create user via Edge Function");
      }

      toast.success(isArabic ? "تم إنشاء حساب الموظف بنجاح" : "User created successfully");
      setIsCreateOpen(false);
      reset();
      loadUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error creating user";
      toast.error(msg);
    }
  };

  const handleResetPassword = async () => {
    if (!resetTargetUser || !newPassword || newPassword.length < 6) {
      toast.error(isArabic ? "كلمة المرور يجب ألا تقل عن 6 أحرف" : "Password must be at least 6 characters");
      return;
    }

    setIsResetting(true);
    try {
      const { data: edgeRes, error: edgeErr } = await supabase.functions.invoke("manage-users", {
        body: {
          action: "reset_password",
          target_user_id: resetTargetUser.id,
          password: newPassword,
        },
      });

      if (edgeErr || (edgeRes && edgeRes.error)) {
        throw new Error(edgeErr?.message || edgeRes?.error);
      }

      toast.success(isArabic ? "تمت إعادة تعيين كلمة المرور بنجاح" : "Password reset successfully");
      setResetTargetUser(null);
      setNewPassword("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Password reset failed";
      toast.error(msg);
    } finally {
      setIsResetting(false);
    }
  };

  const handleDisableAndLogout = async () => {
    if (!disableTargetUser) return;
    setIsDisabling(true);
    try {
      const { data: edgeRes, error: edgeErr } = await supabase.functions.invoke("manage-users", {
        body: {
          action: "force_logout_and_disable",
          target_user_id: disableTargetUser.id,
        },
      });

      if (edgeErr || (edgeRes && edgeRes.error)) {
        throw new Error(edgeErr?.message || edgeRes?.error);
      }

      toast.success(
        isArabic ? "تم تعطيل الحساب وطرد المستخدم من جميع الجلسات" : "User disabled and globally logged out"
      );
      setDisableTargetUser(null);
      loadUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Action failed";
      toast.error(msg);
    } finally {
      setIsDisabling(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTargetUser) return;
    setIsDeleting(true);
    try {
      const { data: edgeRes, error: edgeErr } = await supabase.functions.invoke("manage-users", {
        body: {
          action: "delete_user",
          target_user_id: deleteTargetUser.id,
        },
      });

      if (edgeErr || (edgeRes && edgeRes.error)) {
        throw new Error(edgeErr?.message || edgeRes?.error);
      }

      toast.success(
        edgeRes?.result?.message || (isArabic ? "تمت معالجة حذف الحساب بنجاح" : "User processed successfully")
      );
      setDeleteTargetUser(null);
      loadUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Delete failed";
      toast.error(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  const getRoleBadgeVariant = (role: UserRole) => {
    switch (role) {
      case "owner":
        return "emerald";
      case "accountant":
        return "amber";
      case "production":
        return "purple";
      case "warehouse":
        return "default";
      case "sales_rep":
        return "secondary";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-industrial-primary sm:text-2xl flex items-center gap-2">
            <Users className="h-6 w-6 text-emerald-600" />
            <span>{t("users.title")}</span>
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            {t("users.subtitle")}
          </p>
        </div>

        <Button
          onClick={() => setIsCreateOpen(true)}
          className="bg-industrial-primary hover:bg-slate-800 text-white font-medium shadow-sm"
        >
          <UserPlus className="me-2 h-4 w-4" />
          <span>{t("users.createBtn")}</span>
        </Button>
      </div>

      {/* Staff Members List */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base font-semibold">
            {isArabic ? "قائمة موظفي ومستخدمي المصنع" : "Registered Factory Personnel"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">
              {isArabic ? "لا يوجد مستخدمون مسجلون حالياً" : "No users found"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-industrial-border bg-slate-50/70 text-slate-600 font-semibold">
                    <th className="p-3 text-start">{t("users.fullName")}</th>
                    <th className="p-3 text-start">{t("users.phone")}</th>
                    <th className="p-3 text-start">{t("users.role")}</th>
                    <th className="p-3 text-start">{t("users.flags")}</th>
                    <th className="p-3 text-start">{t("common.status")}</th>
                    <th className="p-3 text-end">{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-industrial-border">
                  {users.map((u) => {
                    const isSelf = u.id === currentAuthUser?.id;
                    return (
                      <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-3 font-semibold text-industrial-primary">
                          <div className="flex items-center gap-2">
                            <span>{u.full_name}</span>
                            {isSelf && (
                              <Badge variant="outline" className="text-[10px]">
                                {isArabic ? "أنت" : "You"}
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="p-3 font-mono tabular-nums text-slate-600" dir="ltr">
                          {u.phone}
                        </td>
                        <td className="p-3">
                          <Badge variant={getRoleBadgeVariant(u.role)} className="text-[11px]">
                            {t(`roles.${u.role}`)}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              title={t("users.canViewFormulas")}
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                u.can_view_formulas
                                  ? "bg-purple-100 text-purple-800"
                                  : "bg-slate-100 text-slate-400 opacity-60"
                              }`}
                            >
                              <FlaskConical className="h-3 w-3" />
                              <span>الخلطات</span>
                            </span>
                            <span
                              title={t("users.canViewCosts")}
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                u.can_view_costs
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-slate-100 text-slate-400 opacity-60"
                              }`}
                            >
                              <DollarSign className="h-3 w-3" />
                              <span>التكاليف</span>
                            </span>
                            <span
                              title={t("users.canApproveOnBehalf")}
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                u.can_approve_on_behalf
                                  ? "bg-sky-100 text-sky-800"
                                  : "bg-slate-100 text-slate-400 opacity-60"
                              }`}
                            >
                              <FileCheck className="h-3 w-3" />
                              <span>الاعتماد</span>
                            </span>
                          </div>
                        </td>
                        <td className="p-3">
                          {u.deleted_at ? (
                            <Badge variant="destructive" className="text-[10px]">
                              {isArabic ? "محذوف ناعماً" : "Soft Deleted"}
                            </Badge>
                          ) : u.is_active ? (
                            <Badge variant="emerald" className="text-[10px]">
                              {t("common.active")}
                            </Badge>
                          ) : (
                            <Badge variant="rose" className="text-[10px]">
                              {t("common.inactive")}
                            </Badge>
                          )}
                        </td>
                        <td className="p-3 text-end">
                          {!isSelf && !u.deleted_at && (
                            <div className="flex items-center justify-end gap-1">
                              {/* Reset Password */}
                              <button
                                onClick={() => {
                                  setResetTargetUser(u);
                                  setNewPassword("");
                                }}
                                className="p-1.5 text-slate-600 hover:text-accent rounded hover:bg-slate-100"
                                title={t("users.resetPassword")}
                              >
                                <KeyRound className="h-4 w-4" />
                              </button>

                              {/* Disable & Logout */}
                              {u.is_active && (
                                <button
                                  onClick={() => setDisableTargetUser(u)}
                                  className="p-1.5 text-amber-600 hover:text-amber-700 rounded hover:bg-amber-50"
                                  title={t("users.disableAndLogout")}
                                >
                                  <UserX className="h-4 w-4" />
                                </button>
                              )}

                              {/* Smart Delete */}
                              <button
                                onClick={() => setDeleteTargetUser(u)}
                                className="p-1.5 text-rose-600 hover:text-rose-700 rounded hover:bg-rose-50"
                                title={t("users.deleteUser")}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
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

      {/* CREATE USER DIALOG */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("users.createBtn")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onCreateUser)} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="create_full_name">{t("users.fullName")}</Label>
              <Input
                id="create_full_name"
                placeholder="أحمد علي"
                disabled={isSubmitting}
                {...register("full_name")}
              />
              {errors.full_name && (
                <p className="text-xs text-rose-600">{errors.full_name.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="create_phone">{t("users.phone")}</Label>
              <Input
                id="create_phone"
                dir="ltr"
                tabularNums
                placeholder="05XXXXXXXX"
                className="font-mono text-start"
                disabled={isSubmitting}
                {...register("phone")}
              />
              {errors.phone && (
                <p className="text-xs text-rose-600">{errors.phone.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="create_password">{t("common.password")}</Label>
              <Input
                id="create_password"
                type="password"
                dir="ltr"
                placeholder="••••••••"
                disabled={isSubmitting}
                {...register("password")}
              />
              {errors.password && (
                <p className="text-xs text-rose-600">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="create_role">{t("users.role")}</Label>
              <Select
                value={selectedRole}
                onValueChange={(val) => setValue("role", val as UserRole)}
                disabled={isSubmitting}
              >
                <SelectTrigger id="create_role">
                  <SelectValue placeholder="اختر الدور الوظيفي" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">{t("roles.owner")}</SelectItem>
                  <SelectItem value="accountant">{t("roles.accountant")}</SelectItem>
                  <SelectItem value="production">{t("roles.production")}</SelectItem>
                  <SelectItem value="warehouse">{t("roles.warehouse")}</SelectItem>
                  <SelectItem value="sales_rep">{t("roles.sales_rep")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Granular switches */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
              <p className="text-xs font-semibold text-slate-700">{t("users.flags")}</p>

              <div className="flex items-center justify-between">
                <Label htmlFor="switch_formulas" className="text-xs font-normal">
                  {t("users.canViewFormulas")}
                </Label>
                <Switch
                  id="switch_formulas"
                  checked={canViewFormulas}
                  onCheckedChange={(c) => setValue("can_view_formulas", c)}
                  disabled={isSubmitting}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="switch_costs" className="text-xs font-normal">
                  {t("users.canViewCosts")}
                </Label>
                <Switch
                  id="switch_costs"
                  checked={canViewCosts}
                  onCheckedChange={(c) => setValue("can_view_costs", c)}
                  disabled={isSubmitting}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="switch_approve" className="text-xs font-normal">
                  {t("users.canApproveOnBehalf")}
                </Label>
                <Switch
                  id="switch_approve"
                  checked={canApproveOnBehalf}
                  onCheckedChange={(c) => setValue("can_approve_on_behalf", c)}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateOpen(false)}
                disabled={isSubmitting}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                variant="default"
                isLoading={isSubmitting}
                className="bg-industrial-primary text-white"
              >
                {t("common.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* RESET PASSWORD DIALOG */}
      <Dialog open={!!resetTargetUser} onOpenChange={(open) => !open && setResetTargetUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("users.resetPassword")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-xs text-slate-500">
              {isArabic
                ? `إعادة تعيين كلمة المرور لحساب ${resetTargetUser?.full_name} (${resetTargetUser?.phone}). سيتم إنهاء أي جلسات قديمة.`
                : `Set new password for ${resetTargetUser?.full_name}. Old sessions will be signed out.`}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="new_password">{t("users.newPassword")}</Label>
              <Input
                id="new_password"
                type="password"
                dir="ltr"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={isResetting}
              />
            </div>
            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setResetTargetUser(null)}
                disabled={isResetting}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                variant="default"
                isLoading={isResetting}
                onClick={handleResetPassword}
                className="bg-industrial-primary text-white"
              >
                {t("common.save")}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* DISABLE & FORCE LOGOUT CONFIRMATION */}
      <AlertDialog
        open={!!disableTargetUser}
        onOpenChange={(open) => !open && setDisableTargetUser(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-amber-600 flex items-center gap-2">
              <UserX className="h-5 w-5" />
              <span>{t("users.disableAndLogout")}</span>
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isArabic
                ? `هل أنت متأكد من رغبتك في تعطيل حساب ${disableTargetUser?.full_name}؟ سيتم إلغاء صلاحية دخوله وطرده فوراً من جميع الأجهزة المتصلة.`
                : `Are you sure you want to disable ${disableTargetUser?.full_name}? They will be immediately signed out from all sessions.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDisabling}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisableAndLogout}
              disabled={isDisabling}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isDisabling ? t("common.loading") : t("users.disableAndLogout")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* SMART DELETE CONFIRMATION */}
      <AlertDialog
        open={!!deleteTargetUser}
        onOpenChange={(open) => !open && setDeleteTargetUser(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-rose-600 flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              <span>{t("users.deleteConfirmTitle")}</span>
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                {isArabic
                  ? `أنت على وشك حذف حساب ${deleteTargetUser?.full_name}.`
                  : `You are about to delete ${deleteTargetUser?.full_name}.`}
              </p>
              <p className="rounded-md bg-slate-100 p-2 text-xs text-slate-700">
                {t("users.deleteConfirmDesc")}
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              disabled={isDeleting}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {isDeleting ? t("common.loading") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
