// ==============================================================================
// src/types/database.ts
// Single Source of Truth for Database Types matching 001_phase1_foundation.sql
// ==============================================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "owner" | "accountant" | "production" | "warehouse" | "sales_rep";
export type WarehouseType = "raw_materials" | "packaging" | "finished_goods" | "sales_van";
export type TankStatus = "empty" | "mixing" | "pending_qc" | "ready_for_packaging" | "rework";
export type AccountType =
  | "header"
  | "asset"
  | "contra_asset"
  | "liability"
  | "equity"
  | "revenue"
  | "contra_revenue"
  | "expense";
export type NotificationType = "info" | "warning" | "success" | "error" | "approval";

export interface FactorySettings {
  id: number;
  name_ar: string;
  name_en: string;
  vat_number: string;
  cr_number: string;
  national_address: string;
  iban: string;
  logo_base64: string | null;
  label_width_mm: number;
  label_height_mm: number;
  near_expiry_days: number;
  enable_fixed_assets: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  full_name: string;
  phone: string;
  role: UserRole;
  can_view_formulas: boolean;
  can_view_costs: boolean;
  can_approve_on_behalf: boolean;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Vehicle {
  id: string;
  plate_number: string;
  name: string;
  assigned_rep_id: string | null;
  is_active: boolean;
  created_at: string;
  assigned_rep?: UserProfile | null;
}

export interface Warehouse {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  warehouse_type: WarehouseType;
  vehicle_id: string | null;
  assigned_rep_id: string | null;
  is_active: boolean;
  created_at: string;
  vehicle?: Vehicle | null;
  assigned_rep?: UserProfile | null;
}

export interface Tank {
  id: string;
  tank_code: string;
  name_ar: string;
  name_en: string;
  capacity_liters: number;
  status: TankStatus;
  current_batch_id: string | null;
  current_qty_grams: number;
  is_active: boolean;
  created_at: string;
}

export interface Account {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  type: AccountType;
  parent_id: string | null;
  is_system: boolean;
  is_active: boolean;
  current_balance: number;
  created_at: string;
  parent?: Account | null;
  children?: Account[];
}

export interface FiscalPeriod {
  id: string;
  period_name: string;
  start_date: string;
  end_date: string;
  is_locked: boolean;
  locked_at: string | null;
  locked_by: string | null;
  created_at: string;
  locked_by_user?: UserProfile | null;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  table_name: string | null;
  record_id: string | null;
  old_values: Json | null;
  new_values: Json | null;
  ip_address: string | null;
  details: string | null;
  created_at: string;
  user?: UserProfile | null;
}

export interface Notification {
  id: string;
  user_id: string;
  title_ar: string;
  title_en: string;
  message_ar: string;
  message_en: string;
  type: NotificationType;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      factory_settings: {
        Row: FactorySettings;
        Insert: {
          id?: number;
          name_ar: string;
          name_en: string;
          vat_number: string;
          cr_number: string;
          national_address: string;
          iban: string;
          logo_base64?: string | null;
          label_width_mm?: number;
          label_height_mm?: number;
          near_expiry_days?: number;
          enable_fixed_assets?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          name_ar?: string;
          name_en?: string;
          vat_number?: string;
          cr_number?: string;
          national_address?: string;
          iban?: string;
          logo_base64?: string | null;
          label_width_mm?: number;
          label_height_mm?: number;
          near_expiry_days?: number;
          enable_fixed_assets?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      users_profile: {
        Row: UserProfile;
        Insert: {
          id: string;
          full_name: string;
          phone: string;
          role: UserRole;
          can_view_formulas?: boolean;
          can_view_costs?: boolean;
          can_approve_on_behalf?: boolean;
          is_active?: boolean;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          phone?: string;
          role?: UserRole;
          can_view_formulas?: boolean;
          can_view_costs?: boolean;
          can_approve_on_behalf?: boolean;
          is_active?: boolean;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      vehicles: {
        Row: Vehicle;
        Insert: {
          id?: string;
          plate_number: string;
          name: string;
          assigned_rep_id?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          plate_number?: string;
          name?: string;
          assigned_rep_id?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      warehouses: {
        Row: Warehouse;
        Insert: {
          id?: string;
          code: string;
          name_ar: string;
          name_en: string;
          warehouse_type: WarehouseType;
          vehicle_id?: string | null;
          assigned_rep_id?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name_ar?: string;
          name_en?: string;
          warehouse_type?: WarehouseType;
          vehicle_id?: string | null;
          assigned_rep_id?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      tanks: {
        Row: Tank;
        Insert: {
          id?: string;
          tank_code: string;
          name_ar: string;
          name_en: string;
          capacity_liters: number;
          status?: TankStatus;
          current_batch_id?: string | null;
          current_qty_grams?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          tank_code?: string;
          name_ar?: string;
          name_en?: string;
          capacity_liters?: number;
          status?: TankStatus;
          current_batch_id?: string | null;
          current_qty_grams?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      accounts: {
        Row: Account;
        Insert: {
          id?: string;
          code: string;
          name_ar: string;
          name_en: string;
          type: AccountType;
          parent_id?: string | null;
          is_system?: boolean;
          is_active?: boolean;
          current_balance?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name_ar?: string;
          name_en?: string;
          type?: AccountType;
          parent_id?: string | null;
          is_system?: boolean;
          is_active?: boolean;
          current_balance?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      fiscal_periods: {
        Row: FiscalPeriod;
        Insert: {
          id?: string;
          period_name: string;
          start_date: string;
          end_date: string;
          is_locked?: boolean;
          locked_at?: string | null;
          locked_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          period_name?: string;
          start_date?: string;
          end_date?: string;
          is_locked?: boolean;
          locked_at?: string | null;
          locked_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: AuditLog;
        Insert: {
          id?: string;
          user_id?: string | null;
          action: string;
          table_name?: string | null;
          record_id?: string | null;
          old_values?: Json | null;
          new_values?: Json | null;
          ip_address?: string | null;
          details?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          action?: string;
          table_name?: string | null;
          record_id?: string | null;
          old_values?: Json | null;
          new_values?: Json | null;
          ip_address?: string | null;
          details?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: Notification;
        Insert: {
          id?: string;
          user_id: string;
          title_ar: string;
          title_en: string;
          message_ar: string;
          message_en: string;
          type?: NotificationType;
          link?: string | null;
          is_read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title_ar?: string;
          title_en?: string;
          message_ar?: string;
          message_en?: string;
          type?: NotificationType;
          link?: string | null;
          is_read?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      rpc_soft_delete_or_purge_user: {
        Args: {
          target_user_id: string;
          performing_user_id: string;
        };
        Returns: {
          status: "soft_deleted" | "hard_deleted";
          message: string;
        };
      };
      is_owner: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_accountant_or_owner: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Enums: {
      user_role: UserRole;
      warehouse_type: WarehouseType;
      tank_status: TankStatus;
      account_type: AccountType;
      notification_type: NotificationType;
    };
    CompositeTypes: Record<string, never>;
  };
}
