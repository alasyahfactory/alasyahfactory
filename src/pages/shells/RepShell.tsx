import { useTranslation } from "react-i18next";
import { Truck, Lock, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function RepShell() {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";

  return (
    <div className="space-y-4 max-w-lg mx-auto">
      <Card className="border-industrial-border shadow-sm">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 mb-2">
            <Truck className="h-7 w-7" />
          </div>
          <CardTitle className="text-lg font-bold">
            {t("mobileShells.repTitle")}
          </CardTitle>
          <div className="flex justify-center mt-1">
            <Badge variant="purple" className="text-xs">
              {isArabic ? "عرض فقط (Read-Only) — المرحلة 3/4" : "Read-Only Shell — Phase 3/4"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-xs text-slate-600 leading-relaxed">
            {t("mobileShells.repDesc")}
          </p>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-start space-y-2 text-xs">
            <div className="flex items-center gap-2 font-semibold text-slate-800">
              <Eye className="h-4 w-4 text-slate-500" />
              <span>{isArabic ? "صلاحيات المندوب الصارمة:" : "Strict Representative Guardrails:"}</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-slate-600 text-[11px]">
              <li>{isArabic ? "عرض فقط لعهدة السيارة الحالية بالكرتون والحبة" : "Read-only view of current van inventory custody"}</li>
              <li>{isArabic ? "عرض كشوف حسابات العملاء التابعين له فقط" : "View customer balances assigned to this rep only"}</li>
              <li>{isArabic ? "عرض رصيد العمولات المستحقة" : "View accrued sales commissions"}</li>
              <li>{isArabic ? "ممنوع الفوترة المباشرة أو التعديل أو رؤية التكاليف" : "No invoice issuance, edits, or cost access"}</li>
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
