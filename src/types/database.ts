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
export type ItemType = "raw_material" | "packaging" | "bulk_in_tank" | "finished_good";
export type BaseUnit = "gram" | "piece";
export type PurchaseOrderStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "partially_received"
  | "completed"
  | "cancelled";
export type MovementType =
  | "purchase_receipt"
  | "purchase_return"
  | "production_consume"
  | "production_output"
  | "sales_dispatch"
  | "sales_return"
  | "van_transfer"
  | "opening_balance"
  | "scrap_spoilage"
  | "inventory_adjustment";

export interface Item {
  id: string;
  sku: string;
  name_ar: string;
  name_en: string;
  item_type: ItemType;
  base_unit: BaseUnit;
  density: number;
  pieces_per_carton: number;
  volume_per_unit_grams: number;
  shelf_life_months: number;
  reorder_point: number;
  current_stock: number;
  default_warehouse_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  default_warehouse?: Warehouse | null;
}

export interface Supplier {
  id: string;
  name_ar: string;
  name_en: string | null;
  tax_number: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  address: string | null;
  credit_limit: number;
  current_balance: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string;
  order_date: string;
  expected_delivery_date: string | null;
  target_warehouse_id: string | null;
  status: PurchaseOrderStatus;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  supplier?: Supplier;
  target_warehouse?: Warehouse;
  creator?: UserProfile;
  approver?: UserProfile;
  lines?: PurchaseOrderLine[];
}

export interface PurchaseOrderLine {
  id: string;
  purchase_order_id: string;
  item_id: string;
  ordered_qty: number;
  received_qty: number;
  unit_price_ex_vat: number;
  vat_rate: number;
  vat_amount: number;
  total_ex_vat: number;
  total_inc_vat: number;
  notes: string | null;
  created_at: string;
  item?: Item;
}

export interface PurchaseReceipt {
  id: string;
  receipt_number: string;
  purchase_order_id: string | null;
  supplier_id: string;
  warehouse_id: string;
  receipt_date: string;
  status: "draft" | "completed" | "cancelled";
  supplier_dn_number: string | null;
  received_by: string | null;
  freight_cost: number;
  notes: string | null;
  created_at: string;
  supplier?: Supplier;
  warehouse?: Warehouse;
  receiver?: UserProfile;
  lines?: PurchaseReceiptLine[];
}

export interface PurchaseReceiptLine {
  id: string;
  receipt_id: string;
  po_line_id: string | null;
  item_id: string;
  weight_kg: number | null;
  received_qty: number;
  unit_cost_ex_vat: number;
  batch_number: string;
  production_date: string | null;
  expiry_date: string | null;
  notes: string | null;
  created_at: string;
  item?: Item;
}

export interface FifoLayer {
  id: string;
  item_id: string;
  warehouse_id: string;
  batch_number: string;
  layer_date: string;
  initial_qty: number;
  remaining_qty: number;
  unit_cost_ex_vat: number;
  expiry_date: string | null;
  purchase_receipt_id: string | null;
  is_closed: boolean;
  created_at: string;
  updated_at: string;
  item?: Item;
  warehouse?: Warehouse;
}

export interface InventoryMovement {
  id: string;
  movement_number: string;
  item_id: string;
  movement_type: MovementType;
  source_warehouse_id: string | null;
  target_warehouse_id: string | null;
  batch_number: string | null;
  qty: number;
  cost_per_unit: number;
  total_cost: number;
  fifo_layer_id: string | null;
  reference_type: string | null;
  reference_id: string | null;
  created_by: string | null;
  notes: string | null;
  created_at: string;
  item?: Item;
  source_warehouse?: Warehouse | null;
  target_warehouse?: Warehouse | null;
}

export interface NegativeStockQueue {
  id: string;
  item_id: string;
  warehouse_id: string;
  qty_pending: number;
  estimated_cost: number;
  reference_type: string | null;
  reference_id: string | null;
  settled_at: string | null;
  variance_amount: number;
  journal_entry_id: string | null;
  created_at: string;
  item?: Item;
}

