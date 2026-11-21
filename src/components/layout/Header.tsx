import { useTranslation } from "react-i18next";
import { LogOut, Globe, User, Shield } from "lucide-react";
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
    <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-industrial-border bg-white px-4 shadow-sm">
      <div className="flex items-center gap-3">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="hidden md:flex h-8 w-8 items-center justify-center rounded-md border border-industrial-border text-slate-700 hover:bg-slate-50"
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
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-industrial-primary text-white font-bold text-sm shadow-sm">
            AS
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-industrial-primary leading-tight">
              {t("shortAppName")}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              v3.1 • Phase 1
            </span>
          </div>
        </div>
      </div>

      {/* Middle: Command Palette trigger on Desktop */}
      <div className="hidden md:flex items-center">
        <CommandPalette />
      </div>

      {/* Right Controls (Language toggle, Notifications, Profile) */}
      <div className="flex items-center gap-2">
        {/* Language Switcher */}
        <button
          onClick={toggleLanguage}
          className="flex h-9 items-center gap-1.5 rounded-md border border-industrial-border bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-accent"
          title="Toggle Language (العربية / English)"
        >
          <Globe className="h-3.5 w-3.5 text-accent" />
          <span>{isArabic ? "EN" : "عربي"}</span>
        </button>

        {/* Notification Bell */}
        <NotificationBell />

        {/* User Profile Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-9 items-center gap-2 rounded-md border border-industrial-border bg-white px-2.5 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-accent">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                <User className="h-3.5 w-3.5" />
              </div>
              <span className="hidden sm:inline max-w-[120px] truncate">
                {profile?.full_name}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align={isArabic ? "start" : "end"}
            className="w-56 p-1 shadow-lg"
          >
            <DropdownMenuLabel className="p-2">
              <p className="font-semibold text-slate-900">{profile?.full_name}</p>
              <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                {profile?.phone}
              </p>
              <div className="mt-1.5">
                <Badge
                  variant={role === "owner" ? "emerald" : "secondary"}
                  className="text-[10px] uppercase font-bold"
                >
                  <Shield className="me-1 h-3 w-3" />
                  {role ? t(`roles.${role}`) : ""}
                </Badge>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={logout}
              className="text-rose-600 focus:bg-rose-50 focus:text-rose-700 cursor-pointer"
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
