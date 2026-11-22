import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import type { VanCustodyTransfer, Warehouse, Item, Vehicle } from "@/types/database";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Truck,
  ArrowRight,
  Plus,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  Building,
  Trash2,
  CheckCircle2,
} from "lucide-react";

export function VanCustodyPage() {
  const { t, i18n } = useTranslation();
  const { user, isOwner, isAccountant } = useAuth();
  const queryClient = useQueryClient();
  const isArabic = i18n.language === "ar";

  const [searchTerm, setSearchTerm] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [transferType, setTransferType] = useState<"load_to_van" | "return_from_van">("load_to_van");

  // Form State
  const [vanWarehouseId, setVanWarehouseId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<
    Array<{ item_id: string; quantity: number; unit_type: "carton" | "piece" }>
  >([]);

  // 1. Fetch Transfers
  const { data: transfers, isLoading } = useQuery<VanCustodyTransfer[]>({
    queryKey: ["van-transfers-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("van_custody_transfers")
        .select(`
          *,
          source_warehouse:warehouses!van_custody_transfers_source_warehouse_id_fkey(id, name_ar, code),
          target_warehouse:warehouses!van_custody_transfers_target_warehouse_id_fkey(id, name_ar, code),
          assigned_rep:users_profile!van_custody_transfers_assigned_rep_id_fkey(id, full_name),
          vehicle:vehicles(id, plate_number, name),
          items:van_custody_items(
            id,
            item_id,
            quantity,
            unit_type,
            pieces_count,
            item:items(id, sku, name_ar, name_en)
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as VanCustodyTransfer[];
    },
  });

  // 2. Fetch Vans
  const { data: vans } = useQuery<Warehouse[]>({
    queryKey: ["warehouses-vans-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("*")
        .eq("warehouse_type", "sales_van")
        .eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
    enabled: modalOpen,
  });

  // 3. Fetch Finished Goods
  const { data: finishedGoods } = useQuery<Item[]>({
    queryKey: ["items-fg-active-van"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .eq("item_type", "finished_good")
        .eq("is_active", true)
        .order("name_ar");
      if (error) throw error;
      return data || [];
    },
    enabled: modalOpen,
  });

  // Execute Transfer Mutation
  const executeTransferMutation = useMutation({
    mutationFn: async () => {
      if (!vanWarehouseId || lines.length === 0) {
        throw new Error(isArabic ? "يرجى اختيار السيارة وإضافة الأصناف" : "Please select van and items");
      }
      if (!user?.id) throw new Error("User not authenticated");

      const rpcName = transferType === "load_to_van" ? "rpc_transfer_to_van" : "rpc_return_from_van";

      const { data, error } = await supabase.rpc(rpcName, {
        p_van_warehouse_id: vanWarehouseId,
        p_items: lines,
        p_notes: notes || null,
        p_created_by: user.id,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(
        transferType === "load_to_van"
          ? isArabic ? `تم تحميل البضاعة لسيارة التوزيع ${data?.transfer_number || ""} بنجاح!` : "Goods loaded to van"
          : isArabic ? `تم استلام مرتجع العهدة من السيارة ${data?.transfer_number || ""} بنجاح!` : "Custody returned from van"
      );
      queryClient.invalidateQueries({ queryKey: ["van-transfers-list"] });
      setModalOpen(false);
      setVanWarehouseId("");
      setLines([]);
      setNotes("");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    },
  });

  const openLoadDialog = () => {
    setTransferType("load_to_van");
    setLines([{ item_id: "", quantity: 10, unit_type: "carton" }]);
    setModalOpen(true);
  };

  const openReturnDialog = () => {
    setTransferType("return_from_van");
    setLines([{ item_id: "", quantity: 5, unit_type: "carton" }]);
    setModalOpen(true);
  };

  const filteredTransfers = transfers?.filter((t) => {
    const term = searchTerm.toLowerCase();
    const repName = t.assigned_rep?.full_name?.toLowerCase() || "";
    return t.transfer_number.toLowerCase().includes(term) || repName.includes(term);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Truck className="h-6 w-6 text-sky-600" />
            <span>{t("sales.vanCustodyTitle")}</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            {t("sales.vanCustodySubtitle")}
          </p>
        </div>

        {(isOwner || isAccountant) && (
          <div className="flex items-center gap-2">
            <Button
              onClick={openReturnDialog}
              variant="outline"
              className="text-xs border-amber-300 text-amber-800 hover:bg-amber-50 min-h-[44px]"
            >
              <ArrowDownLeft className="me-1.5 h-4 w-4 text-amber-600" />
              <span>{t("sales.returnFromVan")}</span>
            </Button>

            <Button
              onClick={openLoadDialog}
              className="bg-slate-900 hover:bg-slate-800 text-white min-h-[44px]"
            >
              <ArrowUpRight className="me-1.5 h-4 w-4 text-sky-400" />
              <span>{t("sales.loadVan")}</span>
            </Button>
          </div>
        )}
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder={isArabic ? "بحث برقم الحركة أو اسم المندوب..." : "Search transfer # or rep..."}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="ps-9 bg-white"
        />
      </div>

      {/* Transfers Table */}
      <Card className="border-industrial-border bg-white shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold">
                <tr>
                  <th className="py-2.5 px-3">{t("sales.transferNumber")}</th>
                  <th className="py-2.5 px-3">{t("common.date")}</th>
                  <th className="py-2.5 px-3">نوع الحركة</th>
                  <th className="py-2.5 px-3">سيارة التوزيع</th>
                  <th className="py-2.5 px-3">المندوب المستلم</th>
                  <th className="py-2.5 px-3 text-center">عدد الأصناف</th>
                  <th className="py-2.5 px-3 text-center">{t("common.status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  [1, 2, 3].map((i) => (
                    <tr key={i}>
                      <td colSpan={7} className="py-4 px-3">
                        <Skeleton className="h-6 w-full" />
                      </td>
                    </tr>
                  ))
                ) : filteredTransfers?.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      لا توجد حركات نقل عهدة سيارات حتى الآن
                    </td>
                  </tr>
                ) : (
                  filteredTransfers?.map((tr) => (
                    <tr key={tr.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-3 font-mono font-bold text-sky-700">
                        {tr.transfer_number}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {tr.transfer_date}
                      </td>
                      <td className="py-2.5 px-3">
                        {tr.transfer_type === "load_to_van" ? (
                          <Badge variant="emerald" className="text-[10px]">
                            <ArrowUpRight className="me-1 h-3 w-3" />
                            تحميل للسيارة
                          </Badge>
                        ) : (
                          <Badge variant="amber" className="text-[10px]">
                            <ArrowDownLeft className="me-1 h-3 w-3" />
                            إرجاع للمستودع
                          </Badge>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800">
                        {tr.transfer_type === "load_to_van"
                          ? tr.target_warehouse?.name_ar
                          : tr.source_warehouse?.name_ar}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">
                        {tr.assigned_rep?.full_name || "-"}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono">
                        {tr.items?.length || 0} أصناف
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-400">
                          مكتمل ومرحل
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Transfer Dialog (Load / Return) */}
    </div>
  );
}
