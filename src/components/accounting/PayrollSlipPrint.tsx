import React, { useRef } from "react";
import { Printer, FileDown, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PayrollRun, FactorySettings } from "@/types/database";

interface PayrollSlipPrintProps {
  payrollRun: PayrollRun;
  settings: FactorySettings | null;
  compact?: boolean;
}

export const PayrollSlipPrint: React.FC<PayrollSlipPrintProps> = ({ payrollRun, settings, compact = false }) => {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = (isPdf = false) => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const docTitle = isPdf
      ? `مسير_رواتب_${payrollRun.month}_${payrollRun.year}_${payrollRun.run_number}`
      : `${payrollRun.run_number} - مسير رواتب ${payrollRun.month}/${payrollRun.year}`;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
        <head>
          <title>${docTitle}</title>
          <meta charset="utf-8" />
          <style>
            @page {
              size: A4 landscape;
              margin: 10mm;
            }
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              color: #0f172a;
              margin: 0;
              padding: 0;
              background: #fff;
              font-size: 11px;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 2px solid #0f172a;
              padding-bottom: 10px;
              margin-bottom: 12px;
            }
            .title-box {
              text-align: center;
            }
            .payroll-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 15px;
            }
            .payroll-table th, .payroll-table td {
              border: 1px solid #cbd5e1;
              padding: 5px 6px;
              text-align: center;
            }
            .payroll-table th {
              background-color: #f1f5f9;
              font-weight: 700;
              font-size: 10px;
            }
            .payroll-table tr:nth-child(even) {
              background-color: #f8fafc;
            }
            .num-cell {
              font-family: monospace;
              text-align: right;
              font-weight: 600;
            }
            .total-row td {
              font-weight: 800;
              background-color: #e2e8f0;
              font-size: 11px;
            }
            .signatures {
              display: grid;
              grid-template-columns: 1fr 1fr 1fr;
              gap: 20px;
              text-align: center;
              margin-top: 25px;
              padding-top: 15px;
              border-top: 1px dashed #cbd5e1;
            }
            .sig-title {
              font-weight: 700;
              margin-bottom: 35px;
            }
            .sig-line {
              border-top: 1px solid #64748b;
              margin: 0 40px;
            }
          </style>
        </head>
        <body>
          <div>
            ${printContent.innerHTML}
          </div>
          <script>
            window.onload = function() {
              window.print();
              window.close();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleShareWhatsApp = () => {
    const factory = settings?.name_ar || "مصنع الأسياح للمنتجات الكيميائية";
    const msg = `*كشف مسير رواتب معتمد - شهر ${payrollRun.month}/${payrollRun.year}*
رقم المسير: ${payrollRun.run_number}
تاريخ الإصدار: ${payrollRun.payroll_date}
إجمالي الرواتب الأساسية: ${payrollRun.total_basic.toFixed(2)} ر.س
إجمالي الاستحقاقات الشاملة: ${(payrollRun.total_basic + payrollRun.total_allowances + payrollRun.total_commissions + payrollRun.total_overtime).toFixed(2)} ر.س
إجمالي الاستقطاعات والسلف: ${payrollRun.total_deductions.toFixed(2)} ر.س
صافي الرواتب المستحقة للتحويل: ${payrollRun.net_payable.toFixed(2)} ر.س
عدد الموظفين في المسير: ${payrollRun.lines?.length || 0} موظف
_صادر ومعتمد من إدارة الرواتب والشؤون المالية - ${factory}_`;

    const encoded = encodeURIComponent(msg);
    const waUrl = `https://api.whatsapp.com/send?text=${encoded}`;
    window.open(waUrl, "_blank");
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        {/* 1. Print A4 Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => handlePrint(false)}
          className={compact ? "h-7 px-2 text-xs gap-1 border-slate-300 text-slate-800 hover:bg-slate-100" : "h-8 px-2.5 gap-1.5 text-xs font-medium text-slate-800 border-slate-300 hover:bg-slate-100"}
          title="طباعة المسير A4"
        >
          <Printer className="h-3.5 w-3.5 text-slate-600" />
          <span>{compact ? "طباعة" : "طباعة المسير A4"}</span>
        </Button>

        {/* 2. Save PDF Button */}
        <Button
          variant="tonal"
          size="sm"
          onClick={() => handlePrint(true)}
          className={compact ? "h-7 px-2 text-xs gap-1 font-semibold" : "h-8 px-2.5 gap-1.5 text-xs font-semibold"}
          title="حفظ المسير كملف PDF"
        >
          <FileDown className="h-3.5 w-3.5 text-sky-700" />
          <span>{compact ? "PDF" : "حفظ PDF"}</span>
        </Button>

        {/* 3. Share WhatsApp Button */}
        <Button
          variant="emerald"
          size="sm"
          onClick={handleShareWhatsApp}
          className={compact ? "h-7 px-2 text-xs gap-1" : "h-8 px-2.5 gap-1.5 text-xs"}
          title="مشاركة ملخص المسير عبر واتساب"
        >
          <Share2 className="h-3.5 w-3.5 text-emerald-100" />
          <span>واتساب</span>
        </Button>
      </div>

      {/* Hidden print template */}
      <div style={{ display: "none" }}>
        <div ref={printRef}>
          {/* Header */}
          <div className="header">
            <div>
              <div style={{ fontSize: "14px", fontWeight: "bold" }}>
                {settings?.name_ar || "مصنع الآسية للمنظفات الصناعية"}
              </div>
              <div>سجل تجاري: {settings?.cr_number || "1131012345"}</div>
            </div>

            <div className="title-box">
              <div style={{ fontSize: "16px", fontWeight: "bold" }}>
                كشف مسير رواتب وأجور العاملين (شهري)
              </div>
              <div style={{ fontSize: "12px", color: "#475569" }}>
                عن شهر: {payrollRun.month} / {payrollRun.year} — مسير رقم: {payrollRun.run_number}
              </div>
            </div>

            <div style={{ textAlign: "left", direction: "ltr" }}>
              <div style={{ fontSize: "13px", fontWeight: "bold" }}>
                {settings?.name_en || "Al-Asyah Detergent Factory"}
              </div>
              <div>Date: {payrollRun.payroll_date}</div>
            </div>
          </div>

          {/* Table */}
          <table className="payroll-table">
            <thead>
              <tr>
                <th>#</th>
                <th>كود الموظف</th>
                <th>اسم الموظف</th>
                <th>الوظيفة / القسم</th>
                <th>الراتب الأساسي</th>
                <th>بدل السكن</th>
                <th>بدل النقل</th>
                <th>العمولات / الإضافي</th>
                <th>إجمالي الاستحقاق</th>
                <th>خصم السلف</th>
                <th>خصم غياب/جزاءات</th>
                <th>صافي الراتب المستحق</th>
                <th>توقيع الموظف</th>
              </tr>
            </thead>
            <tbody>
              {payrollRun.lines?.map((line, idx) => {
                const gross =
                  line.basic_salary +
                  line.housing_allowance +
                  line.transport_allowance +
                  line.other_allowance +
                  line.overtime_amount +
                  line.commission_amount +
                  line.bonus_amount;
                return (
                  <tr key={line.id || idx}>
                    <td>{idx + 1}</td>
                    <td style={{ fontFamily: "monospace" }}>{line.employee?.emp_code || `EMP-${idx+1}`}</td>
                    <td style={{ textAlign: "right", fontWeight: "bold" }}>{line.employee?.name_ar || "موظف"}</td>
                    <td>{line.employee?.job_title || "-"}</td>
                    <td className="num-cell">{line.basic_salary.toFixed(2)}</td>
                    <td className="num-cell">{line.housing_allowance.toFixed(2)}</td>
                    <td className="num-cell">{line.transport_allowance.toFixed(2)}</td>
                    <td className="num-cell">{(line.overtime_amount + line.commission_amount).toFixed(2)}</td>
                    <td className="num-cell" style={{ color: "#047857" }}>{gross.toFixed(2)}</td>
                    <td className="num-cell" style={{ color: "#b91c1c" }}>{line.advance_deduction.toFixed(2)}</td>
                    <td className="num-cell" style={{ color: "#b91c1c" }}>{(line.absence_deduction + line.penalty_deduction).toFixed(2)}</td>
                    <td className="num-cell" style={{ fontWeight: "bold", fontSize: "11px" }}>{line.net_salary.toFixed(2)}</td>
                    <td style={{ width: "90px" }}></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="total-row">
                <td colSpan={4} style={{ textAlign: "center" }}>الإجمالي العام (SAR)</td>
                <td className="num-cell">{payrollRun.total_basic.toFixed(2)}</td>
                <td className="num-cell" colSpan={2}>{payrollRun.total_allowances.toFixed(2)}</td>
                <td className="num-cell">{(payrollRun.total_commissions + payrollRun.total_overtime).toFixed(2)}</td>
                <td className="num-cell" style={{ color: "#047857" }}>
                  {(payrollRun.total_basic + payrollRun.total_allowances + payrollRun.total_commissions + payrollRun.total_overtime).toFixed(2)}
                </td>
                <td className="num-cell" style={{ color: "#b91c1c" }}>{payrollRun.total_advance_deductions.toFixed(2)}</td>
                <td className="num-cell" style={{ color: "#b91c1c" }}>{payrollRun.total_deductions.toFixed(2)}</td>
                <td className="num-cell" style={{ color: "#0f172a", fontSize: "12px" }}>{payrollRun.net_payable.toFixed(2)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>

          {/* Signatures */}
          <div className="signatures">
            <div>
              <div className="sig-title">إعداد: شؤون الموظفين والرواتب</div>
              <div className="sig-line"></div>
              <div style={{ fontSize: "10px", color: "#64748b", marginTop: "4px" }}>التوقيع والتاريخ</div>
            </div>
            <div>
              <div className="sig-title">تدقيق: المحاسب المالي</div>
              <div className="sig-line"></div>
              <div style={{ fontSize: "10px", color: "#64748b", marginTop: "4px" }}>التوقيع والتاريخ</div>
            </div>
            <div>
              <div className="sig-title">اعتماد: المدير العام</div>
              <div className="sig-line"></div>
              <div style={{ fontSize: "10px", color: "#64748b", marginTop: "4px" }}>التوقيع والختم</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
