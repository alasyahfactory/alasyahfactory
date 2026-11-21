import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/lib/supabase";
import { Vehicle, UserProfile, Warehouse } from "@/types/database";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Truck, Search, User, Loader2, CheckCircle2 } from "lucide-react";

const vehicleSchema = z.object({
  plate_number: z.string().min(2, "رقم لوحة السيارة مطلوب"),
  name: z.string().min(2, "اسم السيارة مطلوب"),
  assigned_rep_id: z.string().optional().nullable(),
  warehouse_id: z.string().optional().nullable(),
});

type VehicleFormData = z.infer<typeof vehicleSchema>;

export function VehiclesPage() {
  const { i18n } = useTranslation();
  const queryClient = useQueryClient();
  const isAr = i18n.language === "ar";

  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);

  // 1. Fetch Vehicles
  const { data: vehicles = [], isLoading } = useQuery<Vehicle[]>({
    queryKey: ["vehicles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select(`
          *,
          assigned_rep:users_profile!vehicles_assigned_rep_id_fkey(full_name, phone)
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Vehicle[];
    },
  });

  // 2. Fetch Sales Reps
  const { data: salesReps = [] } = useQuery<UserProfile[]>({
    queryKey: ["sales_reps"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users_profile")
        .select("*")
        .eq("role", "sales_rep")
        .eq("is_active", true);
      if (error) throw error;
      return data as UserProfile[];
    },
  });

  // 3. Fetch Sales Van Warehouses
  const { data: vanWarehouses = [] } = useQuery<Warehouse[]>({
    queryKey: ["van_warehouses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("*")
        .eq("warehouse_type", "sales_van");
      if (error) throw error;
      return data as Warehouse[];
    },
  });

  const form = useForm<VehicleFormData>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: {
      plate_number: "",
      name: "",
      assigned_rep_id: null,
      warehouse_id: null,
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (formData: VehicleFormData) => {
      if (editingVehicle) {
        const { error } = await supabase
          .from("vehicles")
          .update({
            plate_number: formData.plate_number,
            name: formData.name,
            assigned_rep_id: formData.assigned_rep_id || null,
            warehouse_id: formData.warehouse_id || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingVehicle.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("vehicles").insert([
          {
            plate_number: formData.plate_number,
            name: formData.name,
            assigned_rep_id: formData.assigned_rep_id || null,
            warehouse_id: formData.warehouse_id || null,
            is_active: true,
          },
        ]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      toast.success(editingVehicle ? "تم تحديث بيانات السيارة بنجاح" : "تمت إضافة السيارة بنجاح");
      setIsDialogOpen(false);
      setEditingVehicle(null);
      form.reset();
    },
    onError: (err: any) => {
      toast.error(err.message || "حدث خطأ أثناء حفظ السيارة");
    },
  });

  const openCreateDialog = () => {
    setEditingVehicle(null);
    form.reset({
      plate_number: "",
      name: "",
      assigned_rep_id: null,
      warehouse_id: null,
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle);
    form.reset({
      plate_number: vehicle.plate_number,
      name: vehicle.name,
      assigned_rep_id: vehicle.assigned_rep_id,
      warehouse_id: (vehicle as any).warehouse_id || null,
    });
    setIsDialogOpen(true);
  };

  const filteredVehicles = vehicles.filter((v) => {
    const q = searchQuery.toLowerCase();
    return (
      v.plate_number.toLowerCase().includes(q) ||
      v.name.toLowerCase().includes(q) ||
      (v.assigned_rep && v.assigned_rep.full_name.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {isAr ? "سيارات وشاحنات التوزيع" : "Delivery Vehicles"}
          </h1>
          <p className="text-sm text-slate-500">
            {isAr
              ? "إدارة أسطول فانات التوزيع وشاحنات النقل وربطها بالمندوبين والمستودعات المتنقلة"
              : "Manage delivery vans and trucks linked to sales reps and van inventory custody"}
          </p>
        </div>
        <Button onClick={openCreateDialog} className="bg-slate-900 text-white gap-2">
          <Plus className="w-4 h-4" />
          <span>{isAr ? "إضافة سيارة جديدة" : "Add Vehicle"}</span>
        </Button>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder={isAr ? "بحث باللوحة أو اسم السيارة أو المندوب..." : "Search vehicles..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ps-9"
            />
          </div>
          <div className="text-xs text-slate-500 font-medium">
            {isAr ? `إجمالي السيارات: ${vehicles.length}` : `Total Vehicles: ${vehicles.length}`}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            {isAr ? "أسطول التوزيع المسجل" : "Registered Fleet"}
          </CardTitle>
          <CardDescription>
            {isAr ? "ربط مصاريف التشغيل (6109) ومبيعات كل سيارة" : "Track delivery expenses (6109) and rep profitability"}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="w-36 font-semibold">{isAr ? "رقم اللوحة" : "Plate #"}</TableHead>
                  <TableHead className="font-semibold">{isAr ? "اسم وموديل السيارة" : "Vehicle Name"}</TableHead>
                  <TableHead className="w-56 font-semibold">{isAr ? "المندوب المسؤول" : "Assigned Rep"}</TableHead>
                  <TableHead className="w-24 text-center font-semibold">{isAr ? "الحالة" : "Status"}</TableHead>
                  <TableHead className="w-20 text-center font-semibold">{isAr ? "إجراء" : "Action"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-16 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-12 mx-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredVehicles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10 text-slate-500">
                      {isAr ? "لا توجد سيارات مسجلة" : "No vehicles registered"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredVehicles.map((v) => (
                    <TableRow key={v.id} className="hover:bg-slate-50/80">
                      <TableCell className="font-mono font-medium text-slate-900 tabular-nums">
                        <div className="flex items-center gap-2">
                          <Truck className="w-4 h-4 text-slate-400 shrink-0" />
                          <span>{v.plate_number}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium text-slate-900">
                        {v.name}
                      </TableCell>
                      <TableCell>
                        {v.assigned_rep ? (
                          <div className="flex items-center gap-1.5 text-xs text-slate-700">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                            <span>{v.assigned_rep.full_name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">{isAr ? "غير معين" : "Unassigned"}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className="bg-emerald-600 text-white gap-1 text-xs">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{isAr ? "جاهز للعمل" : "Active"}</span>
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button variant="ghost" size="sm" onClick={() => openEditDialog(v)} className="text-xs">
                          {isAr ? "تعديل" : "Edit"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add / Edit Vehicle Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingVehicle
                ? isAr ? "تعديل بيانات السيارة" : "Edit Vehicle"
                : isAr ? "إضافة سيارة جديدة للأسطول" : "Add New Vehicle"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={form.handleSubmit((d) => saveMutation.mutate(d))} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="plate_number">{isAr ? "رقم لوحة السيارة *" : "Plate Number *"}</Label>
              <Input
                id="plate_number"
                placeholder="أ ب ج 1234"
                {...form.register("plate_number")}
                className="font-mono"
              />
              {form.formState.errors.plate_number && (
                <p className="text-xs text-rose-600">{form.formState.errors.plate_number.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="veh_name">{isAr ? "اسم ونوع السيارة *" : "Vehicle Name / Model *"}</Label>
              <Input id="veh_name" placeholder="فان إيسوزو ديماكس 2024" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-xs text-rose-600">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="assigned_rep_id">{isAr ? "المندوب المسؤول" : "Assigned Sales Rep"}</Label>
              <select
                id="assigned_rep_id"
                {...form.register("assigned_rep_id")}
                className="w-full h-10 rounded border border-slate-200 bg-white px-3 text-sm focus:ring-1 focus:ring-slate-900"
              >
                <option value="">{isAr ? "-- بدون مندوب حالياً --" : "-- None --"}</option>
                {salesReps.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.full_name} ({r.phone})
                  </option>
                ))}
              </select>
            </div>

            <DialogFooter className="pt-4 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button type="submit" disabled={saveMutation.isPending} className="bg-slate-900 text-white gap-2">
                {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{editingVehicle ? (isAr ? "حفظ التعديلات" : "Update") : (isAr ? "إضافة السيارة" : "Add Vehicle")}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
