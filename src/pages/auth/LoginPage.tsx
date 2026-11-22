import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { Lock, Phone, Shield, Globe, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getDefaultRouteForRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const loginSchema = z.object({
  phone: z
    .string()
    .min(9, "رقم الجوال يجب أن يتكون من 9 أرقام على الأقل")
    .regex(/^(05|5|9665|\+9665)[0-9]{8}$/, "صيغة رقم الجوال غير صحيحة (مثال: 05XXXXXXXX)"),
  password: z.string().min(6, "كلمة المرور يجب ألا تقل عن 6 خانات"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      phone: "",
      password: "",
    },
  });

  const toggleLanguage = () => {
    const nextLang = isArabic ? "en" : "ar";
    i18n.changeLanguage(nextLang);
  };

  const onSubmit = async (data: LoginFormData) => {
    setErrorMsg(null);
    try {
      await login(data.phone, data.password);
      toast.success(isArabic ? "تم تسجيل الدخول بنجاح" : "Signed in successfully");

      // Get profile role from auth
      // Route lockdown redirects to their home route
      navigate("/");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("auth.inactiveAccount");
      setErrorMsg(msg);
      toast.error(msg);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-industrial-bg px-4 py-8">
      {/* Language switcher top corner */}
      <div className="absolute top-4 end-4">
        <button
          type="button"
          onClick={toggleLanguage}
          className="flex items-center gap-1.5 rounded-md border border-industrial-border bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
        >
          <Globe className="h-4 w-4 text-accent" />
          <span>{isArabic ? "English" : "العربية"}</span>
        </button>
      </div>

      <div className="w-full max-w-md">
        {/* Factory Header Badge */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-industrial-primary text-white shadow-md">
            <Shield className="h-7 w-7 text-accent" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-industrial-primary sm:text-2xl">
            {t("appName")}
          </h1>
          <p className="mt-1 text-xs text-slate-500 font-mono">
            Saudi Detergent Factory ERP • Enterprise v3.1
          </p>
        </div>

        <Card className="shadow-md border-industrial-border">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-lg font-semibold text-center">
              {t("auth.title")}
            </CardTitle>
            <CardDescription className="text-center text-xs">
              {t("auth.subtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {errorMsg && (
              <div role="alert" aria-live="assertive" className="mb-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate aria-label={t("auth.title")}>
              <div className="space-y-1.5">
                <Label htmlFor="phone">{t("common.phone")}</Label>
                <div className="relative">
                  <Input
                    id="phone"
                    type="tel"
                    dir="ltr"
                    tabularNums
                    autoComplete="tel"
                    inputMode="tel"
                    enterKeyHint="next"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="05XXXXXXXX"
                    className="ps-9 font-mono text-start"
                    disabled={isSubmitting}
                    aria-invalid={errors.phone ? "true" : undefined}
                    aria-describedby={errors.phone ? "phone-error phone-help" : "phone-help"}
                    {...register("phone")}
                  />
                  <Phone className="absolute start-3 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
                {errors.phone && (
                  <p id="phone-error" role="alert" className="text-xs text-rose-600">{errors.phone.message}</p>
                )}
                <p id="phone-help" className="text-[11px] text-slate-400">{t("auth.phoneHelp")}</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">{t("common.password")}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    dir="ltr"
                    autoComplete="current-password"
                    enterKeyHint="done"
                    spellCheck={false}
                    placeholder="••••••••"
                    className="ps-9 pe-10"
                    disabled={isSubmitting}
                    aria-invalid={errors.password ? "true" : undefined}
                    aria-describedby={errors.password ? "password-error" : undefined}
                    {...register("password")}
                  />
                  <Lock className="absolute start-3 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-pressed={showPassword}
                    aria-label={showPassword ? "إخفاء كلمة المرور" : "عرض كلمة المرور"}
                    className="absolute end-3 top-2.5 text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p id="password-error" role="alert" className="text-xs text-rose-600">{errors.password.message}</p>
                )}
              </div>

              <Button
                type="submit"
                variant="default"
                size="mobile"
                isLoading={isSubmitting}
                className="mt-2 w-full bg-industrial-primary hover:bg-slate-800 text-white font-medium"
              >
                {isSubmitting ? t("auth.loggingIn") : t("auth.loginButton")}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Security Notice */}
        <div className="mt-6 text-center text-[11px] text-slate-400">
          <p>نظام داخلي مشفر مخصص لموظفي المصنع فقط</p>
          <p className="font-mono mt-0.5">Strict RBAC • Append-Only Ledger • ZATCA Compliant</p>
        </div>
      </div>
    </div>
  );
}
