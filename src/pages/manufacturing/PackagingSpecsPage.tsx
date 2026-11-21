import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import type { PackagingSpec, Item } from "@/types/database";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Layers,
  Plus,
  Search,
  PackageCheck,
  Box,
  Tag,
  Droplets,
  Container,
} from "lucide-react";

export function PackagingSpecsPage() {
  const { t, i18n } = useTranslation();
  const { isOwner } = useAuth();
  const queryClient = useQueryClient();
  const isArabic = i18n.language === "ar";

  const [searchTerm, setSearchTerm] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Form State
  const [code, setCode] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [finishedGoodId, setFinishedGoodId] = useState("");
  const [bulkItemId, setBulkItemId] = useState("");
  const [volumePerUnitGrams, setVolumePerUnitGrams] = useState<number>(5000);
  const [bottleItemId, setBottleItemId] = useState("");
  const [frontStickerItemId, setFrontStickerItemId] = useState("");
  const [backStickerItemId, setBackStickerItemId] = useState("");
  const [cartonItemId, setCartonItemId] = useState("");
  const [piecesPerCarton, setPiecesPerCarton] = useState<number>(4);

  // 1. Fetch Packaging Specs with joined items
  const { data: specs, isLoading } = useQuery<PackagingSpec[]>({
    queryKey: ["packaging-specs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("packaging_specs")
        .select(`
          *,
          finished_good:items!packaging_specs_finished_good_id_fkey(id, sku, name_ar, name_en),
          bulk_item:items!packaging_specs_bulk_item_id_fkey(id, sku, name_ar, name_en),
          bottle_item:items!packaging_specs_bottle_item_id_fkey(id, sku, name_ar, name_en),
          front_sticker_item:items!packaging_specs_front_sticker_item_id_fkey(id, sku, name_ar, name_en),
          back_sticker_item:items!packaging_specs_back_sticker_item_id_fkey(id, sku, name_ar, name_en),
          carton_item:items!packaging_specs_carton_item_id_fkey(id, sku, name_ar, name_en)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as PackagingSpec[];
    },
  });

  // 2. Fetch Items for selection dropdowns
  const { data: allItems } = useQuery<Item[]>({
    queryKey: ["items-all-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .eq("is_active", true)
        .order("name_ar");
      if (error) throw error;
      return data || [];
    },
    enabled: createModalOpen,
  });

  const finishedGoods = allItems?.filter((it) => it.item_type === "finished_good") || [];
  const bulkItems = allItems?.filter((it) => it.item_type === "bulk_in_tank") || [];
  const packagingMaterials = allItems?.filter((it) => it.item_type === "packaging") || [];

  // Create Mutation
  const createSpecMutation = useMutation({
    mutationFn: async () => {
      if (!code || !nameAr || !finishedGoodId || !bulkItemId || !bottleItemId) {
        throw new Error(isArabic ? "يرجى تعبئة الحقول الإلزامية المطلوبة" : "Please fill all required fields");
      }

      const { data, error } = await supabase
        .from("packaging_specs")
        .insert({
          code,
          name_ar: nameAr,
          name_en: nameEn || nameAr,
          finished_good_id: finishedGoodId,
          bulk_item_id: bulkItemId,
          volume_per_unit_grams: volumePerUnitGrams,
          bottle_item_id: bottleItemId,
          front_sticker_item_id: frontStickerItemId || null,
          back_sticker_item_id: backStickerItemId || null,
          carton_item_id: cartonItemId || null,
          pieces_per_carton: piecesPerCarton,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(isArabic ? "تم حفظ مواصفة التعبئة بنجاح" : "Packaging spec saved successfully");
      queryClient.invalidateQueries({ queryKey: ["packaging-specs"] });
      setCreateModalOpen(false);
      // Reset form
      setCode("");
      setNameAr("");
      setNameEn("");
      setFinishedGoodId("");
      setBulkItemId("");
      setBottleItemId("");
      setFrontStickerItemId("");
      setBackStickerItemId("");
      setCartonItemId("");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    },
  });

  const filteredSpecs = specs?.filter((s) => {
    const term = searchTerm.toLowerCase();
    return (
      s.code.toLowerCase().includes(term) ||
      s.name_ar.toLowerCase().includes(term) ||
      s.name_en.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Layers className="h-6 w-6 text-sky-600" />
            <span>{t("manufacturing.specsTitle")}</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            {t("manufacturing.specsSubtitle")}
          </p>
        </div>

        {isOwner && (
          <Button
            onClick={() => setCreateModalOpen(true)}
            className="bg-slate-900 hover:bg-slate-800 text-white min-h-[44px]"
          >
            <Plus className="me-2 h-4 w-4" />
            <span>{t("manufacturing.createSpec")}</span>
          </Button>
        )}
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder={isArabic ? "بحث بكود أو اسم المواصفة..." : "Search specs by code or name..."}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="ps-9 bg-white"
        />
      </div>

      {/* Grid of Specs */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      ) : filteredSpecs?.length === 0 ? (
        <Card className="text-center py-12 border-dashed">
          <Layers className="h-12 w-12 mx-auto text-slate-300 mb-3" />
          <h3 className="font-semibold text-slate-700">
            {isArabic ? "لا توجد مواصفات تعبئة مسجلة" : "No packaging specs found"}
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            {isArabic
              ? "قم بإضافة مواصفة تعبئة لربط السائل السائب بالعبوات والاستيكرات والمنتج التام"
              : "Create packaging specs to link tank bulk to bottles, stickers and finished goods"}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSpecs?.map((spec) => {
            const liters = (spec.volume_per_unit_grams / 1000).toFixed(1);

            return (
              <Card
                key={spec.id}
                className="border-industrial-border bg-white shadow-sm hover:shadow-md transition-shadow"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono text-xs font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-100">
                        {spec.code}
                      </span>
                      <CardTitle className="text-base font-bold mt-2 text-slate-900">
                        {isArabic ? spec.name_ar : spec.name_en}
                      </CardTitle>
                      <CardDescription className="text-xs line-clamp-1 mt-0.5">
                        {isArabic ? spec.name_en : spec.name_ar}
                      </CardDescription>
                    </div>
                    <Badge variant={spec.is_active ? "emerald" : "outline"} className="text-[10px]">
                      {spec.is_active ? t("common.active") : t("common.inactive")}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 pt-0 text-xs">
                  <div className="space-y-1.5 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 flex items-center gap-1.5">
                        <PackageCheck className="h-3.5 w-3.5 text-emerald-600" />
                        {t("manufacturing.finishedGood")}:
                      </span>
                      <span className="font-bold text-slate-900 truncate max-w-[160px]">
                        {spec.finished_good ? (isArabic ? spec.finished_good.name_ar : spec.finished_good.name_en) : "-"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 flex items-center gap-1.5">
                        <Droplets className="h-3.5 w-3.5 text-sky-600" />
                        {t("manufacturing.bulkItem")}:
                      </span>
                      <span className="font-semibold text-slate-800 truncate max-w-[160px]">
                        {spec.bulk_item ? (isArabic ? spec.bulk_item.name_ar : spec.bulk_item.name_en) : "-"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 flex items-center gap-1.5">
                        <Container className="h-3.5 w-3.5 text-amber-600" />
                        {t("manufacturing.volumePerUnit")}:
                      </span>
                      <span className="font-mono font-bold tabular-nums text-slate-900">
                        {liters} لتر ({spec.volume_per_unit_grams} جم)
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 flex items-center gap-1.5">
                        <Box className="h-3.5 w-3.5 text-slate-600" />
                        {t("manufacturing.piecesPerCarton")}:
                      </span>
                      <span className="font-mono font-bold tabular-nums text-slate-900">
                        {spec.pieces_per_carton} عبوة / كرتون
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-2 space-y-1 text-[11px] text-slate-600">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="text-slate-400 font-medium">العبوة:</span>
                      <span className="truncate">{spec.bottle_item ? (isArabic ? spec.bottle_item.name_ar : spec.bottle_item.name_en) : "-"}</span>
                    </div>
                    {spec.front_sticker_item && (
                      <div className="flex items-center gap-1.5 truncate">
                        <Tag className="h-3 w-3 text-slate-400" />
                        <span className="truncate">{isArabic ? spec.front_sticker_item.name_ar : spec.front_sticker_item.name_en}</span>
                      </div>
                    )}
                    {spec.carton_item && (
                      <div className="flex items-center gap-1.5 truncate">
                        <Box className="h-3 w-3 text-slate-400" />
                        <span className="truncate">{isArabic ? spec.carton_item.name_ar : spec.carton_item.name_en}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Packaging Spec Dialog */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Layers className="h-5 w-5 text-sky-600" />
              <span>{t("manufacturing.createSpec")}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              اربط صنف المنتج التام بالسائل السائب في التانك ومواد التعبئة (العبوة، الاستيكرات، والكرتون)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-2 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-semibold">{t("manufacturing.specCode")} *</Label>
                <Input
                  placeholder="مثال: SPEC-DW-5L"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="mt-1 font-mono uppercase"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">{t("common.arabicName")} *</Label>
                <Input
                  placeholder="مثال: مواصفة تعبئة جركل 5 لتر"
                  value={nameAr}
                  onChange={(e) => setNameAr(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">{t("common.englishName")}</Label>
                <Input
                  placeholder="5L Gallon Packaging Spec"
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">{t("manufacturing.finishedGood")} *</Label>
                <Select value={finishedGoodId} onValueChange={setFinishedGoodId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="اختر المنتج التام..." />
                  </SelectTrigger>
                  <SelectContent>
                    {finishedGoods.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {isArabic ? item.name_ar : item.name_en} ({item.sku})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-semibold">{t("manufacturing.bulkItem")} *</Label>
                <Select value={bulkItemId} onValueChange={setBulkItemId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="اختر السائل السائب بالتانك..." />
                  </SelectTrigger>
                  <SelectContent>
                    {bulkItems.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {isArabic ? item.name_ar : item.name_en} ({item.sku})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">{t("manufacturing.volumePerUnit")} *</Label>
                <Input
                  type="number"
                  value={volumePerUnitGrams}
                  onChange={(e) => setVolumePerUnitGrams(Number(e.target.value))}
                  placeholder="5000"
                  className="mt-1 font-mono tabular-nums"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  (مثال: 5000 جم تعادل 5 لتر، 1000 جم تعادل 1 لتر)
                </span>
              </div>

              <div>
                <Label className="text-xs font-semibold">{t("manufacturing.piecesPerCarton")} *</Label>
                <Input
                  type="number"
                  value={piecesPerCarton}
                  onChange={(e) => setPiecesPerCarton(Number(e.target.value))}
                  placeholder="4"
                  min={1}
                  className="mt-1 font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 space-y-3">
              <span className="font-bold text-slate-800 text-xs block">مواد التعبئة والتغليف المرتبطة:</span>

              <div>
                <Label className="text-xs font-semibold">{t("manufacturing.bottleItem")} *</Label>
                <Select value={bottleItemId} onValueChange={setBottleItemId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="اختر العبوة / الجركل مع الغطاء..." />
                  </SelectTrigger>
                  <SelectContent>
                    {packagingMaterials.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {isArabic ? item.name_ar : item.name_en} ({item.sku})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold">{t("manufacturing.frontSticker")}</Label>
                  <Select value={frontStickerItemId} onValueChange={setFrontStickerItemId}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="اختر الاستيكر الأمامي..." />
                    </SelectTrigger>
                    <SelectContent>
                      {packagingMaterials.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {isArabic ? item.name_ar : item.name_en} ({item.sku})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-semibold">{t("manufacturing.backSticker")} (اختياري)</Label>
                  <Select value={backStickerItemId} onValueChange={setBackStickerItemId}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="اختر الاستيكر الخلفي..." />
                    </SelectTrigger>
                    <SelectContent>
                      {packagingMaterials.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {isArabic ? item.name_ar : item.name_en} ({item.sku})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold">{t("manufacturing.cartonItem")}</Label>
                <Select value={cartonItemId} onValueChange={setCartonItemId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="اختر كرتون الشحن..." />
                  </SelectTrigger>
                  <SelectContent>
                    {packagingMaterials.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {isArabic ? item.name_ar : item.name_en} ({item.sku})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={createSpecMutation.isPending}
              onClick={() => createSpecMutation.mutate()}
              className="bg-slate-900 hover:bg-slate-800 text-white min-h-[44px]"
            >
              {createSpecMutation.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
