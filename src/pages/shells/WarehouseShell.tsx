import { useTranslation } from "react-i18next";
import { Package, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function WarehouseShell() {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";

  return (
    <div className="space-y-4 max-w-lg mx-auto">
      <Card className="border-industrial-border shadow-sm">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 mb-2">
            <Package className="h-7 w-7" />
          </div>
          <CardTitle className="text-lg font-bold">
            {t("mobileShells.warehouseTitle")}
          </CardTitle>
          <div className="flex justify-center mt-1">
            <Badge variant="amber" className="text-xs">
              {isArabic ? "مخصص للمرحلة 2 (المخزون والاستلام)" : "Phase 2 Target Module"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-xs text-slate-600 leading-relaxed">
            {t("mobileShells.warehouseDesc")}
          </p>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-start space-y-2 text-xs">
            <div className="flex items-center gap-2 font-semibold text-slate-800">
              <Lock className="h-4 w-4 text-slate-500" />
              <span>{isArabic ? "ضوابط الأمان المفروضة (RLS):" : "Security Guardrails (RLS):"}</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-slate-600 text-[11px]">
              <li>{isArabic ? "ممنوع نهائياً رؤية الأسعار والتكاليف أو رصيد النظام أثناء الجرد" : "Prohibited from viewing costs, prices, or system stock during inventory"}</li>
              <li>{isArabic ? "استلام المشتريات بالوزن الفعلي كجم (Actual Scale Weight)" : "Purchases receipt based on actual scale weight in KG"}</li>
              <li>{isArabic ? "طباعة ورقة الجرد الأعمى لمطابقة الكميات الفعلية" : "Blind stocktaking printouts"}</li>
              <li>{isArabic ? "تسليم خامات أوامر الخلط وصرف بضاعة عهدة المندوبين" : "Issuing raw materials for batch mixing & rep vans"}</li>
            </ul>
          </div>

          <div className="text-[11px] text-slate-400 font-mono">
            ERP Mobile Shell • 375px Viewport Optimized
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
