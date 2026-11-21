import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import type { AuditLog } from "@/types/database";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShieldCheck, Search, Filter, ShieldAlert } from "lucide-react";

export function AuditLogPage() {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  const loadAuditLogs = async () => {
    try {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*, user:users_profile(*)")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setLogs((data as AuditLog[]) || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load audit logs";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAuditLogs();
  }, []);

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      (log.action && log.action.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (log.details && log.details.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (log.user?.full_name && log.user.full_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (log.table_name && log.table_name.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesAction = actionFilter === "all" || log.action === actionFilter;

    return matchesSearch && matchesAction;
  });

  const getActionBadgeVariant = (action: string) => {
    if (action.includes("DELETE") || action.includes("DISABLE")) return "rose";
    if (action.includes("CREATE") || action.includes("POST")) return "emerald";
    if (action.includes("UPDATE") || action.includes("RESET")) return "amber";
    if (action.includes("LOCK")) return "purple";
    return "secondary";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-industrial-primary sm:text-2xl flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-purple-600" />
          <span>{t("audit.title")}</span>
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-slate-500">
          {t("audit.subtitle")}
        </p>
      </div>

      <Card>
        <CardHeader className="p-4 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {/* Search */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute start-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder={isArabic ? "ابحث في الإجراءات أو التفاصيل أو المستخدم..." : "Search actions, details, user..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="ps-9 h-9"
              />
            </div>

            {/* Filter */}
            <div className="flex items-center gap-2">
              <Label className="text-xs text-slate-500 whitespace-nowrap">
                {t("audit.filterAction")}:
              </Label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-44 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.all")}</SelectItem>
                  <SelectItem value="USER_CREATED">USER_CREATED</SelectItem>
                  <SelectItem value="PASSWORD_RESET">PASSWORD_RESET</SelectItem>
                  <SelectItem value="FORCE_LOGOUT_AND_DISABLE">FORCE_LOGOUT_AND_DISABLE</SelectItem>
                  <SelectItem value="USER_SOFT_DELETED">USER_SOFT_DELETED</SelectItem>
                  <SelectItem value="USER_HARD_DELETED">USER_HARD_DELETED</SelectItem>
                  <SelectItem value="FACTORY_SETTINGS_UPDATED">FACTORY_SETTINGS_UPDATED</SelectItem>
                  <SelectItem value="FISCAL_PERIOD_LOCKED">FISCAL_PERIOD_LOCKED</SelectItem>
                  <SelectItem value="FISCAL_PERIOD_UNLOCKED">FISCAL_PERIOD_UNLOCKED</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">
              {isArabic ? "لا توجد سجلات مطابقة" : "No audit records found"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-industrial-border bg-slate-50/70 text-slate-600 font-semibold">
                    <th className="p-3 text-start">{t("audit.timestamp")}</th>
                    <th className="p-3 text-start">{t("audit.user")}</th>
                    <th className="p-3 text-start">{t("audit.action")}</th>
                    <th className="p-3 text-start">{t("audit.table")}</th>
                    <th className="p-3 text-start">{t("audit.details")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-industrial-border">
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-mono tabular-nums text-slate-500 whitespace-nowrap" dir="ltr">
                        {new Date(log.created_at).toLocaleString(
                          isArabic ? "ar-SA" : "en-US",
                          {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          }
                        )}
                      </td>
                      <td className="p-3">
                        {log.user ? (
                          <div>
                            <span className="font-semibold text-slate-800">
                              {log.user.full_name}
                            </span>
                            <span className="block text-[10px] text-slate-400 font-mono">
                              {log.user.role}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-mono text-[11px]">System / Trigger</span>
                        )}
                      </td>
                      <td className="p-3">
                        <Badge
                          variant={getActionBadgeVariant(log.action)}
                          className="font-mono text-[10px]"
                        >
                          {log.action}
                        </Badge>
                      </td>
                      <td className="p-3 font-mono text-slate-600 text-xs">
                        {log.table_name || "—"}
                      </td>
                      <td className="p-3 text-slate-700 max-w-xs sm:max-w-md truncate">
                        {log.details || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