export interface PurchaseInvoice {
  id: string;
  invoice_number: string;
  supplier_invoice_number: string;
  supplier_id: string;
  purchase_receipt_id: string | null;
  invoice_date: string;
  due_date: string | null;
  subtotal_ex_vat: number;
  vat_amount: number;
  freight_amount: number;
  total_inc_vat: number;
  status: "draft" | "posted" | "paid" | "cancelled";
  payment_status: "unpaid" | "partially_paid" | "paid";
  journal_entry_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  supplier?: Supplier;
  lines?: PurchaseInvoiceLine[];
}

export interface PurchaseInvoiceLine {
  id: string;
  invoice_id: string;
  item_id: string;
  qty: number;
  unit_price_ex_vat: number;
  vat_rate: number;
  vat_amount: number;
  total_ex_vat: number;
  total_inc_vat: number;
  notes: string | null;
  item?: Item;
}

export interface PurchaseReturn {
  id: string;
  return_number: string;
  purchase_invoice_id: string | null;
  purchase_receipt_id: string | null;
  supplier_id: string;
  return_date: string;
  total_claimed_ex_vat: number;
  total_vat_refund: number;
  total_claimed_inc_vat: number;
  stock_deducted_value: number;
  consumed_compensation_value: number;
  status: "draft" | "completed" | "cancelled";
  journal_entry_id: string | null;
  created_by: string | null;
  notes: string | null;
  created_at: string;
  supplier?: Supplier;
  lines?: PurchaseReturnLine[];
}

export interface PurchaseReturnLine {
  id: string;
  return_id: string;
  item_id: string;
  fifo_layer_id: string | null;
  claimed_qty: number;
  remaining_in_stock_qty: number;
  consumed_qty: number;
  unit_price_ex_vat: number;
  vat_rate: number;
  total_ex_vat: number;
  vat_amount: number;
  total_inc_vat: number;
  stock_deducted_amount: number;
  compensation_amount: number;
  reason: string | null;
  item?: Item;
}

export interface Formula {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  bulk_item_id: string | null;
  batch_size_grams: number;
  density: number;
  target_ph_min: number;
  target_ph_max: number;
  target_viscosity_min: number;
  target_viscosity_max: number;
  instructions: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  bulk_item?: Item;
  lines?: FormulaLine[];
  formula_lines?: FormulaLine[];
}

export interface FormulaLine {
  id: string;
  formula_id: string;
  item_id: string;
  qty_grams: number;
  percentage: number;
  addition_step: number;
  instructions: string | null;
  created_at: string;
  item?: Item;
}

export interface PackagingSpec {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  finished_good_id: string;
  bulk_item_id: string;
  volume_per_unit_grams: number;
  bottle_item_id: string;
  front_sticker_item_id: string | null;
  back_sticker_item_id: string | null;
  carton_item_id: string | null;
  pieces_per_carton: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  finished_good?: Item;
  bulk_item?: Item;
  bottle_item?: Item;
  front_sticker?: Item | null;
  front_sticker_item?: Item | null;
  back_sticker?: Item | null;
  back_sticker_item?: Item | null;
  closure_item?: Item | null;
  carton_item?: Item | null;
}

export interface MixingBatch {
  id: string;
  batch_number: string;
  formula_id: string;
  tank_id: string;
  planned_qty_grams: number;
  actual_output_grams: number | null;
  remaining_qty_grams: number;
  status: "mixing" | "pending_qc" | "qc_passed" | "ready_for_packaging" | "in_packaging" | "closed" | "cancelled" | "rework";
  qc_ph: number | null;
  qc_viscosity: number | null;
  qc_odor_ok: boolean;
  qc_color_ok: boolean;
  qc_status: "pending" | "passed" | "needs_rework";
  qc_tested_by: string | null;
  qc_tested_at: string | null;
  qc_notes: string | null;
  actual_yield_grams: number | null;
  yield_variance_grams: number;
  variance_cost: number;
  journal_entry_id: string | null;
  closed_by: string | null;
  closed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  formula?: Formula;
  tank?: Tank;
  tester?: UserProfile;
  consumptions?: MixingConsumption[];
}

export interface MixingConsumption {
  id: string;
  mixing_batch_id: string;
  item_id: string;
  consumption_type: "standard" | "adjustment_ph" | "adjustment_viscosity" | "rework" | "write_off";
  qty_grams: number;
  unit_cost: number;
  total_cost: number;
  created_by: string | null;
  created_at: string;
  item?: Item;
}

