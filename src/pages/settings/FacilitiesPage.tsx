import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import type { Warehouse, Tank, WarehouseType, TankStatus, UserProfile, Vehicle } from "@/types/database";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Warehouse as WarehouseIcon, Cylinder, Plus, Truck, Edit, AlertCircle } from "lucide-react";

// Warehouse Schema
const warehouseSchema = z.object({
  code: z.string().min(2, "كود المستودع مطلوب (مثال: WH-RAW-01)"),
  name_ar: z.string().min(2, "اسم المستودع بالعربية مطلوب"),
  name_en: z.string().min(2, "اسم المستودع بالإنجليزية مطلوب"),
  warehouse_type: z.enum(["raw_materials", "packaging", "finished_goods", "sales_van"] as const),
  assigned_rep_id: z.string().nullable().optional(),
  plate_number: z.string().optional(),
});

type WarehouseFormData = z.infer<typeof warehouseSchema>;

// Tank Schema
const tankSchema = z.object({
  tank_code: z.string().min(2, "كود التانك مطلوب (مثال: TK-101)"),
  name_ar: z.string().min(2, "اسم التانك بالعربية مطلوب"),
  name_en: z.string().min(2, "اسم التانك بالإنجليزية مطلوب"),
  capacity_liters: z.coerce.number().min(10, "السعة باللتر يجب ألا تقل عن 10 لتر"),
  status: z.enum(["empty", "mixing", "pending_qc", "ready_for_packaging", "rework"] as const),
});

type TankFormData = z.infer<typeof tankSchema>;

