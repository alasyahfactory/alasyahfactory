import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, locale = "ar-SA"): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-SA", {
    style: "currency",
    currency: "SAR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(value: number, locale = "ar-SA"): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-SA", {
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Modern Web Guidance: Support Global Calendar Systems (Gregorian & Umm al-Qura Hijri)
 * Formats a date using native Intl API for Saudi Arabian industrial & tax compliance.
 */
export function formatHijriDate(date: Date | string | number, locale = "ar-SA"): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return new Intl.DateTimeFormat(`${locale}-u-ca-islamic-umalqura`, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

export function formatDualDate(
  date: Date | string | number,
  isArabic = true
): { gregorian: string; hijri: string } {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  const gregorian = new Intl.DateTimeFormat(isArabic ? "ar-SA" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
  const hijri = formatHijriDate(d, isArabic ? "ar-SA" : "en");
  return { gregorian, hijri };
}
