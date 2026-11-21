-- ==============================================================================
-- 001_phase1_foundation.sql
-- Al-Asyah Detergent Factory ERP — Phase 1 Foundation Database Migration
-- Single Source of Truth: SPEC.md (v3.1)
-- ==============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Clean Existing Types if re-running
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('owner', 'accountant', 'production', 'warehouse', 'sales_rep');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'warehouse_type') THEN
    CREATE TYPE warehouse_type AS ENUM ('raw_materials', 'packaging', 'finished_goods', 'sales_van');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tank_status') THEN
    CREATE TYPE tank_status AS ENUM ('empty', 'mixing', 'pending_qc', 'ready_for_packaging', 'rework');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_type') THEN
    CREATE TYPE account_type AS ENUM ('header', 'asset', 'contra_asset', 'liability', 'equity', 'revenue', 'contra_revenue', 'expense');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
    CREATE TYPE notification_type AS ENUM ('info', 'warning', 'success', 'error', 'approval');
  END IF;
END $$;

-- 3. Factory Settings Table (Single-row pattern)
CREATE TABLE IF NOT EXISTS factory_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  vat_number VARCHAR(15) NOT NULL CHECK (length(vat_number) = 15 AND vat_number ~ '^[0-9]{15}$'),
  cr_number TEXT NOT NULL,
  national_address TEXT NOT NULL,
  iban TEXT NOT NULL,
  logo_base64 TEXT NULL,
  label_width_mm INTEGER NOT NULL DEFAULT 50 CHECK (label_width_mm > 0),
  label_height_mm INTEGER NOT NULL DEFAULT 30 CHECK (label_height_mm > 0),
  near_expiry_days INTEGER NOT NULL DEFAULT 60 CHECK (near_expiry_days >= 0),
  enable_fixed_assets BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Users Profile Table (Linked to Supabase Auth auth.users)