export function FacilitiesPage() {
  const { user, role } = useAuth();
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";

  const [activeTab, setActiveTab] = useState("warehouses");
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [tanks, setTanks] = useState<Tank[]>([]);
  const [reps, setReps] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [isWarehouseModalOpen, setIsWarehouseModalOpen] = useState(false);
  const [isTankModalOpen, setIsTankModalOpen] = useState(false);
  const [editingTank, setEditingTank] = useState<Tank | null>(null);

  // Forms
  const {
    register: regWarehouse,
    handleSubmit: handleSubWarehouse,
    setValue: setValWarehouse,
    watch: watchWarehouse,
    reset: resetWarehouse,
    formState: { errors: errWarehouse, isSubmitting: subWarehouse },
  } = useForm<WarehouseFormData>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: {
      code: "",
      name_ar: "",
      name_en: "",
      warehouse_type: "raw_materials",
      assigned_rep_id: null,
      plate_number: "",
    },
  });

  const selectedWarehouseType = watchWarehouse("warehouse_type");
  const selectedRepId = watchWarehouse("assigned_rep_id");

  const {
    register: regTank,
    handleSubmit: handleSubTank,
    setValue: setValTank,
    watch: watchTank,
    reset: resetTank,
    formState: { errors: errTank, isSubmitting: subTank },
  } = useForm<TankFormData>({
    resolver: zodResolver(tankSchema),
    defaultValues: {
      tank_code: "",
      name_ar: "",
      name_en: "",
      capacity_liters: 1000,
      status: "empty",
    },
  });

  const selectedTankStatus = watchTank("status");

  const loadData = async () => {
    try {
      const [
        { data: whData },
        { data: tkData },
        { data: repData },
      ] = await Promise.all([
        supabase
          .from("warehouses")
          .select("*, vehicle:vehicles(*), assigned_rep:users_profile(*)")
          .order("created_at", { ascending: true }),
        supabase.from("tanks").select("*").order("tank_code", { ascending: true }),
        supabase
          .from("users_profile")
          .select("*")
          .eq("role", "sales_rep")
          .eq("is_active", true),
      ]);

      setWarehouses((whData as Warehouse[]) || []);
      setTanks((tkData as Tank[]) || []);
      setReps((repData as UserProfile[]) || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load facilities";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Warehouse Submit
  const onSubmitWarehouse = async (data: WarehouseFormData) => {
    try {
      let vehicleId: string | null = null;

      // If it's a sales van and plate number is given, create or get vehicle
      if (data.warehouse_type === "sales_van" && data.plate_number) {
        const { data: vData, error: vErr } = await supabase
          .from("vehicles")
          .insert({
            plate_number: data.plate_number,
            name: `${data.name_ar} (${data.plate_number})`,
            assigned_rep_id: data.assigned_rep_id || null,
          })
          .select()
          .single();

        if (vErr && !vErr.message.includes("duplicate")) {
          throw vErr;
        }
        if (vData) {
          vehicleId = vData.id;
        }
      }

      const { error } = await supabase.from("warehouses").insert({
        code: data.code,
        name_ar: data.name_ar,
        name_en: data.name_en,
        warehouse_type: data.warehouse_type,
        vehicle_id: vehicleId,
        assigned_rep_id: data.assigned_rep_id || null,
      });

      if (error) throw error;

      if (user?.id) {
        await supabase.from("audit_logs").insert({
          user_id: user.id,
          action: "WAREHOUSE_CREATED",
          table_name: "warehouses",
          record_id: data.code,
          details: `Created warehouse ${data.name_ar} (${data.warehouse_type})`,
        });
      }

      toast.success(isArabic ? "تم إضافة المستودع بنجاح" : "Warehouse created");
      setIsWarehouseModalOpen(false);
      resetWarehouse();
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error creating warehouse";
      toast.error(msg);
    }
  };

  // Tank Submit
  const onSubmitTank = async (data: TankFormData) => {
    try {
      if (editingTank) {
        const { error } = await supabase
          .from("tanks")
          .update({
            name_ar: data.name_ar,
            name_en: data.name_en,
            capacity_liters: data.capacity_liters,
            status: data.status,
          })
          .eq("id", editingTank.id);

        if (error) throw error;

        toast.success(isArabic ? "تم تحديث التانك بنجاح" : "Tank updated");
        setEditingTank(null);
      } else {
        const { error } = await supabase.from("tanks").insert({
          tank_code: data.tank_code,
          name_ar: data.name_ar,
          name_en: data.name_en,
          capacity_liters: data.capacity_liters,
          status: data.status,
        });

        if (error) throw error;

        toast.success(isArabic ? "تم إضافة التانك بنجاح" : "Tank added");
        setIsTankModalOpen(false);
      }

      if (user?.id) {
        await supabase.from("audit_logs").insert({
          user_id: user.id,
          action: editingTank ? "TANK_UPDATED" : "TANK_CREATED",
          table_name: "tanks",
          record_id: data.tank_code,
          details: `Owner/Supervisor saved tank ${data.tank_code} (Status: ${data.status})`,
        });
      }

      resetTank();
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error saving tank";
      toast.error(msg);
    }
  };

  const openEditTank = (tank: Tank) => {
    setEditingTank(tank);
    resetTank({
      tank_code: tank.tank_code,
      name_ar: tank.name_ar,
      name_en: tank.name_en,
      capacity_liters: Number(tank.capacity_liters),
      status: tank.status,
    });
  };

  const getTankBadgeVariant = (status: TankStatus) => {
    switch (status) {
      case "empty":
        return "emerald";
      case "mixing":
        return "amber";
      case "pending_qc":
        return "secondary";
      case "ready_for_packaging":
        return "emerald";
      case "rework":
        return "purple";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-industrial-primary sm:text-2xl flex items-center gap-2">
            <WarehouseIcon className="h-6 w-6 text-sky-600" />
            <span>{isArabic ? "المستودعات وتانكات الخلط" : "Facilities & Mixing Tanks"}</span>
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            {isArabic
              ? "إدارة مستودعات الخامات، التعبئة، التام، وسيارات التوزيع وتانكات الإنتاج"
              : "Manage raw, packaging & finished goods warehouses, sales vans, and bulk tanks"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === "warehouses" ? (
            <Button
              onClick={() => {
                resetWarehouse();
                setIsWarehouseModalOpen(true);
              }}
              className="bg-industrial-primary text-white"
            >
              <Plus className="me-2 h-4 w-4" />
              <span>{t("facilities.createWarehouse")}</span>
            </Button>
          ) : (
            <Button
              onClick={() => {
                setEditingTank(null);
                resetTank();
                setIsTankModalOpen(true);
              }}
              className="bg-industrial-primary text-white"
            >
              <Plus className="me-2 h-4 w-4" />
              <span>{t("facilities.createTank")}</span>
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 max-w-sm">
          <TabsTrigger value="warehouses" className="gap-2">
            <WarehouseIcon className="h-4 w-4" />
            <span>{t("facilities.warehousesTitle")}</span>
          </TabsTrigger>
          <TabsTrigger value="tanks" className="gap-2">
            <Cylinder className="h-4 w-4" />
            <span>{t("facilities.tanksTitle")}</span>
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: WAREHOUSES */}
        <TabsContent value="warehouses" className="pt-4">
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base font-semibold">
                {isArabic ? "المستودعات وسيارات التوزيع المعتمدة" : "Registered Warehouses & Vans"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 space-y-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : warehouses.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-400">
                  {isArabic ? "لا توجد مستودعات مضافة بعد" : "No warehouses found"}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-start text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-industrial-border bg-slate-50/70 text-slate-600 font-semibold">
                        <th className="p-3 text-start">{t("facilities.code")}</th>
                        <th className="p-3 text-start">{t("common.arabicName")}</th>
                        <th className="p-3 text-start">{t("common.englishName")}</th>
                        <th className="p-3 text-start">{t("facilities.type")}</th>
                        <th className="p-3 text-start">{t("facilities.assignedRep")}</th>
                        <th className="p-3 text-start">{t("common.status")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-industrial-border">
                      {warehouses.map((w) => (
                        <tr key={w.id} className="hover:bg-slate-50/50">
                          <td className="p-3 font-mono font-bold text-slate-900" dir="ltr">
                            {w.code}
                          </td>
                          <td className="p-3 font-medium text-slate-900">{w.name_ar}</td>
                          <td className="p-3 text-slate-600" dir="ltr">
                            {w.name_en}
                          </td>
                          <td className="p-3">
                            <Badge
                              variant={w.warehouse_type === "sales_van" ? "secondary" : "outline"}
                              className="text-[11px]"
                            >
                              {w.warehouse_type === "sales_van" && (
                                <Truck className="me-1 h-3 w-3" />
                              )}
                              {w.warehouse_type}
                            </Badge>
                          </td>
                          <td className="p-3">
                            {w.assigned_rep ? (
                              <span className="font-semibold text-slate-800">
                                {w.assigned_rep.full_name}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="p-3">
                            <Badge variant="emerald" className="text-[10px]">
                              {t("common.active")}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: TANKS */}
        <TabsContent value="tanks" className="pt-4">
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base font-semibold">
                {isArabic ? "تانكات خلط السائب والإنتاج" : "Bulk Mixing Tanks"}
              </CardTitle>
              <CardDescription className="text-xs">
                {isArabic
                  ? "السعة باللتر، الحالة التشغيلية وبوابة الجودة (QC Gate)"
                  : "Tank capacity in liters, QC gate state & batch tracking"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 space-y-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : tanks.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-400">
                  {isArabic ? "لا توجد تانكات مضافة بعد" : "No tanks found"}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-start text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-industrial-border bg-slate-50/70 text-slate-600 font-semibold">
                        <th className="p-3 text-start">{t("facilities.tankCode")}</th>
                        <th className="p-3 text-start">{t("common.arabicName")}</th>
                        <th className="p-3 text-start">{t("common.englishName")}</th>
                        <th className="p-3 text-start">{t("facilities.capacityLiters")}</th>
                        <th className="p-3 text-start">{t("facilities.currentQty")}</th>
                        <th className="p-3 text-start">{t("common.status")}</th>
                        <th className="p-3 text-end">{t("common.actions")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-industrial-border">
                      {tanks.map((tank) => (
                        <tr key={tank.id} className="hover:bg-slate-50/50">
                          <td className="p-3 font-mono font-bold text-slate-900" dir="ltr">
                            {tank.tank_code}
                          </td>
                          <td className="p-3 font-medium text-slate-900">{tank.name_ar}</td>
                          <td className="p-3 text-slate-600" dir="ltr">
                            {tank.name_en}
                          </td>
                          <td className="p-3 font-mono tabular-nums text-slate-800">
                            {Number(tank.capacity_liters).toLocaleString()} {t("common.liters")}
                          </td>
                          <td className="p-3 font-mono tabular-nums text-slate-600">
                            {Number(tank.current_qty_grams).toLocaleString()} جم
                          </td>
                          <td className="p-3">
                            <Badge
                              variant={getTankBadgeVariant(tank.status)}
                              className="text-[11px]"
                            >
                              {t(`facilities.tankStatus.${tank.status}`)}
                            </Badge>
                          </td>
                          <td className="p-3 text-end">
                            <button
                              onClick={() => openEditTank(tank)}
                              className="p-1.5 text-slate-600 hover:text-accent rounded hover:bg-slate-100"
                              title={t("common.edit")}
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* CREATE WAREHOUSE DIALOG */}
      <Dialog open={isWarehouseModalOpen} onOpenChange={setIsWarehouseModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("facilities.createWarehouse")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubWarehouse(onSubmitWarehouse)} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="wh_code">{t("facilities.code")}</Label>
              <Input
                id="wh_code"
                dir="ltr"
                placeholder="WH-RAW-01"
                className="font-mono"
                disabled={subWarehouse}
                {...regWarehouse("code")}
              />
              {errWarehouse.code && (
                <p className="text-xs text-rose-600">{errWarehouse.code.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wh_name_ar">{t("common.arabicName")}</Label>
              <Input
                id="wh_name_ar"
                placeholder="مستودع المواد الخام الرئيسي"
                disabled={subWarehouse}
                {...regWarehouse("name_ar")}
              />
              {errWarehouse.name_ar && (
                <p className="text-xs text-rose-600">{errWarehouse.name_ar.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wh_name_en">{t("common.englishName")}</Label>
              <Input
                id="wh_name_en"
                dir="ltr"
                placeholder="Main Raw Materials Warehouse"
                disabled={subWarehouse}
                {...regWarehouse("name_en")}
              />
              {errWarehouse.name_en && (
                <p className="text-xs text-rose-600">{errWarehouse.name_en.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wh_type">{t("facilities.type")}</Label>
              <Select
                value={selectedWarehouseType}
                onValueChange={(val) => setValWarehouse("warehouse_type", val as WarehouseType)}
                disabled={subWarehouse}
              >
                <SelectTrigger id="wh_type">
                  <SelectValue placeholder="اختر نوع المستودع" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="raw_materials">مستودع مواد خام (Raw Materials)</SelectItem>
                  <SelectItem value="packaging">مستودع عبوات وتعبئة (Packaging)</SelectItem>
                  <SelectItem value="finished_goods">مستودع المنتج التام (Finished Goods)</SelectItem>
                  <SelectItem value="sales_van">سيارة توزيع مندوب (Sales Van)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedWarehouseType === "sales_van" && (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="wh_plate">{t("facilities.plateNumber")}</Label>
                  <Input
                    id="wh_plate"
                    placeholder="أ ب ج 1234"
                    disabled={subWarehouse}
                    {...regWarehouse("plate_number")}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="wh_rep">{t("facilities.assignedRep")}</Label>
                  <Select
                    value={selectedRepId || "none"}
                    onValueChange={(val) => setValWarehouse("assigned_rep_id", val === "none" ? null : val)}
                    disabled={subWarehouse}
                  >
                    <SelectTrigger id="wh_rep">
                      <SelectValue placeholder="اختر مندوب المبيعات" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">بدون تعيين حالياً</SelectItem>
                      {reps.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.full_name} ({r.phone})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsWarehouseModalOpen(false)}
                disabled={subWarehouse}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                variant="default"
                isLoading={subWarehouse}
                className="bg-industrial-primary text-white"
              >
                {t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* CREATE / EDIT TANK DIALOG */}
      <Dialog
        open={isTankModalOpen || !!editingTank}
        onOpenChange={(open) => {
          if (!open) {
            setIsTankModalOpen(false);
            setEditingTank(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingTank ? t("common.edit") + " " + editingTank.tank_code : t("facilities.createTank")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubTank(onSubmitTank)} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="tk_code">{t("facilities.tankCode")}</Label>
              <Input
                id="tk_code"
                dir="ltr"
                placeholder="TK-01"
                className="font-mono uppercase"
                disabled={!!editingTank || subTank}
                {...regTank("tank_code")}
              />
              {errTank.tank_code && (
                <p className="text-xs text-rose-600">{errTank.tank_code.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tk_name_ar">{t("common.arabicName")}</Label>
              <Input
                id="tk_name_ar"
                placeholder="تانك خلط رقم 1 (سائل غسيل)"
                disabled={subTank}
                {...regTank("name_ar")}
              />
              {errTank.name_ar && (
                <p className="text-xs text-rose-600">{errTank.name_ar.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tk_name_en">{t("common.englishName")}</Label>
              <Input
                id="tk_name_en"
                dir="ltr"
                placeholder="Mixing Tank 01"
                disabled={subTank}
                {...regTank("name_en")}
              />
              {errTank.name_en && (
                <p className="text-xs text-rose-600">{errTank.name_en.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tk_capacity">{t("facilities.capacityLiters")}</Label>
              <Input
                id="tk_capacity"
                type="number"
                tabularNums
                placeholder="2000"
                disabled={subTank}
                {...regTank("capacity_liters")}
              />
              {errTank.capacity_liters && (
                <p className="text-xs text-rose-600">{errTank.capacity_liters.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tk_status">{t("common.status")}</Label>
              <Select
                value={selectedTankStatus}
                onValueChange={(val) => setValTank("status", val as TankStatus)}
                disabled={subTank}
              >
                <SelectTrigger id="tk_status">
                  <SelectValue placeholder="اختر حالة التانك" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="empty">فارغ وجاهز للخلط (Empty & Clean)</SelectItem>
                  <SelectItem value="mixing">قيد الخلط (Mixing in Progress)</SelectItem>
                  <SelectItem value="pending_qc">بانتظار فحص الجودة (Pending QC Gate)</SelectItem>
                  <SelectItem value="ready_for_packaging">معتمد وجاهز للتعبئة (Approved for Bottling)</SelectItem>
                  <SelectItem value="rework">إصلاح خلطة (Under Rework)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsTankModalOpen(false);
                  setEditingTank(null);
                }}
                disabled={subTank}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                variant="default"
                isLoading={subTank}
                className="bg-industrial-primary text-white"
              >
                {t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
