import { useEffect, useState } from "react";
import { Bell, Check, Info, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import type { Notification } from "@/types/database";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function NotificationBell() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  // Fetch initial notifications
  useEffect(() => {
    if (!user?.id) return;

    async function loadNotifications() {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (data) {
        const notifList = data as Notification[];
        setNotifications(notifList);
        setUnreadCount(notifList.filter((n: Notification) => !n.is_read).length);
      }
    }

    loadNotifications();

    // Live subscription to notifications table
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload: { new: Notification }) => {
          const newNotif = payload.new;
          setNotifications((prev) => [newNotif, ...prev.slice(0, 9)]);
          setUnreadCount((c) => c + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const markAllAsRead = async () => {
    if (!user?.id || unreadCount === 0) return;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);

    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const getIcon = (type: Notification["type"]) => {
    switch (type) {
      case "success":
        return <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />;
      case "error":
        return <XCircle className="h-4 w-4 text-rose-500 shrink-0" />;
      default:
        return <Info className="h-4 w-4 text-sky-500 shrink-0" />;
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="relative flex h-9 w-9 items-center justify-center rounded-md border border-industrial-border bg-white text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-accent"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -end-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white tabular-nums">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={isArabic ? "start" : "end"}
        className="w-80 p-0 shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-industrial-border p-3">
          <DropdownMenuLabel className="p-0 text-sm font-semibold">
            {isArabic ? "التنبيهات الحية" : "Live Notifications"}
          </DropdownMenuLabel>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-xs text-accent hover:underline flex items-center gap-1"
            >
              <Check className="h-3 w-3" />
              {isArabic ? "تحديد الكل كمقروء" : "Mark all read"}
            </button>
          )}
        </div>

        <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">
              {isArabic ? "لا توجد تنبيهات جديدة" : "No new notifications"}
            </div>
          ) : (
            notifications.map((n) => (
              <DropdownMenuItem
                key={n.id}
                className={`flex items-start gap-2.5 p-3 text-xs cursor-pointer ${
                  !n.is_read ? "bg-sky-50/50 font-medium" : ""
                }`}
              >
                {getIcon(n.type)}
                <div className="flex-1 space-y-0.5">
                  <p className="font-semibold text-slate-900">
                    {isArabic ? n.title_ar : n.title_en}
                  </p>
                  <p className="text-slate-500">
                    {isArabic ? n.message_ar : n.message_en}
                  </p>
                  <span className="text-[10px] text-slate-400 tabular-nums">
                    {new Date(n.created_at).toLocaleTimeString(
                      isArabic ? "ar-SA" : "en-US",
                      { hour: "2-digit", minute: "2-digit" }
                    )}
                  </span>
                </div>
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