CREATE TABLE IF NOT EXISTS users_profile (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  role user_role NOT NULL,
  can_view_formulas BOOLEAN NOT NULL DEFAULT FALSE,
  can_view_costs BOOLEAN NOT NULL DEFAULT FALSE,
  can_approve_on_behalf BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Vehicles Table (Sales and Delivery Fleet)
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  assigned_rep_id UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Warehouses Table
CREATE TABLE IF NOT EXISTS warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  warehouse_type warehouse_type NOT NULL,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  assigned_rep_id UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Tanks Table (Bulk mixing tanks with capacity in Liters)
CREATE TABLE IF NOT EXISTS tanks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tank_code TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  capacity_liters NUMERIC(12, 2) NOT NULL CHECK (capacity_liters > 0),
  status tank_status NOT NULL DEFAULT 'empty',
  current_batch_id UUID NULL,
  current_qty_grams NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (current_qty_grams >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Chart of Accounts Table (Pre-seeded Industrial COA)
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  type account_type NOT NULL,
  parent_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  current_balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Fiscal Periods Table
CREATE TABLE IF NOT EXISTS fiscal_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  locked_at TIMESTAMPTZ NULL,
  locked_by UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_period_dates CHECK (end_date >= start_date)
);

-- 10. Security Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  table_name TEXT NULL,
  record_id TEXT NULL,
  old_values JSONB NULL,
  new_values JSONB NULL,
  ip_address TEXT NULL,
  details TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Live Notifications Table (Supabase Realtime enabled)
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users_profile(id) ON DELETE CASCADE,
  title_ar TEXT NOT NULL,
  title_en TEXT NOT NULL,
  message_ar TEXT NOT NULL,
  message_en TEXT NOT NULL,
  type notification_type NOT NULL DEFAULT 'info',
  link TEXT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Supabase Realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- ==============================================================================
-- 12. HELPER FUNCTIONS & RPC
-- ==============================================================================

-- Function to check current caller's profile
CREATE OR REPLACE FUNCTION get_current_user_profile()
RETURNS users_profile AS $$
  SELECT * FROM users_profile WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Function to check if caller is active owner
CREATE OR REPLACE FUNCTION is_owner()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users_profile
    WHERE id = auth.uid()
      AND role = 'owner'
      AND is_active = true
      AND deleted_at IS NULL
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Function to check if caller is owner or accountant
CREATE OR REPLACE FUNCTION is_accountant_or_owner()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users_profile
    WHERE id = auth.uid()
      AND role IN ('owner', 'accountant')
      AND is_active = true
      AND deleted_at IS NULL
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- RPC for Smart User Delete (Hard Delete if no history, Soft Delete if history exists)
CREATE OR REPLACE FUNCTION rpc_soft_delete_or_purge_user(
  target_user_id UUID,
  performing_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_has_audit BOOLEAN;
  v_has_periods BOOLEAN;
  v_has_warehouses BOOLEAN;
  v_has_vehicles BOOLEAN;
  v_user_name TEXT;
  v_user_role TEXT;
BEGIN
  -- Verify caller is active owner
  IF NOT EXISTS (
    SELECT 1 FROM users_profile
    WHERE id = performing_user_id
      AND role = 'owner'
      AND is_active = true
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only an active owner can perform user deletion';
  END IF;

  -- Get target user details
  SELECT full_name, role::text INTO v_user_name, v_user_role
  FROM users_profile
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user profile not found';
  END IF;

  -- Check for existing references across Phase 1 and future tables
  SELECT EXISTS (SELECT 1 FROM audit_logs WHERE user_id = target_user_id) INTO v_has_audit;
  SELECT EXISTS (SELECT 1 FROM fiscal_periods WHERE locked_by = target_user_id) INTO v_has_periods;
  SELECT EXISTS (SELECT 1 FROM warehouses WHERE assigned_rep_id = target_user_id) INTO v_has_warehouses;
  SELECT EXISTS (SELECT 1 FROM vehicles WHERE assigned_rep_id = target_user_id) INTO v_has_vehicles;

  IF v_has_audit OR v_has_periods OR v_has_warehouses OR v_has_vehicles THEN
    -- Soft Delete: preserve name in historical logs as "(الاسم - حساب محذوف)"
    UPDATE users_profile
    SET is_active = false,
        deleted_at = NOW(),
        full_name = v_user_name || ' (حساب محذوف)',
        updated_at = NOW()
    WHERE id = target_user_id;

    -- Unassign from vehicles and warehouses
    UPDATE warehouses SET assigned_rep_id = NULL WHERE assigned_rep_id = target_user_id;
    UPDATE vehicles SET assigned_rep_id = NULL WHERE assigned_rep_id = target_user_id;

    INSERT INTO audit_logs (user_id, action, table_name, record_id, details)
    VALUES (performing_user_id, 'USER_SOFT_DELETED', 'users_profile', target_user_id::text,
            'Soft deleted user ' || v_user_name || ' due to historical transaction records.');

    RETURN jsonb_build_object('status', 'soft_deleted', 'message', 'تم تعطيل الحساب ووسمه كحساب محذوف لحماية السجلات التاريخية');
  ELSE
    -- Hard Delete: Remove profile completely
    DELETE FROM users_profile WHERE id = target_user_id;

    INSERT INTO audit_logs (user_id, action, table_name, record_id, details)
    VALUES (performing_user_id, 'USER_HARD_DELETED', 'users_profile', target_user_id::text,
            'Permanently deleted user ' || v_user_name || ' (no historical records found).');

    RETURN jsonb_build_object('status', 'hard_deleted', 'message', 'تم حذف الحساب نهائياً لعدم وجود حركات سابقة');
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- 13. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE factory_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE users_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE tanks ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- factory_settings: Authenticated can view; Owner can update
CREATE POLICY "factory_settings_read" ON factory_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "factory_settings_update" ON factory_settings
  FOR UPDATE TO authenticated USING (is_owner()) WITH CHECK (is_owner());

-- users_profile: Authenticated can view active users; Owner can manage
CREATE POLICY "users_profile_read" ON users_profile
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "users_profile_insert" ON users_profile
  FOR INSERT TO authenticated WITH CHECK (is_owner());

CREATE POLICY "users_profile_update" ON users_profile
  FOR UPDATE TO authenticated USING (is_owner()) WITH CHECK (is_owner());

CREATE POLICY "users_profile_delete" ON users_profile
  FOR DELETE TO authenticated USING (is_owner());

-- vehicles: Authenticated can view; Owner and Accountant can manage
CREATE POLICY "vehicles_read" ON vehicles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "vehicles_manage" ON vehicles
  FOR ALL TO authenticated USING (is_accountant_or_owner()) WITH CHECK (is_accountant_or_owner());

-- warehouses: Authenticated can view; Owner and Accountant can manage
CREATE POLICY "warehouses_read" ON warehouses
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "warehouses_manage" ON warehouses
  FOR ALL TO authenticated USING (is_accountant_or_owner()) WITH CHECK (is_accountant_or_owner());

-- tanks: Authenticated can view; Owner, Accountant, and Production can update
CREATE POLICY "tanks_read" ON tanks
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "tanks_manage" ON tanks
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users_profile
      WHERE id = auth.uid() AND role IN ('owner', 'accountant', 'production')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users_profile
      WHERE id = auth.uid() AND role IN ('owner', 'accountant', 'production')
    )
  );

-- accounts: Authenticated can read; Owner can insert sub-accounts; System accounts protected
CREATE POLICY "accounts_read" ON accounts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "accounts_insert" ON accounts
  FOR INSERT TO authenticated WITH CHECK (is_owner());

CREATE POLICY "accounts_update" ON accounts
  FOR UPDATE TO authenticated USING (is_owner()) WITH CHECK (is_owner());

CREATE POLICY "accounts_delete" ON accounts
  FOR DELETE TO authenticated USING (is_owner() AND is_system = false);

-- fiscal_periods: Authenticated can read; Owner can manage/lock
CREATE POLICY "fiscal_periods_read" ON fiscal_periods
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "fiscal_periods_manage" ON fiscal_periods
  FOR ALL TO authenticated USING (is_owner()) WITH CHECK (is_owner());

-- audit_logs: Owner only can read; Any authenticated can write through functions/triggers
CREATE POLICY "audit_logs_read" ON audit_logs
  FOR SELECT TO authenticated USING (is_owner());

CREATE POLICY "audit_logs_insert" ON audit_logs
  FOR INSERT TO authenticated WITH CHECK (true);

-- notifications: Users see only their own notifications
CREATE POLICY "notifications_user_access" ON notifications
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ==============================================================================
-- 14. SEED DATA
-- ==============================================================================

-- Seed Factory Settings Singleton (ID = 1)
INSERT INTO factory_settings (
  id, name_ar, name_en, vat_number, cr_number, national_address, iban,
  label_width_mm, label_height_mm, near_expiry_days, enable_fixed_assets
)
VALUES (
  1,
  'مصنع الأسياح للمنظفات',
  'Al-Asyah Detergent Factory',
  '300000000000003',
  '1010000000',
  'الرياض، المملكة العربية السعودية',
  'SA0000000000000000000000',
  50,
  30,
  60,
  false
) ON CONFLICT (id) DO NOTHING;

-- Seed Saudi Industrial Chart of Accounts (SPEC.md Section 5)
-- Step 1: Headers (1000, 2000, 3000, 4000, 5000, 6000)
INSERT INTO accounts (id, code, name_ar, name_en, type, parent_id, is_system, is_active, current_balance)
VALUES
  ('a0000000-0000-0000-0000-000000001000', '1000', 'الأصول', 'Assets', 'header', NULL, true, true, 0.00),
  ('a0000000-0000-0000-0000-000000002000', '2000', 'الالتزامات', 'Liabilities', 'header', NULL, true, true, 0.00),
  ('a0000000-0000-0000-0000-000000003000', '3000', 'حقوق الملكية', 'Equity', 'header', NULL, true, true, 0.00),
  ('a0000000-0000-0000-0000-000000004000', '4000', 'الإيرادات', 'Revenue', 'header', NULL, true, true, 0.00),
  ('a0000000-0000-0000-0000-000000005000', '5000', 'تكلفة المبيعات', 'COGS', 'header', NULL, true, true, 0.00),
  ('a0000000-0000-0000-0000-000000006000', '6000', 'المصروفات التشغيلية والإدارية', 'Operating Expenses', 'header', NULL, true, true, 0.00)
ON CONFLICT (code) DO NOTHING;

-- Step 2: Sub-accounts under 1000 (Assets)
INSERT INTO accounts (code, name_ar, name_en, type, parent_id, is_system, is_active, current_balance)
VALUES
  ('1101', 'خزنة المصنع', 'Factory Cash Box', 'asset', 'a0000000-0000-0000-0000-000000001000', true, true, 0.00),
  ('1102', 'الحساب البنكي', 'Bank Account', 'asset', 'a0000000-0000-0000-0000-000000001000', true, true, 0.00),
  ('1103', 'شبكة مدى / تحويل بنكي', 'Mada / Bank Transfer', 'asset', 'a0000000-0000-0000-0000-000000001000', true, true, 0.00),
  ('1104', 'عهدة المشتريات', 'Purchasing Petty Cash', 'asset', 'a0000000-0000-0000-0000-000000001000', true, true, 0.00),
  ('1105', 'عهد تحصيل المندوبين (يتفرع لكل مندوب)', 'Sales Reps Cash Custody', 'asset', 'a0000000-0000-0000-0000-000000001000', true, true, 0.00),
  ('1110', 'ذمم العملاء', 'Accounts Receivable', 'asset', 'a0000000-0000-0000-0000-000000001000', true, true, 0.00),
  ('1112', 'دفعات مقدمة للموردين (عربون شراء)', 'Supplier Advances', 'asset', 'a0000000-0000-0000-0000-000000001000', true, true, 0.00),
  ('1115', 'أوراق قبض (شيكات وسندات لأمر)', 'Notes & Checks Receivable', 'asset', 'a0000000-0000-0000-0000-000000001000', true, true, 0.00),
  ('1120', 'سُلف الموظفين', 'Employee Advances', 'asset', 'a0000000-0000-0000-0000-000000001000', true, true, 0.00),
  ('1131', 'مخزون المواد الخام', 'Raw Materials Inventory', 'asset', 'a0000000-0000-0000-0000-000000001000', true, true, 0.00),
  ('1132', 'مخزون مواد التعبئة والتغليف', 'Packaging Materials Inventory', 'asset', 'a0000000-0000-0000-0000-000000001000', true, true, 0.00),
  ('1133', 'مخزون تحت التشغيل (السائب في التانكات)', 'WIP Inventory (Bulk Tanks)', 'asset', 'a0000000-0000-0000-0000-000000001000', true, true, 0.00),
  ('1134', 'مخزون المنتج التام', 'Finished Goods Inventory', 'asset', 'a0000000-0000-0000-0000-000000001000', true, true, 0.00),
  ('1135', 'بضاعة عهدة سيارات المندوبين', 'Sales Vans Inventory Custody', 'asset', 'a0000000-0000-0000-0000-000000001000', true, true, 0.00),
  ('1140', 'ضريبة القيمة المضافة — مدخلات (15%)', 'Input VAT Receivable', 'asset', 'a0000000-0000-0000-0000-000000001000', true, true, 0.00),
  ('1200', 'الأصول الثابتة (تُفعّل من الإعدادات)', 'Fixed Assets', 'asset', 'a0000000-0000-0000-0000-000000001000', true, true, 0.00),
  ('1290', 'مجمع إهلاك الأصول الثابتة', 'Accumulated Depreciation', 'contra_asset', 'a0000000-0000-0000-0000-000000001000', true, true, 0.00)
ON CONFLICT (code) DO NOTHING;

-- Step 3: Sub-accounts under 2000 (Liabilities)
INSERT INTO accounts (code, name_ar, name_en, type, parent_id, is_system, is_active, current_balance)
VALUES
  ('2101', 'ذمم الموردين', 'Accounts Payable', 'liability', 'a0000000-0000-0000-0000-000000002000', true, true, 0.00),
  ('2102', 'دفعات مقدمة من العملاء (عربون بيع)', 'Customer Advances', 'liability', 'a0000000-0000-0000-0000-000000002000', true, true, 0.00),
  ('2105', 'أوراق دفع (شيكات وسندات لأمر)', 'Notes & Checks Payable', 'liability', 'a0000000-0000-0000-0000-000000002000', true, true, 0.00),
  ('2110', 'ضريبة القيمة المضافة — مخرجات (15%)', 'Output VAT Payable', 'liability', 'a0000000-0000-0000-0000-000000002000', true, true, 0.00),
  ('2120', 'رواتب وعمولات مستحقة', 'Accrued Salaries & Commissions', 'liability', 'a0000000-0000-0000-0000-000000002000', true, true, 0.00)
ON CONFLICT (code) DO NOTHING;

-- Step 4: Sub-accounts under 3000 (Equity)
INSERT INTO accounts (code, name_ar, name_en, type, parent_id, is_system, is_active, current_balance)
VALUES
  ('3101', 'رأس المال', 'Capital', 'equity', 'a0000000-0000-0000-0000-000000003000', true, true, 0.00),
  ('3102', 'تسوية الأرصدة الافتتاحية', 'Opening Balance Equity', 'equity', 'a0000000-0000-0000-0000-000000003000', true, true, 0.00),
  ('3201', 'الأرباح المبقاة (يُرحّل إليها عند الإقفال السنوي)', 'Retained Earnings', 'equity', 'a0000000-0000-0000-0000-000000003000', true, true, 0.00)
ON CONFLICT (code) DO NOTHING;

-- Step 5: Sub-accounts under 4000 (Revenue)
INSERT INTO accounts (code, name_ar, name_en, type, parent_id, is_system, is_active, current_balance)
VALUES
  ('4101', 'إيرادات المبيعات', 'Sales Revenue', 'revenue', 'a0000000-0000-0000-0000-000000004000', true, true, 0.00),
  ('4102', 'مردودات ومسموحات المبيعات (إشعارات دائنة)', 'Sales Returns & Credit Notes', 'contra_revenue', 'a0000000-0000-0000-0000-000000004000', true, true, 0.00),
  ('4201', 'تعويضات الموردين عن خامات تالفة مستهلكة', 'Supplier Defect Compensation', 'revenue', 'a0000000-0000-0000-0000-000000004000', true, true, 0.00)
ON CONFLICT (code) DO NOTHING;

-- Step 6: Sub-accounts under 5000 (COGS)
INSERT INTO accounts (code, name_ar, name_en, type, parent_id, is_system, is_active, current_balance)
VALUES
  ('5101', 'تكلفة البضاعة المباعة (FIFO)', 'Cost of Goods Sold (FIFO)', 'expense', 'a0000000-0000-0000-0000-000000005000', true, true, 0.00),
  ('5102', 'فروق تسوية تكلفة البيع بالسالب', 'Negative Stock Cost Variance', 'expense', 'a0000000-0000-0000-0000-000000005000', true, true, 0.00)
ON CONFLICT (code) DO NOTHING;

-- Step 7: Sub-accounts under 6000 (Operating Expenses)
INSERT INTO accounts (code, name_ar, name_en, type, parent_id, is_system, is_active, current_balance)
VALUES
  ('6101', 'مصروفات الرواتب والبدلات والعمولات', 'Salaries, Allowances & Commissions', 'expense', 'a0000000-0000-0000-0000-000000006000', true, true, 0.00),
  ('6102', 'مصروف الكهرباء والمياه', 'Electricity & Water', 'expense', 'a0000000-0000-0000-0000-000000006000', true, true, 0.00),
  ('6103', 'مصروف الإيجار', 'Rent Expense', 'expense', 'a0000000-0000-0000-0000-000000006000', true, true, 0.00),
  ('6104', 'مصروف النقل والشحن (النولون العام)', 'General Freight & Transport', 'expense', 'a0000000-0000-0000-0000-000000006000', true, true, 0.00),
  ('6105', 'مصروف الهالك والتالف (إنتاج / فاقد تانك / تعبئة / مرتجع تالف)', 'Scrap & Spoilage Expense', 'expense', 'a0000000-0000-0000-0000-000000006000', true, true, 0.00),
  ('6106', 'مصروف العينات المجانية وبضاعة البونص', 'Samples & Bonus Goods Expense', 'expense', 'a0000000-0000-0000-0000-000000006000', true, true, 0.00),
  ('6107', 'فروق وعجز الجرد', 'Inventory Shortage / Adjustment', 'expense', 'a0000000-0000-0000-0000-000000006000', true, true, 0.00),
  ('6108', 'مصروف إهلاك الأصول الثابتة', 'Depreciation Expense', 'expense', 'a0000000-0000-0000-0000-000000006000', true, true, 0.00),
  ('6109', 'مصاريف سيارات التوزيع (بنزين، زيت، صيانة، مخالفات — مربوطة بالسيارة)', 'Delivery Vehicles Expenses', 'expense', 'a0000000-0000-0000-0000-000000006000', true, true, 0.00)
ON CONFLICT (code) DO NOTHING;
