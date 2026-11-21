import { supabase } from "./supabase";
import type { UserProfile, UserRole } from "@/types/database";

export interface NormalizedPhone {
  display: string;
  normalized: string;
  email: string;
}

/**
 * Normalizes Saudi phone input:
 * - Accepts 05XXXXXXXX, 9665XXXXXXXX, +9665XXXXXXXX, 5XXXXXXXX
 * - Formats to 9665XXXXXXXX
 * - Generates synthetic email: 9665XXXXXXXX@factory.local
 */
export function normalizePhone(input: string): NormalizedPhone {
  const digits = input.replace(/[^0-9]/g, "");

  let normalized = digits;
  if (digits.startsWith("05") && digits.length === 10) {
    normalized = "966" + digits.substring(1);
  } else if (digits.startsWith("5") && digits.length === 9) {
    normalized = "966" + digits;
  } else if (digits.startsWith("9665") && digits.length === 12) {
    normalized = digits;
  }

  return {
    display: digits,
    normalized,
    email: `${normalized}@factory.local`,
  };
}

export interface AuthSessionData {
  user: {
    id: string;
    email?: string;
  };
  profile: UserProfile;
}

/**
 * Single URL Login with Phone + Password ONLY.
 * Normalizes phone -> synthetic email -> signInWithPassword -> checks users_profile
 */
export async function loginWithPhone(phone: string, password: string): Promise<AuthSessionData> {
  const { email } = normalizePhone(phone);

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError || !authData.user) {
    throw new Error(
      authError?.message?.includes("Invalid login credentials")
        ? "بيانات الدخول غير صحيحة. يرجى التأكد من رقم الجوال وكلمة المرور / Invalid phone number or password"
        : authError?.message || "فشل تسجيل الدخول / Login failed"
    );
  }

  // Immediately fetch users_profile
  const { data: profile, error: profileError } = await supabase
    .from("users_profile")
    .select("*")
    .eq("id", authData.user.id)
    .single();

  if (profileError || !profile) {
    await supabase.auth.signOut();
    throw new Error(
      "لم يتم العثور على ملف تعريف المستخدم في النظام / User profile not found in system"
    );
  }

  // Strict check: if is_active === false or deleted_at !== null -> sign out immediately
  if (!profile.is_active || profile.deleted_at !== null) {
    await supabase.auth.signOut();
    throw new Error(
      "هذا الحساب معطل أو تم حذفه من قبل الإدارة. يرجى مراجعة مدير النظام / This account is inactive or disabled. Contact administrator."
    );
  }

  return {
    user: authData.user,
    profile: profile as UserProfile,
  };
}

/**
 * Route resolution based on strict RBAC rules:
 * - owner -> /
 * - accountant -> /accounting
 * - production -> /production
 * - warehouse -> /warehouse
 * - sales_rep -> /rep
 */
export function getDefaultRouteForRole(role: UserRole): string {
  switch (role) {
    case "owner":
      return "/";
    case "accountant":
      return "/accounting";
    case "production":
      return "/production";
    case "warehouse":
      return "/warehouse";
    case "sales_rep":
      return "/rep";
    default:
      return "/login";
  }
}

/**
 * Checks if user has permission to visit a route.
 */
export function canAccessRoute(role: UserRole, pathname: string): boolean {
  if (role === "owner") {
    return true; // Owner can access full system and all views
  }

  if (role === "accountant") {
    // Accountant can access accounting, inventory, procurement, and vehicles
    return (
      pathname.startsWith("/accounting") ||
      pathname.startsWith("/inventory") ||
      pathname.startsWith("/procurement") ||
      pathname === "/settings/vehicles"
    );
  }

  if (role === "production") {
    return (
      pathname === "/production" ||
      pathname.startsWith("/production/") ||
      pathname.startsWith("/manufacturing") ||
      pathname === "/inventory/items"
    );
  }

  if (role === "warehouse") {
    return (
      pathname === "/warehouse" ||
      pathname.startsWith("/warehouse/") ||
      pathname === "/inventory/items" ||
      pathname === "/procurement/receipts"
    );
  }

  if (role === "sales_rep") {
    return pathname === "/rep" || pathname.startsWith("/rep/");
  }

  return false;
}
