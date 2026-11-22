import { useTranslation } from "react-i18next";
import { LogOut, Globe, User, Shield, CheckCircle2, Sparkles, Activity } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { CommandPalette } from "./CommandPalette";
import { NotificationBell } from "./NotificationBell";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface HeaderProps {
  onToggleSidebar?: () => void;
}

export function Header({ onToggleSidebar }: HeaderProps) {
  const { profile, role, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";

  const toggleLanguage = () => {
    const nextLang = isArabic ? "en" : "ar";
    i18n.changeLanguage(nextLang);
  };

  return (
    <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-slate-200/80 bg-white/90 backdrop-blur-md px-4 sm:px-6 shadow-[0_1px_3px_0_rgba(15,23,42,0.03)] transition-all">
      <div className="flex items-center gap-3.5">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="hidden md:flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/80 text-slate-700 hover:bg-slate-100/80 hover:text-slate-900 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500/20 active:scale-95"
            aria-label="Toggle Navigation"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        )}

        {/* Factory / App Logo & Name */}
        <div className="flex items-center gap-3">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 text-white font-bold text-xs tracking-wider shadow-sm ring-1 ring-white/10">
            <span className="font-mono">AS</span>
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-sky-500 ring-2 ring-white"></span>
            </span>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-900 tracking-tight leading-none">
                {t("shortAppName")}
              </span>
              <span className="hidden xl:inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200/60">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {isArabic ? "ZATCA متصل" : "ZATCA Online"}
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium mt-1">
              {isArabic ? "نظام إدارة مصنع الأسياح • الإصدار الصناعي 2026" : "Al-Asyah Industrial ERP • 2026 Edition"}
            </span>
          </div>
        </div>
      </div>

      {/* Middle: Command Palette trigger on Desktop */}
      <div className="hidden md:flex items-center">
        <CommandPalette />
      </div>

      {/* Right Controls (Language toggle, Notifications, Profile) */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        {/* Language Switcher */}
        <button
          onClick={toggleLanguage}
          className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-sky-500/20 active:scale-95"
          title="Toggle Language (العربية / English)"
        >
          <Globe className="h-3.5 w-3.5 text-sky-600" />
          <span>{isArabic ? "EN" : "عربي"}</span>
        </button>

        {/* Notification Bell */}
        <NotificationBell />

        {/* User Profile Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-9 items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-sky-500/20 active:scale-95">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-tr from-slate-100 to-slate-200 text-slate-800 font-bold text-xs ring-1 ring-slate-200/80">
                {profile?.full_name?.charAt(0) || <User className="h-3.5 w-3.5" />}
              </div>
              <span className="hidden sm:inline max-w-[120px] truncate font-medium">
                {profile?.full_name}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align={isArabic ? "start" : "end"}
            className="w-60 p-1.5 shadow-xl rounded-2xl border-slate-200/80"
          >
            <DropdownMenuLabel className="p-2.5">
              <p className="font-bold text-slate-900 text-sm">{profile?.full_name}</p>
              <p className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                {profile?.phone}
              </p>
              <div className="mt-2">
                <Badge
                  variant={role === "owner" ? "emerald" : "secondary"}
                  className="text-[10px] uppercase font-bold py-0.5 px-2.5"
                >
                  <Shield className="me-1 h-3 w-3" />
                  {role ? t(`roles.${role}`) : ""}
                </Badge>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-slate-100 my-1" />
            <DropdownMenuItem
              onClick={logout}
              className="text-rose-600 focus:bg-rose-50 focus:text-rose-700 cursor-pointer rounded-lg p-2 font-medium"
            >
              <LogOut className="me-2 h-4 w-4" />
              <span>{t("auth.logout")}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