export interface PackagingOrder {
  id: string;
  order_number: string;
  mixing_batch_id: string;
  packaging_spec_id: string;
  target_fg_item_id: string;
  packaging_date: string;
  units_produced: number;
  cartons_produced: number;
  bulk_consumed_grams: number;
  wasted_bottles: number;
  wasted_stickers: number;
  wasted_cartons: number;
  wasted_notes: string | null;
  total_cost: number;
  unit_cost: number;
  target_warehouse_id: string | null;
  status: "draft" | "completed" | "cancelled";
  created_by: string | null;
  created_at: string;
  mixing_batch?: MixingBatch;
  packaging_spec?: PackagingSpec;
  target_fg_item?: Item;
}

export interface Customer {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  vat_number: string | null;
  cr_number: string | null;
  phone: string;
  national_address: string | null;
  credit_limit: number;
  default_payment_days: number;
  assigned_rep_id: string | null;
  price_list_id: string | null;
  guarantee_text: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  assigned_rep?: UserProfile | null;
}

export interface PriceList {
  id: string;
  name_ar: string;
  name_en: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  items?: PriceListItem[];
}

export interface PriceListItem {
  id: string;
  price_list_id: string;
  item_id: string;
  price_per_piece: number;
  price_per_carton: number;
  created_at: string;
  item?: Item;
}

export interface Quotation {
  id: string;
  quotation_number: string;
  customer_id: string;
  quotation_date: string;
  valid_until: string;
  total_ex_vat: number;
  vat_amount: number;
  grand_total: number;
  status: "draft" | "sent" | "accepted" | "rejected" | "converted_to_invoice";
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  customer?: Customer;
  lines?: QuotationLine[];
}

export interface QuotationLine {
  id: string;
  quotation_id: string;
  item_id: string;
  quantity: number;
  unit_type: "piece" | "carton";
  unit_price: number;
  vat_rate: number;
  vat_amount: number;
  total_line: number;
  created_at: string;
  item?: Item;
}

export interface SalesInvoice {
  id: string;
  invoice_number: string;
  customer_id: string;
  invoice_date: string;
  due_date: string;
  total_amount_ex_vat: number;
  vat_amount: number;
  total_amount_inc_vat: number;
  advance_deducted: number;
  net_amount_due: number;
  paid_amount: number;
  payment_status: "unpaid" | "partially_paid" | "paid";
  status: "draft" | "posted" | "cancelled";
  zatca_qr_base64: string | null;
  print_count: number;
  source_type: "direct" | "van_sale" | "quotation";
  van_warehouse_id: string | null;
  assigned_rep_id: string | null;
  journal_entry_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  customer?: Customer;
  assigned_rep?: UserProfile | null;
  van_warehouse?: Warehouse | null;
  lines?: SalesInvoiceLine[];
}

export interface SalesInvoiceLine {
  id: string;
  invoice_id: string;
  item_id: string;
  quantity: number;
  unit_type: "piece" | "carton";
  pieces_count: number;
  unit_price_ex_vat: number;
  total_price_ex_vat: number;
  vat_rate: number;
  vat_amount: number;
  total_line_inc_vat: number;
  is_bonus_or_sample: boolean;
  created_at: string;
  item?: Item;
}

export interface SalesReturn {
  id: string;
  return_number: string;
  invoice_id: string | null;
  customer_id: string;
  return_date: string;
  total_ex_vat: number;
  vat_amount: number;
  grand_total: number;
  status: "draft" | "posted" | "cancelled";
  zatca_qr_base64: string | null;
  print_count: number;
  journal_entry_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  customer?: Customer;
  invoice?: SalesInvoice | null;
  lines?: SalesReturnLine[];
}

export interface SalesReturnLine {
  id: string;
  sales_return_id: string;
  item_id: string;
  quantity: number;
  unit_type: "piece" | "carton";
  pieces_count: number;
  unit_price_ex_vat: number;
  total_price_ex_vat: number;
  vat_rate: number;
  vat_amount: number;
  total_line_inc_vat: number;
  return_condition: "sellable" | "damaged";
  created_at: string;
  item?: Item;
}

