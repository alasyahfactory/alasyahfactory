import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { Lock, Phone, Shield, Globe, Eye, EyeOff, Sparkles, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
      navigate("/");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("auth.inactiveAccount");
      setErrorMsg(msg);
      toast.error(msg);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-industrial-canvas px-4 py-8 overflow-hidden">
      {/* Decorative ambient background glows */}
      <div className="pointer-events-none absolute -top-40 -start-40 h-96 w-96 rounded-full bg-sky-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -end-40 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />

      {/* Language switcher top corner */}
      <div className="absolute top-6 end-6 z-20">
        <button
          type="button"
          onClick={toggleLanguage}
          className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white/90 backdrop-blur-sm px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white hover:text-slate-900 shadow-subtle transition-all active:scale-95"
        >
          <Globe className="h-3.5 w-3.5 text-sky-600" />
          <span>{isArabic ? "English" : "العربية"}</span>
        </button>
      </div>

      <div className="relative z-10 w-full max-w-md animate-fade-in">
        {/* Factory Header Badge */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-slate-950 via-slate-900 to-slate-800 text-white shadow-xl ring-1 ring-white/20">
            <Shield className="h-8 w-8 text-sky-400" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-sky-500 ring-2 ring-white"></span>
            </span>
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-900/5 px-3 py-1 mb-2 border border-slate-200/60 text-xs font-medium text-slate-600">
            <Sparkles className="h-3 w-3 text-sky-600" />
            <span>نظام إدارة العمليات الصناعية 2026</span>
          </div>

          <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
            {t("appName")}
          </h1>
          <p className="mt-1.5 text-xs text-slate-500 font-mono">
            Saudi Detergent Factory ERP • Enterprise Cloud Edition
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200/90 bg-white/95 backdrop-blur-xl p-6 sm:p-8 shadow-card-hover">
          <div className="space-y-1 pb-6 text-center">
            <h2 className="text-lg font-bold text-slate-900">
              {t("auth.title")}
            </h2>
            <p className="text-xs text-slate-500 font-normal">
              {t("auth.subtitle")}
            </p>
          </div>

          {errorMsg && (
            <div role="alert" aria-live="assertive" className="mb-5 rounded-xl border border-rose-200/80 bg-rose-50 p-3 text-xs text-rose-700 font-medium">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate aria-label={t("auth.title")}>
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-xs font-bold text-slate-700">
                {t("common.phone")}
              </Label>
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
                  className="ps-10 font-mono text-start h-11 rounded-xl"
                  disabled={isSubmitting}
                  aria-invalid={errors.phone ? "true" : undefined}
                  aria-describedby={errors.phone ? "phone-error phone-help" : "phone-help"}
                  {...register("phone")}
                />
                <Phone className="absolute start-3.5 top-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
              </div>
              {errors.phone && (
                <p id="phone-error" role="alert" className="text-xs text-rose-600 font-medium">{errors.phone.message}</p>
              )}
              <p id="phone-help" className="text-[11px] text-slate-400 font-normal">{t("auth.phoneHelp")}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-bold text-slate-700">
                {t("common.password")}
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  dir="ltr"
                  autoComplete="current-password"
                  enterKeyHint="done"
                  spellCheck={false}
                  placeholder="••••••••"
                  className="ps-10 pe-11 h-11 rounded-xl"
                  disabled={isSubmitting}
                  aria-invalid={errors.password ? "true" : undefined}
                  aria-describedby={errors.password ? "password-error" : undefined}
                  {...register("password")}
                />
                <Lock className="absolute start-3.5 top-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-pressed={showPassword}
                  aria-label={showPassword ? "إخفاء كلمة المرور" : "عرض كلمة المرور"}
                  className="absolute end-3.5 top-3.5 text-slate-400 hover:text-slate-600 focus:outline-none rounded-lg p-0.5"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p id="password-error" role="alert" className="text-xs text-rose-600 font-medium">{errors.password.message}</p>
              )}
            </div>

            <Button
              type="submit"
              variant="default"
              isLoading={isSubmitting}
              className="mt-2 w-full h-11 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-md shadow-slate-900/15"
            >
              {isSubmitting ? t("auth.loggingIn") : t("auth.loginButton")}
            </Button>
          </form>
        </div>

        {/* Security Notice */}
        <div className="mt-8 text-center text-xs text-slate-400 space-y-1">
          <p className="font-medium">بوابة دخول آمنة مخصصة لمنسوبي مصنع الأسياح</p>
          <div className="flex items-center justify-center gap-2 text-[11px] font-mono text-slate-400">
            <span>ZATCA Phase-2</span>
            <span>•</span>
            <span>FIFO Multi-Batch</span>
            <span>•</span>
            <span>256-bit Encryption</span>
          </div>
        </div>
      </div>
    </div>
  );
}