export interface VanCustodyTransfer {
  id: string;
  transfer_number: string;
  source_warehouse_id: string;
  target_warehouse_id: string;
  assigned_rep_id: string | null;
  vehicle_id: string | null;
  transfer_type: "load_to_van" | "return_from_van";
  transfer_date: string;
  status: "draft" | "dispatched" | "confirmed_by_warehouse" | "cancelled";
  confirmed_by: string | null;
  confirmed_at: string | null;
  journal_entry_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  source_warehouse?: Warehouse;
  target_warehouse?: Warehouse;
  assigned_rep?: UserProfile | null;
  vehicle?: Vehicle | null;
  items?: VanCustodyItem[];
}

export interface VanCustodyItem {
  id: string;
  transfer_id: string;
  item_id: string;
  quantity: number;
  unit_type: "piece" | "carton";
  pieces_count: number;
  created_at: string;
  item?: Item;
}

export interface SalesRepCommission {
  id: string;
  rep_id: string;
  invoice_id: string | null;
  sales_return_id: string | null;
  commission_amount: number;
  calculation_basis: "percentage_of_sales" | "percentage_of_collection" | "manual_flat";
  percentage: number;
  status: "pending" | "approved" | "paid_in_payroll" | "paid_in_voucher";
  paid_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  rep?: UserProfile;
  invoice?: SalesInvoice | null;
}

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
  name?: string;
  capacity_liters: number;
  status: TankStatus;
  current_batch_id: string | null;
  current_qty_grams: number;
  is_active: boolean;
  created_at: string;
  current_batch?: MixingBatch | null;
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
      items: {
        Row: Item;
        Insert: Partial<Item> & { sku: string; name_ar: string; name_en: string; item_type: ItemType; base_unit: BaseUnit };
        Update: Partial<Item>;
        Relationships: [];
      };
      suppliers: {
        Row: Supplier;
        Insert: Partial<Supplier> & { name_ar: string };
        Update: Partial<Supplier>;
        Relationships: [];
      };
      purchase_orders: {
        Row: PurchaseOrder;
        Insert: Partial<PurchaseOrder> & { po_number: string; supplier_id: string };
        Update: Partial<PurchaseOrder>;
        Relationships: [];
      };
      purchase_order_lines: {
        Row: PurchaseOrderLine;
        Insert: Partial<PurchaseOrderLine> & { purchase_order_id: string; item_id: string; ordered_qty: number; unit_price_ex_vat: number };
        Update: Partial<PurchaseOrderLine>;
        Relationships: [];
      };
      purchase_receipts: {
        Row: PurchaseReceipt;
        Insert: Partial<PurchaseReceipt> & { receipt_number: string; supplier_id: string; warehouse_id: string };
        Update: Partial<PurchaseReceipt>;
        Relationships: [];
      };
      purchase_receipt_lines: {
        Row: PurchaseReceiptLine;
        Insert: Partial<PurchaseReceiptLine> & { receipt_id: string; item_id: string; received_qty: number; unit_cost_ex_vat: number; batch_number: string };
        Update: Partial<PurchaseReceiptLine>;
        Relationships: [];
      };
      fifo_layers: {
        Row: FifoLayer;
        Insert: Partial<FifoLayer> & { item_id: string; warehouse_id: string; batch_number: string; initial_qty: number; remaining_qty: number; unit_cost_ex_vat: number };
        Update: Partial<FifoLayer>;
        Relationships: [];
      };
      inventory_movements: {
        Row: InventoryMovement;
        Insert: Partial<InventoryMovement> & { movement_number: string; item_id: string; movement_type: MovementType; qty: number };
        Update: Partial<InventoryMovement>;
        Relationships: [];
      };
      negative_stock_queue: {
        Row: NegativeStockQueue;
        Insert: Partial<NegativeStockQueue> & { item_id: string; warehouse_id: string; qty_pending: number; estimated_cost: number };
        Update: Partial<NegativeStockQueue>;
        Relationships: [];
      };
      purchase_invoices: {
        Row: PurchaseInvoice;
        Insert: Partial<PurchaseInvoice> & { invoice_number: string; supplier_invoice_number: string; supplier_id: string };
        Update: Partial<PurchaseInvoice>;
        Relationships: [];
      };
      purchase_invoice_lines: {
        Row: PurchaseInvoiceLine;
        Insert: Partial<PurchaseInvoiceLine> & { invoice_id: string; item_id: string; qty: number; unit_price_ex_vat: number };
        Update: Partial<PurchaseInvoiceLine>;
        Relationships: [];
      };
      purchase_returns: {
        Row: PurchaseReturn;
        Insert: Partial<PurchaseReturn> & { return_number: string; supplier_id: string };
        Update: Partial<PurchaseReturn>;
        Relationships: [];
      };
      purchase_return_lines: {
        Row: PurchaseReturnLine;
        Insert: Partial<PurchaseReturnLine> & { return_id: string; item_id: string; claimed_qty: number; unit_price_ex_vat: number };
        Update: Partial<PurchaseReturnLine>;
        Relationships: [];
      };
      formulas: {
        Row: Formula;
        Insert: Partial<Formula> & { code: string; name_ar: string; name_en: string };
        Update: Partial<Formula>;
        Relationships: [];
      };
      formula_lines: {
        Row: FormulaLine;
        Insert: Partial<FormulaLine> & { formula_id: string; item_id: string; qty_grams: number };
        Update: Partial<FormulaLine>;
        Relationships: [];
      };
      packaging_specs: {
        Row: PackagingSpec;
        Insert: Partial<PackagingSpec> & { code: string; name_ar: string; name_en: string; finished_good_id: string; bulk_item_id: string; volume_per_unit_grams: number; bottle_item_id: string };
        Update: Partial<PackagingSpec>;
        Relationships: [];
      };
      mixing_batches: {
        Row: MixingBatch;
        Insert: Partial<MixingBatch> & { batch_number: string; formula_id: string; tank_id: string; planned_qty_grams: number };
        Update: Partial<MixingBatch>;
        Relationships: [];
      };
      mixing_consumptions: {
        Row: MixingConsumption;
        Insert: Partial<MixingConsumption> & { mixing_batch_id: string; item_id: string; qty_grams: number };
        Update: Partial<MixingConsumption>;
        Relationships: [];
      };
      packaging_orders: {
        Row: PackagingOrder;
        Insert: Partial<PackagingOrder> & { order_number: string; mixing_batch_id: string; packaging_spec_id: string; target_fg_item_id: string; units_produced: number; bulk_consumed_grams: number };
        Update: Partial<PackagingOrder>;
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
      rpc_receive_fifo: {
        Args: {
          p_receipt_id: string;
          p_created_by: string;
        };
        Returns: Json;
      };
      rpc_consume_fifo: {
        Args: {
          p_item_id: string;
          p_warehouse_id: string;
          p_qty: number;
          p_reference_type: string;
          p_reference_id: string;
          p_created_by: string;
        };
        Returns: Json;
      };
      rpc_post_opening_balances: {
        Args: {
          p_items_data: Json;
          p_created_by: string;
        };
        Returns: Json;
      };
      rpc_process_purchase_return_with_compensation: {
        Args: {
          p_return_id: string;
          p_created_by: string;
        };
        Returns: Json;
      };
      rpc_pre_production_check: {
        Args: {
          p_formula_id: string;
          p_batch_size_grams: number;
        };
        Returns: Json;
      };
      rpc_start_mixing_batch: {
        Args: {
          p_formula_id: string;
          p_tank_id: string;
          p_planned_qty_grams: number;
          p_created_by: string;
        };
        Returns: Json;
      };
      rpc_record_qc_test: {
        Args: {
          p_batch_id: string;
          p_ph: number;
          p_viscosity: number;
          p_odor_ok: boolean;
          p_color_ok: boolean;
          p_status: string;
          p_tested_by: string;
          p_notes: string;
        };
        Returns: Json;
      };
      rpc_execute_packaging_order: {
        Args: {
          p_batch_id: string;
          p_spec_id: string;
          p_units_produced: number;
          p_wasted_bottles: number;
          p_wasted_stickers: number;
          p_wasted_cartons: number;
          p_created_by: string;
        };
        Returns: Json;
      };
      rpc_close_tank_with_actual_yield: {
        Args: {
          p_batch_id: string;
          p_actual_yield_grams: number;
          p_closed_by: string;
        };
        Returns: Json;
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
      item_type: ItemType;
      base_unit: BaseUnit;
      purchase_order_status: PurchaseOrderStatus;
      movement_type: MovementType;
    };
    CompositeTypes: Record<string, never>;
  };
}
