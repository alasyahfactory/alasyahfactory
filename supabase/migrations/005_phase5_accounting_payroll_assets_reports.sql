-- ==============================================================================
-- 005_phase5_accounting_payroll_assets_reports.sql
-- Al-Asyah Detergent Factory ERP — Phase 5: Accounting, Payroll, Fixed Assets, Approvals & Reporting
-- Single Source of Truth: SPEC.md (v3.1)
-- Fully Idempotent, High Performance & Double-Entry Ledger Compliant
-- ==============================================================================

-- 1. Sequences for Phase 5
CREATE SEQUENCE IF NOT EXISTS seq_vouchers START WITH 1001;
CREATE SEQUENCE IF NOT EXISTS seq_employee_advances START WITH 1001;
CREATE SEQUENCE IF NOT EXISTS seq_payroll_runs START WITH 1001;
CREATE SEQUENCE IF NOT EXISTS seq_fixed_assets START WITH 101;
CREATE SEQUENCE IF NOT EXISTS seq_checks START WITH 1001;
CREATE SEQUENCE IF NOT EXISTS seq_approval_requests START WITH 1001;

-- 2. Vouchers Table (Receipt, Payment & Transfer Vouchers)
CREATE TABLE IF NOT EXISTS vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_number TEXT NOT NULL UNIQUE,
  voucher_type TEXT NOT NULL CHECK (voucher_type IN ('receipt', 'payment', 'transfer')),
  voucher_date DATE NOT NULL DEFAULT CURRENT_DATE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  contra_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (tax_rate >= 0),
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
  total_amount NUMERIC(14,2) NOT NULL CHECK (total_amount > 0),
  payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'bank_transfer', 'check', 'pos', 'advance')),
  reference_type TEXT NULL CHECK (reference_type IN ('sales_invoice', 'purchase_invoice', 'customer_advance', 'supplier_advance', 'employee_advance', 'expense', 'manual', 'rep_custody')),
  reference_id UUID NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  sales_rep_id UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('draft', 'posted', 'cancelled')),
  created_by UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Checks and Notes Table (Commercial Paper: Receivables & Payables)
CREATE TABLE IF NOT EXISTS checks_and_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_number TEXT NOT NULL,
  check_type TEXT NOT NULL CHECK (check_type IN ('received', 'issued')),
  bank_name TEXT NOT NULL,
  due_date DATE NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  voucher_id UUID REFERENCES vouchers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'under_collection' CHECK (status IN ('under_collection', 'collected', 'bounced', 'cancelled')),
  collected_date DATE NULL,
  collected_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  notes TEXT NULL,
  created_by UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Employees Table
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emp_code TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  phone TEXT NOT NULL,
  national_id TEXT NOT NULL,
  job_title TEXT NOT NULL,
  department TEXT NOT NULL CHECK (department IN ('production', 'warehouse', 'sales', 'management', 'accounting', 'maintenance')),
  basic_salary NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (basic_salary >= 0),
  housing_allowance NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (housing_allowance >= 0),
  transport_allowance NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (transport_allowance >= 0),
  other_allowances NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (other_allowances >= 0),
  iban TEXT NULL,
  join_date DATE NOT NULL DEFAULT CURRENT_DATE,
  user_profile_id UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Employee Advances Table
CREATE TABLE IF NOT EXISTS employee_advances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advance_number TEXT NOT NULL UNIQUE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  advance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  installment_months INTEGER NOT NULL DEFAULT 1 CHECK (installment_months > 0),
  monthly_deduction NUMERIC(12,2) NOT NULL CHECK (monthly_deduction > 0),
  recovered_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (recovered_amount >= 0),
  remaining_balance NUMERIC(12,2) NOT NULL CHECK (remaining_balance >= 0),
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  notes TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'settled', 'cancelled')),
  created_by UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Payroll Runs & Lines Table
CREATE TABLE IF NOT EXISTS payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_number TEXT NOT NULL UNIQUE,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL CHECK (year >= 2024),
  payroll_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_basic NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  total_allowances NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  total_commissions NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  total_overtime NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  total_deductions NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  total_advance_deductions NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  net_payable NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid', 'cancelled')),
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  notes TEXT NULL,
  created_by UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payroll_run_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  basic_salary NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  housing_allowance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  transport_allowance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  other_allowance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  overtime_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  bonus_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  absence_deduction NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  penalty_deduction NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  advance_deduction NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  net_salary NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Fixed Assets & Depreciation Logs Table
CREATE TABLE IF NOT EXISTS fixed_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_code TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('machinery_equipment', 'vehicles', 'tanks_infrastructure', 'furniture_fixtures', 'computers_software')),
  purchase_date DATE NOT NULL,
  purchase_cost NUMERIC(14,2) NOT NULL CHECK (purchase_cost > 0),
  salvage_value NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (salvage_value >= 0),
  useful_life_months INTEGER NOT NULL CHECK (useful_life_months > 0),
  asset_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  depreciation_expense_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  accumulated_depreciation_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  accumulated_depreciation NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (accumulated_depreciation >= 0),
  book_value NUMERIC(14,2) NOT NULL CHECK (book_value >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'fully_depreciated', 'disposed', 'written_off')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS depreciation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  depreciation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL CHECK (year >= 2024),
  depreciation_amount NUMERIC(12,2) NOT NULL CHECK (depreciation_amount > 0),
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Approval Requests Table (Management Approvals Center)
CREATE TABLE IF NOT EXISTS approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type TEXT NOT NULL CHECK (request_type IN ('purchase_order', 'credit_limit_override', 'manual_journal_entry', 'spoilage_write_off', 'discount_override', 'payroll_approval')),
  reference_id UUID NULL,
  reference_number TEXT NOT NULL,
  requester_id UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  amount NUMERIC(14,2) NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ NULL,
  rejection_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Enable Row Level Security (RLS)
ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE checks_and_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_run_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE depreciation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;

-- 10. RLS Policies
CREATE POLICY "Public read for authenticated users" ON vouchers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Accountant and owner full control on vouchers" ON vouchers FOR ALL TO authenticated USING (is_accountant_or_owner()) WITH CHECK (is_accountant_or_owner());

CREATE POLICY "Public read for authenticated users on checks" ON checks_and_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Accountant and owner full control on checks" ON checks_and_notes FOR ALL TO authenticated USING (is_accountant_or_owner()) WITH CHECK (is_accountant_or_owner());

CREATE POLICY "Public read for authenticated users on employees" ON employees FOR SELECT TO authenticated USING (true);
CREATE POLICY "Accountant and owner full control on employees" ON employees FOR ALL TO authenticated USING (is_accountant_or_owner()) WITH CHECK (is_accountant_or_owner());

CREATE POLICY "Public read for authenticated users on advances" ON employee_advances FOR SELECT TO authenticated USING (true);
CREATE POLICY "Accountant and owner full control on advances" ON employee_advances FOR ALL TO authenticated USING (is_accountant_or_owner()) WITH CHECK (is_accountant_or_owner());

CREATE POLICY "Public read for authenticated users on payroll" ON payroll_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Accountant and owner full control on payroll" ON payroll_runs FOR ALL TO authenticated USING (is_accountant_or_owner()) WITH CHECK (is_accountant_or_owner());

CREATE POLICY "Public read for authenticated users on payroll lines" ON payroll_run_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Accountant and owner full control on payroll lines" ON payroll_run_lines FOR ALL TO authenticated USING (is_accountant_or_owner()) WITH CHECK (is_accountant_or_owner());

CREATE POLICY "Public read for authenticated users on fixed assets" ON fixed_assets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Accountant and owner full control on fixed assets" ON fixed_assets FOR ALL TO authenticated USING (is_accountant_or_owner()) WITH CHECK (is_accountant_or_owner());

CREATE POLICY "Public read for authenticated users on depreciation logs" ON depreciation_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Accountant and owner full control on depreciation logs" ON depreciation_logs FOR ALL TO authenticated USING (is_accountant_or_owner()) WITH CHECK (is_accountant_or_owner());

CREATE POLICY "Authenticated users can read approval requests" ON approval_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert approval requests" ON approval_requests FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Owner can update approval requests" ON approval_requests FOR UPDATE TO authenticated USING (is_owner()) WITH CHECK (is_owner());

-- 11. Helper Seed Data for Sample Staff & Assets
DO $$
DECLARE
  v_prod_user UUID;
  v_wh_user UUID;
  v_rep_user UUID;
  v_veh_id UUID;
  v_mach_acc UUID;
  v_dep_exp_acc UUID;
  v_acc_dep_acc UUID;
BEGIN
  SELECT id INTO v_prod_user FROM users_profile WHERE role = 'production' LIMIT 1;
  SELECT id INTO v_wh_user FROM users_profile WHERE role = 'warehouse' LIMIT 1;
  SELECT id INTO v_rep_user FROM users_profile WHERE role = 'sales_rep' LIMIT 1;
  SELECT id INTO v_veh_id FROM vehicles LIMIT 1;
  
  SELECT id INTO v_mach_acc FROM accounts WHERE code = '1201' LIMIT 1;
  SELECT id INTO v_dep_exp_acc FROM accounts WHERE code = '6108' LIMIT 1;
  SELECT id INTO v_acc_dep_acc FROM accounts WHERE code = '1290' LIMIT 1;

  IF NOT EXISTS (SELECT 1 FROM employees WHERE emp_code = 'EMP-001') THEN
    INSERT INTO employees (emp_code, name_ar, name_en, phone, national_id, job_title, department, basic_salary, housing_allowance, transport_allowance, user_profile_id)
    VALUES 
      ('EMP-001', 'أحمد محمود العتيبي', 'Ahmed Al-Otaibi', '0501112233', '1088776655', 'مشرف خطوط خلط وإنتاج', 'production', 4500.00, 1000.00, 500.00, v_prod_user),
      ('EMP-002', 'محمد حسن الزهراني', 'Mohammed Al-Zahrani', '0502223344', '1099887766', 'أمين مستودعات وتوريد', 'warehouse', 4000.00, 800.00, 400.00, v_wh_user),
      ('EMP-003', 'خالد صالح الحربي', 'Khalid Al-Harbi', '0503334455', '1077665544', 'مندوب مبيعات وتوزيع ميداني', 'sales', 3500.00, 700.00, 500.00, v_rep_user);
  END IF;

  IF v_mach_acc IS NOT NULL AND NOT EXISTS (SELECT 1 FROM fixed_assets WHERE asset_code = 'AST-001') THEN
    INSERT INTO fixed_assets (asset_code, name_ar, name_en, category, purchase_date, purchase_cost, salvage_value, useful_life_months, asset_account_id, depreciation_expense_account_id, accumulated_depreciation_account_id, accumulated_depreciation, book_value)
    VALUES
      ('AST-001', 'خلاط صناعي ستانلس ستيل 5000 لتر', 'Industrial SS Mixing Tank 5000L', 'machinery_equipment', '2024-01-01', 85000.00, 5000.00, 120, v_mach_acc, v_dep_exp_acc, v_acc_dep_acc, 7000.00, 78000.00),
      ('AST-002', 'خط تعبئة وتغليف آلي 4 فوهات', 'Automatic 4-Nozzle Bottling Line', 'machinery_equipment', '2024-03-01', 120000.00, 10000.00, 84, v_mach_acc, v_dep_exp_acc, v_acc_dep_acc, 11000.00, 109000.00);
  END IF;
END $$;

-- ==============================================================================
-- 12. ATOMIC RPC ENGINES FOR PHASE 5
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- RPC 1: rpc_create_manual_journal_entry
-- Double-entry balanced manual journal entry with strict validation
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_create_manual_journal_entry(
  p_entry_date DATE,
  p_description TEXT,
  p_lines JSONB,
  p_created_by UUID
)
RETURNS JSONB AS $$
DECLARE
  v_seq INT;
  v_year TEXT;
  v_entry_number TEXT;
  v_total_debit NUMERIC(14,2) := 0;
  v_total_credit NUMERIC(14,2) := 0;
  v_entry_id UUID;
  v_line JSONB;
  v_acc_id UUID;
  v_debit NUMERIC(14,2);
  v_credit NUMERIC(14,2);
  v_desc TEXT;
  v_cost_center UUID;
BEGIN
  -- 1. Check Fiscal Period Lock
  IF EXISTS (
    SELECT 1 FROM fiscal_periods
    WHERE start_date <= p_entry_date
      AND end_date >= p_entry_date
      AND is_locked = true
  ) THEN
    RAISE EXCEPTION 'لا يمكن تسجيل قيد في فترة مالية مقفلة / Cannot post journal entry in a locked fiscal period';
  END IF;

  -- 2. Verify Array Elements and Calculate Debits vs Credits
  IF jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'يجب أن يحتوي القيد على طرفين على الأقل (مدين ودائن) / Journal entry must have at least 2 lines';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_debit := COALESCE((v_line->>'debit')::NUMERIC, 0);
    v_credit := COALESCE((v_line->>'credit')::NUMERIC, 0);

    IF v_debit < 0 OR v_credit < 0 THEN
      RAISE EXCEPTION 'مبالغ القيد يجب أن تكون موجبة / Debit and Credit amounts must be non-negative';
    END IF;
    IF v_debit > 0 AND v_credit > 0 THEN
      RAISE EXCEPTION 'لا يمكن وضع مدين ودائن في نفس السطر / Line cannot have both debit and credit';
    END IF;
    IF v_debit = 0 AND v_credit = 0 THEN
      RAISE EXCEPTION 'يجب تحديد مبلغ مدين أو دائن في كل سطر / Line must have either debit or credit';
    END IF;

    v_total_debit := v_total_debit + v_debit;
    v_total_credit := v_total_credit + v_credit;
  END LOOP;

  -- Assert exact balance (difference must be 0)
  IF ABS(v_total_debit - v_total_credit) > 0.001 THEN
    RAISE EXCEPTION 'القيد غير متوازن: إجمالي المدين (%) لا يساوي إجمالي الدائن (%) / Unbalanced entry: Debit (%) != Credit (%)',
      v_total_debit, v_total_credit, v_total_debit, v_total_credit;
  END IF;

  -- 3. Generate Sequential Number JV-YYYY-XXXX
  v_year := TO_CHAR(p_entry_date, 'YYYY');
  v_seq := nextval('seq_journal_entries');
  v_entry_number := 'JV-' || v_year || '-' || LPAD(v_seq::TEXT, 4, '0');

  -- 4. Insert Journal Header
  INSERT INTO journal_entries (
    entry_number,
    entry_date,
    description,
    ref_type,
    ref_id,
    is_posted,
    status,
    total_debit,
    total_credit,
    created_by
  ) VALUES (
    v_entry_number,
    p_entry_date,
    p_description,
    'manual',
    NULL,
    true,
    'posted',
    v_total_debit,
    v_total_credit,
    p_created_by
  ) RETURNING id INTO v_entry_id;

  -- 5. Insert Lines and Update Account Balances
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_acc_id := (v_line->>'account_id')::UUID;
    v_debit := COALESCE((v_line->>'debit')::NUMERIC, 0);
    v_credit := COALESCE((v_line->>'credit')::NUMERIC, 0);
    v_desc := COALESCE(v_line->>'description', p_description);
    v_cost_center := (v_line->>'cost_center_van_id')::UUID;

    INSERT INTO journal_lines (
      journal_entry_id,
      account_id,
      debit,
      credit,
      description,
      cost_center_van_id
    ) VALUES (
      v_entry_id,
      v_acc_id,
      v_debit,
      v_credit,
      v_desc,
      v_cost_center
    );

    -- Update current balance based on account normal balance
    UPDATE accounts
    SET current_balance = CASE
      WHEN type IN ('asset', 'expense', 'contra_revenue') THEN current_balance + (v_debit - v_credit)
      ELSE current_balance + (v_credit - v_debit)
    END
    WHERE id = v_acc_id;
  END LOOP;

  -- 6. Audit Log
  INSERT INTO audit_logs (user_id, action, table_name, record_id, details)
  VALUES (
    p_created_by,
    'CREATE_MANUAL_JOURNAL_ENTRY',
    'journal_entries',
    v_entry_id::TEXT,
    'Manual entry ' || v_entry_number || ' total: ' || v_total_debit::TEXT || ' SAR'
  );

  RETURN jsonb_build_object(
    'success', true,
    'journal_entry_id', v_entry_id,
    'entry_number', v_entry_number,
    'total_amount', v_total_debit
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ------------------------------------------------------------------------------
-- RPC 2: rpc_post_voucher
-- Handles Receipt (RV), Payment (PV), and Internal Transfer (TV) vouchers
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_post_voucher(
  p_voucher_type TEXT,
  p_voucher_date DATE,
  p_account_id UUID,
  p_contra_account_id UUID,
  p_amount NUMERIC(14,2),
  p_tax_rate NUMERIC(5,2),
  p_payment_method TEXT,
  p_reference_type TEXT,
  p_reference_id UUID,
  p_customer_id UUID,
  p_supplier_id UUID,
  p_vehicle_id UUID,
  p_sales_rep_id UUID,
  p_description TEXT,
  p_check_number TEXT,
  p_check_bank TEXT,
  p_check_due_date DATE,
  p_created_by UUID
)
RETURNS JSONB AS $$
DECLARE
  v_seq INT;
  v_year TEXT;
  v_prefix TEXT;
  v_voucher_number TEXT;
  v_tax_amount NUMERIC(14,2) := 0;
  v_total_amount NUMERIC(14,2);
  v_voucher_id UUID;
  v_jv_id UUID;
  v_jv_number TEXT;
  v_vat_acc UUID;
BEGIN
  -- 1. Check Fiscal Period
  IF EXISTS (
    SELECT 1 FROM fiscal_periods
    WHERE start_date <= p_voucher_date
      AND end_date >= p_voucher_date
      AND is_locked = true
  ) THEN
    RAISE EXCEPTION 'لا يمكن تسجيل سند في فترة مالية مقفلة / Cannot post voucher in a locked fiscal period';
  END IF;

  -- 2. Calculate VAT
  IF p_tax_rate > 0 THEN
    v_tax_amount := ROUND((p_amount * p_tax_rate / 100.0), 2);
  END IF;
  v_total_amount := p_amount + v_tax_amount;

  -- 3. Determine Number Prefix
  IF p_voucher_type = 'receipt' THEN
    v_prefix := 'RV-';
  ELSIF p_voucher_type = 'payment' THEN
    v_prefix := 'PV-';
  ELSE
    v_prefix := 'TV-';
  END IF;

  v_year := TO_CHAR(p_voucher_date, 'YYYY');
  v_seq := nextval('seq_vouchers');
  v_voucher_number := v_prefix || v_year || '-' || LPAD(v_seq::TEXT, 4, '0');

  -- 4. Create Voucher Record
  INSERT INTO vouchers (
    voucher_number,
    voucher_type,
    voucher_date,
    account_id,
    contra_account_id,
    amount,
    tax_rate,
    tax_amount,
    total_amount,
    payment_method,
    reference_type,
    reference_id,
    customer_id,
    supplier_id,
    vehicle_id,
    sales_rep_id,
    description,
    status,
    created_by
  ) VALUES (
    v_voucher_number,
    p_voucher_type,
    p_voucher_date,
    p_account_id,
    p_contra_account_id,
    p_amount,
    p_tax_rate,
    v_tax_amount,
    v_total_amount,
    p_payment_method,
    p_reference_type,
    p_reference_id,
    p_customer_id,
    p_supplier_id,
    p_vehicle_id,
    p_sales_rep_id,
    p_description,
    'posted',
    p_created_by
  ) RETURNING id INTO v_voucher_id;

  -- 5. If Check Method, create Check Record
  IF p_payment_method = 'check' AND p_check_number IS NOT NULL THEN
    INSERT INTO checks_and_notes (
      check_number,
      check_type,
      bank_name,
      due_date,
      amount,
      customer_id,
      supplier_id,
      voucher_id,
      status,
      created_by
    ) VALUES (
      p_check_number,
      CASE WHEN p_voucher_type = 'receipt' THEN 'received' ELSE 'issued' END,
      COALESCE(p_check_bank, 'البنك'),
      COALESCE(p_check_due_date, p_voucher_date),
      v_total_amount,
      p_customer_id,
      p_supplier_id,
      v_voucher_id,
      'under_collection',
      p_created_by
    );
  END IF;

  -- 6. Generate Balanced Journal Entry
  v_seq := nextval('seq_journal_entries');
  v_jv_number := 'JV-' || v_year || '-' || LPAD(v_seq::TEXT, 4, '0');

  INSERT INTO journal_entries (
    entry_number,
    entry_date,
    description,
    ref_type,
    ref_id,
    is_posted,
    status,
    total_debit,
    total_credit,
    created_by
  ) VALUES (
    v_jv_number,
    p_voucher_date,
    'قيد ' || v_voucher_number || ' - ' || p_description,
    'voucher',
    v_voucher_id,
    true,
    'posted',
    v_total_amount,
    v_total_amount,
    p_created_by
  ) RETURNING id INTO v_jv_id;

  UPDATE vouchers SET journal_entry_id = v_jv_id WHERE id = v_voucher_id;

  -- 7. Post Lines Based on Voucher Type
  IF p_voucher_type = 'receipt' THEN
    -- سند قبض: Dr: النقدية/البنك (Account ID) | Cr: ذمم العميل / الدفعة المقدمة (Contra Account ID)
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_jv_id, p_account_id, v_total_amount, 0, p_description);

    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_jv_id, p_contra_account_id, 0, v_total_amount, p_description);

    -- If linked to sales invoice, mark invoice paid/partially paid
    IF p_reference_type = 'sales_invoice' AND p_reference_id IS NOT NULL THEN
      UPDATE sales_invoices
      SET paid_amount = paid_amount + v_total_amount,
          payment_status = CASE
            WHEN (paid_amount + v_total_amount) >= net_amount_due THEN 'paid'
            ELSE 'partially_paid'
          END
      WHERE id = p_reference_id;
    END IF;

  ELSIF p_voucher_type = 'payment' THEN
    -- سند صرف: Dr: المصروف/المورد (Contra Account ID) + ضريبة المدخلات 2104 | Cr: النقدية/البنك (Account ID)
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_jv_id, p_contra_account_id, p_amount, 0, p_description);

    IF v_tax_amount > 0 THEN
      SELECT id INTO v_vat_acc FROM accounts WHERE code = '2104' LIMIT 1;
      IF v_vat_acc IS NOT NULL THEN
        INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
        VALUES (v_jv_id, v_vat_acc, v_tax_amount, 0, 'ضريبة مدخلات 15%');
      END IF;
    END IF;

    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_jv_id, p_account_id, 0, v_total_amount, p_description);

    -- If linked to purchase invoice, mark paid
    IF p_reference_type = 'purchase_invoice' AND p_reference_id IS NOT NULL THEN
      UPDATE purchase_invoices
      SET paid_amount = paid_amount + v_total_amount,
          payment_status = CASE
            WHEN (paid_amount + v_total_amount) >= total_inc_vat THEN 'paid'
            ELSE 'partially_paid'
          END
      WHERE id = p_reference_id;
    END IF;

  ELSE -- Transfer Voucher
    -- تحويل داخلي: Dr: الصندوق/العهدة المحول لها | Cr: الصندوق/البنك المحول منه
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_jv_id, p_contra_account_id, v_total_amount, 0, p_description);

    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_jv_id, p_account_id, 0, v_total_amount, p_description);
  END IF;

  -- 8. Update Account Balances
  UPDATE accounts
  SET current_balance = CASE
    WHEN type IN ('asset', 'expense', 'contra_revenue') THEN current_balance + (
      CASE WHEN p_voucher_type = 'receipt' THEN v_total_amount ELSE -v_total_amount END
    )
    ELSE current_balance - (
      CASE WHEN p_voucher_type = 'receipt' THEN v_total_amount ELSE -v_total_amount END
    )
  END
  WHERE id = p_account_id;

  UPDATE accounts
  SET current_balance = CASE
    WHEN type IN ('asset', 'expense', 'contra_revenue') THEN current_balance + (
      CASE WHEN p_voucher_type = 'receipt' THEN -v_total_amount ELSE p_amount END
    )
    ELSE current_balance + (
      CASE WHEN p_voucher_type = 'receipt' THEN v_total_amount ELSE -p_amount END
    )
  END
  WHERE id = p_contra_account_id;

  -- 9. Audit Log
  INSERT INTO audit_logs (user_id, action, table_name, record_id, details)
  VALUES (
    p_created_by,
    'POST_VOUCHER',
    'vouchers',
    v_voucher_id::TEXT,
    'Posted ' || v_voucher_number || ' total: ' || v_total_amount::TEXT || ' SAR'
  );

  RETURN jsonb_build_object(
    'success', true,
    'voucher_id', v_voucher_id,
    'voucher_number', v_voucher_number,
    'journal_entry_id', v_jv_id,
    'total_amount', v_total_amount
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ------------------------------------------------------------------------------
-- RPC 3: rpc_collect_check
-- Clears a check / note, moves funds to Cash/Bank, and posts JV
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_collect_check(
  p_check_id UUID,
  p_collection_account_id UUID,
  p_collection_date DATE,
  p_created_by UUID
)
RETURNS JSONB AS $$
DECLARE
  v_chk RECORD;
  v_seq INT;
  v_year TEXT;
  v_jv_id UUID;
  v_jv_number TEXT;
  v_chk_acc UUID;
BEGIN
  SELECT * INTO v_chk FROM checks_and_notes WHERE id = p_check_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الشيك غير موجود / Check not found';
  END IF;
  IF v_chk.status = 'collected' THEN
    RAISE EXCEPTION 'تم تحصيل هذا الشيك مسبقاً / Check is already collected';
  END IF;

  v_year := TO_CHAR(p_collection_date, 'YYYY');
  v_seq := nextval('seq_journal_entries');
  v_jv_number := 'JV-' || v_year || '-' || LPAD(v_seq::TEXT, 4, '0');

  -- Get Check Account
  IF v_chk.check_type = 'received' THEN
    SELECT id INTO v_chk_acc FROM accounts WHERE code = '1115' LIMIT 1;
    IF v_chk_acc IS NULL THEN SELECT id INTO v_chk_acc FROM accounts WHERE code = '1160' LIMIT 1; END IF;
  ELSE
    SELECT id INTO v_chk_acc FROM accounts WHERE code = '2105' LIMIT 1;
  END IF;

  -- Create JV
  INSERT INTO journal_entries (
    entry_number,
    entry_date,
    description,
    ref_type,
    ref_id,
    is_posted,
    status,
    total_debit,
    total_credit,
    created_by
  ) VALUES (
    v_jv_number,
    p_collection_date,
    'تحصيل شيك رقم ' || v_chk.check_number || ' - ' || v_chk.bank_name,
    'check_collection',
    p_check_id,
    true,
    'posted',
    v_chk.amount,
    v_chk.amount,
    p_created_by
  ) RETURNING id INTO v_jv_id;

  IF v_chk.check_type = 'received' THEN
    -- Dr: Bank/Cash (p_collection_account_id) | Cr: Checks Receivable (v_chk_acc)
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_jv_id, p_collection_account_id, v_chk.amount, 0, 'إيداع شيك محصل');

    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_jv_id, v_chk_acc, 0, v_chk.amount, 'إقفال ورقة قبض');
  ELSE
    -- Dr: Checks Payable (v_chk_acc) | Cr: Bank (p_collection_account_id)
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_jv_id, v_chk_acc, v_chk.amount, 0, 'صرف ورقة دفع');

    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_jv_id, p_collection_account_id, 0, v_chk.amount, 'سحب من البنك');
  END IF;

  -- Update check record
  UPDATE checks_and_notes
  SET status = 'collected',
      collected_date = p_collection_date,
      collected_account_id = p_collection_account_id
  WHERE id = p_check_id;

  RETURN jsonb_build_object(
    'success', true,
    'check_id', p_check_id,
    'status', 'collected',
    'journal_entry_id', v_jv_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ------------------------------------------------------------------------------
-- RPC 4: rpc_post_payroll_run
-- Processes monthly payroll, deducts advances & rep commissions, posts balanced JV
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_post_payroll_run(
  p_month INTEGER,
  p_year INTEGER,
  p_payroll_date DATE,
  p_lines JSONB,
  p_created_by UUID
)
RETURNS JSONB AS $$
DECLARE
  v_run_number TEXT;
  v_seq INT;
  v_payroll_run_id UUID;
  v_total_basic NUMERIC(14,2) := 0;
  v_total_allowances NUMERIC(14,2) := 0;
  v_total_commissions NUMERIC(14,2) := 0;
  v_total_overtime NUMERIC(14,2) := 0;
  v_total_deductions NUMERIC(14,2) := 0;
  v_total_advance_deductions NUMERIC(14,2) := 0;
  v_net_payable NUMERIC(14,2) := 0;
  v_total_gross_expense NUMERIC(14,2) := 0;
  v_line JSONB;
  v_emp_id UUID;
  v_adv_ded NUMERIC(12,2);
  v_jv_id UUID;
  v_jv_number TEXT;
  v_sal_exp_acc UUID;
  v_sal_payable_acc UUID;
  v_adv_acc UUID;
BEGIN
  -- 1. Check Fiscal Period
  IF EXISTS (
    SELECT 1 FROM fiscal_periods
    WHERE start_date <= p_payroll_date
      AND end_date >= p_payroll_date
      AND is_locked = true
  ) THEN
    RAISE EXCEPTION 'لا يمكن ترحيل مسير رواتب في فترة مقفلة / Cannot post payroll in a locked fiscal period';
  END IF;

  -- Check if already exists
  v_run_number := 'PAY-' || p_year::TEXT || '-' || LPAD(p_month::TEXT, 2, '0');
  IF EXISTS (SELECT 1 FROM payroll_runs WHERE run_number = v_run_number AND status != 'cancelled') THEN
    RAISE EXCEPTION 'مسير الرواتب لهذا الشهر مرحل مسبقاً (%) / Payroll for this month is already posted', v_run_number;
  END IF;

  -- 2. Create Payroll Run
  INSERT INTO payroll_runs (
    run_number,
    month,
    year,
    payroll_date,
    status,
    created_by
  ) VALUES (
    v_run_number,
    p_month,
    p_year,
    p_payroll_date,
    'approved',
    p_created_by
  ) RETURNING id INTO v_payroll_run_id;

  -- 3. Insert Lines & Calculate Totals
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_emp_id := (v_line->>'employee_id')::UUID;
    v_adv_ded := COALESCE((v_line->>'advance_deduction')::NUMERIC, 0);

    INSERT INTO payroll_run_lines (
      payroll_run_id,
      employee_id,
      basic_salary,
      housing_allowance,
      transport_allowance,
      other_allowance,
      overtime_amount,
      commission_amount,
      bonus_amount,
      absence_deduction,
      penalty_deduction,
      advance_deduction,
      net_salary
    ) VALUES (
      v_payroll_run_id,
      v_emp_id,
      COALESCE((v_line->>'basic_salary')::NUMERIC, 0),
      COALESCE((v_line->>'housing_allowance')::NUMERIC, 0),
      COALESCE((v_line->>'transport_allowance')::NUMERIC, 0),
      COALESCE((v_line->>'other_allowance')::NUMERIC, 0),
      COALESCE((v_line->>'overtime_amount')::NUMERIC, 0),
      COALESCE((v_line->>'commission_amount')::NUMERIC, 0),
      COALESCE((v_line->>'bonus_amount')::NUMERIC, 0),
      COALESCE((v_line->>'absence_deduction')::NUMERIC, 0),
      COALESCE((v_line->>'penalty_deduction')::NUMERIC, 0),
      v_adv_ded,
      COALESCE((v_line->>'net_salary')::NUMERIC, 0)
    );

    v_total_basic := v_total_basic + COALESCE((v_line->>'basic_salary')::NUMERIC, 0);
    v_total_allowances := v_total_allowances + COALESCE((v_line->>'housing_allowance')::NUMERIC, 0) + COALESCE((v_line->>'transport_allowance')::NUMERIC, 0) + COALESCE((v_line->>'other_allowance')::NUMERIC, 0);
    v_total_commissions := v_total_commissions + COALESCE((v_line->>'commission_amount')::NUMERIC, 0);
    v_total_overtime := v_total_overtime + COALESCE((v_line->>'overtime_amount')::NUMERIC, 0) + COALESCE((v_line->>'bonus_amount')::NUMERIC, 0);
    v_total_deductions := v_total_deductions + COALESCE((v_line->>'absence_deduction')::NUMERIC, 0) + COALESCE((v_line->>'penalty_deduction')::NUMERIC, 0);
    v_total_advance_deductions := v_total_advance_deductions + v_adv_ded;
    v_net_payable := v_net_payable + COALESCE((v_line->>'net_salary')::NUMERIC, 0);

    -- Deduct from active advances
    IF v_adv_ded > 0 THEN
      UPDATE employee_advances
      SET recovered_amount = recovered_amount + v_adv_ded,
          remaining_balance = GREATEST(0, remaining_balance - v_adv_ded),
          status = CASE WHEN (remaining_balance - v_adv_ded) <= 0 THEN 'settled' ELSE 'active' END
      WHERE id = (
        SELECT id FROM employee_advances
        WHERE employee_id = v_emp_id AND status = 'active'
        ORDER BY advance_date ASC
        LIMIT 1
      );
    END IF;
  END LOOP;

  -- 4. Update Header with Computed Totals
  UPDATE payroll_runs
  SET total_basic = v_total_basic,
      total_allowances = v_total_allowances,
      total_commissions = v_total_commissions,
      total_overtime = v_total_overtime,
      total_deductions = v_total_deductions,
      total_advance_deductions = v_total_advance_deductions,
      net_payable = v_net_payable
  WHERE id = v_payroll_run_id;

  -- 5. Generate Double Entry Journal Entry
  -- Gross Salaries Expense = Basic + Allowances + Overtime + Commissions - Penalty/Absence Deductions
  v_total_gross_expense := (v_total_basic + v_total_allowances + v_total_commissions + v_total_overtime) - v_total_deductions;

  v_seq := nextval('seq_journal_entries');
  v_jv_number := 'JV-' || p_year::TEXT || '-' || LPAD(v_seq::TEXT, 4, '0');

  INSERT INTO journal_entries (
    entry_number,
    entry_date,
    description,
    ref_type,
    ref_id,
    is_posted,
    status,
    total_debit,
    total_credit,
    created_by
  ) VALUES (
    v_jv_number,
    p_payroll_date,
    'استحقاق مسير رواتب شهر ' || p_month::TEXT || '/' || p_year::TEXT,
    'payroll',
    v_payroll_run_id,
    true,
    'posted',
    v_total_gross_expense,
    v_total_gross_expense,
    p_created_by
  ) RETURNING id INTO v_jv_id;

  UPDATE payroll_runs SET journal_entry_id = v_jv_id WHERE id = v_payroll_run_id;

  -- Fetch COA Accounts
  SELECT id INTO v_sal_exp_acc FROM accounts WHERE code = '6101' LIMIT 1;
  SELECT id INTO v_sal_payable_acc FROM accounts WHERE code = '2106' LIMIT 1;
  IF v_sal_payable_acc IS NULL THEN SELECT id INTO v_sal_payable_acc FROM accounts WHERE code = '2120' LIMIT 1; END IF;
  SELECT id INTO v_adv_acc FROM accounts WHERE code = '1120' LIMIT 1;
  IF v_adv_acc IS NULL THEN SELECT id INTO v_adv_acc FROM accounts WHERE code = '1150' LIMIT 1; END IF;

  -- Dr: 6101 مصروف الرواتب والبدلات (Gross Expense)
  INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
  VALUES (v_jv_id, v_sal_exp_acc, v_total_gross_expense, 0, 'إجمالي استحقاق رواتب العاملين والموظفين');

  -- Cr: 1120 استرداد سلف الموظفين (Advance Deductions)
  IF v_total_advance_deductions > 0 AND v_adv_acc IS NOT NULL THEN
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_jv_id, v_adv_acc, 0, v_total_advance_deductions, 'استرداد أقساط سلف الموظفين من الرواتب');
  END IF;

  -- Cr: 2106 مستحقات الرواتب والأجور الصافية (Net Payable)
  INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
  VALUES (v_jv_id, v_sal_payable_acc, 0, v_net_payable, 'صافي رواتب مستحقة الصرف');

  -- Audit Log
  INSERT INTO audit_logs (user_id, action, table_name, record_id, details)
  VALUES (
    p_created_by,
    'POST_PAYROLL_RUN',
    'payroll_runs',
    v_payroll_run_id::TEXT,
    'Posted ' || v_run_number || ' Net Payable: ' || v_net_payable::TEXT || ' SAR'
  );

  RETURN jsonb_build_object(
    'success', true,
    'payroll_run_id', v_payroll_run_id,
    'run_number', v_run_number,
    'journal_entry_id', v_jv_id,
    'net_payable', v_net_payable
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ------------------------------------------------------------------------------
-- RPC 5: rpc_execute_depreciation_run
-- Calculates straight-line depreciation for active fixed assets and posts JV
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_execute_depreciation_run(
  p_month INTEGER,
  p_year INTEGER,
  p_date DATE,
  p_created_by UUID
)
RETURNS JSONB AS $$
DECLARE
  v_asset RECORD;
  v_dep_amount NUMERIC(12,2);
  v_total_dep NUMERIC(14,2) := 0;
  v_seq INT;
  v_jv_id UUID;
  v_jv_number TEXT;
  v_dep_exp_acc UUID;
  v_acc_dep_acc UUID;
  v_processed_count INT := 0;
BEGIN
  -- 1. Check Fiscal Period
  IF EXISTS (
    SELECT 1 FROM fiscal_periods
    WHERE start_date <= p_date
      AND end_date >= p_date
      AND is_locked = true
  ) THEN
    RAISE EXCEPTION 'لا يمكن ترحيل إهلاك في فترة مقفلة / Cannot run depreciation in a locked fiscal period';
  END IF;

  -- Check if already executed for this month/year
  IF EXISTS (SELECT 1 FROM depreciation_logs WHERE month = p_month AND year = p_year) THEN
    RAISE EXCEPTION 'تم تشغيل إهلاك هذا الشهر مسبقاً (%/%) / Depreciation already run for this period', p_month, p_year;
  END IF;

  SELECT id INTO v_dep_exp_acc FROM accounts WHERE code = '6108' LIMIT 1;
  SELECT id INTO v_acc_dep_acc FROM accounts WHERE code = '1290' LIMIT 1;
  IF v_acc_dep_acc IS NULL THEN SELECT id INTO v_acc_dep_acc FROM accounts WHERE code = '1202' LIMIT 1; END IF;

  -- Iterate over all active assets
  FOR v_asset IN 
    SELECT * FROM fixed_assets
    WHERE status = 'active'
      AND book_value > salvage_value
      AND purchase_date <= p_date
    FOR UPDATE
  LOOP
    -- Monthly Straight Line Depreciation = (Cost - Salvage) / Useful Life Months
    v_dep_amount := ROUND(((v_asset.purchase_cost - v_asset.salvage_value) / v_asset.useful_life_months::NUMERIC), 2);
    -- Cap by remaining depreciable value
    v_dep_amount := LEAST(v_dep_amount, v_asset.book_value - v_asset.salvage_value);

    IF v_dep_amount > 0 THEN
      -- Record depreciation log
      INSERT INTO depreciation_logs (
        asset_id,
        depreciation_date,
        month,
        year,
        depreciation_amount
      ) VALUES (
        v_asset.id,
        p_date,
        p_month,
        p_year,
        v_dep_amount
      );

      -- Update asset
      UPDATE fixed_assets
      SET accumulated_depreciation = accumulated_depreciation + v_dep_amount,
          book_value = book_value - v_dep_amount,
          status = CASE WHEN (book_value - v_dep_amount) <= salvage_value THEN 'fully_depreciated' ELSE 'active' END
      WHERE id = v_asset.id;

      v_total_dep := v_total_dep + v_dep_amount;
      v_processed_count := v_processed_count + 1;
    END IF;
  END LOOP;

  -- If any assets depreciated, post consolidated balanced JV
  IF v_total_dep > 0 THEN
    v_seq := nextval('seq_journal_entries');
    v_jv_number := 'JV-' || p_year::TEXT || '-' || LPAD(v_seq::TEXT, 4, '0');

    INSERT INTO journal_entries (
      entry_number,
      entry_date,
      description,
      ref_type,
      ref_id,
      is_posted,
      status,
      total_debit,
      total_credit,
      created_by
    ) VALUES (
      v_jv_number,
      p_date,
      'إهلاك الأصول الثابتة لشهر ' || p_month::TEXT || '/' || p_year::TEXT,
      'depreciation',
      NULL,
      true,
      'posted',
      v_total_dep,
      v_total_dep,
      p_created_by
    ) RETURNING id INTO v_jv_id;

    -- Dr: 6108 مصروف إهلاك الأصول الثابتة
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_jv_id, v_dep_exp_acc, v_total_dep, 0, 'مصروف إهلاك أصول تشغيلية');

    -- Cr: 1290 مجمع إهلاك الأصول الثابتة
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_jv_id, v_acc_dep_acc, 0, v_total_dep, 'مجمع إهلاك متراكم');

    -- Link JV to logs
    UPDATE depreciation_logs SET journal_entry_id = v_jv_id WHERE month = p_month AND year = p_year;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'processed_count', v_processed_count,
    'total_depreciation', v_total_dep,
    'journal_entry_id', v_jv_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ------------------------------------------------------------------------------
-- RPC 6: rpc_calculate_monthly_final_unit_cost
-- Computes actual monthly unit manufacturing overhead & unit cost per liter/carton
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_calculate_monthly_final_unit_cost(
  p_month INTEGER,
  p_year INTEGER
)
RETURNS JSONB AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
  v_total_opex NUMERIC(14,2) := 0;
  v_total_produced_liters NUMERIC(14,2) := 0;
  v_total_produced_cartons NUMERIC(14,2) := 0;
  v_overhead_per_liter NUMERIC(10,4) := 0;
  v_breakdown JSONB;
BEGIN
  v_start_date := MAKE_DATE(p_year, p_month, 1);
  v_end_date := (v_start_date + INTERVAL '1 month - 1 day')::DATE;

  -- 1. Sum actual operating expenses (accounts 6101..6109) for the period
  SELECT 
    COALESCE(SUM(jl.debit - jl.credit), 0),
    jsonb_agg(jsonb_build_object(
      'code', a.code,
      'name_ar', a.name_ar,
      'total_expense', SUM(jl.debit - jl.credit)
    ))
  INTO v_total_opex, v_breakdown
  FROM journal_lines jl
  JOIN journal_entries je ON jl.journal_entry_id = je.id
  JOIN accounts a ON jl.account_id = a.id
  WHERE je.entry_date BETWEEN v_start_date AND v_end_date
    AND je.is_posted = true
    AND a.code LIKE '61%'
  GROUP BY a.code, a.name_ar;

  -- 2. Sum mixing output in liters produced this month
  SELECT COALESCE(SUM(actual_output_grams) / 1000.0, 0)
  INTO v_total_produced_liters
  FROM mixing_batches
  WHERE qc_status = 'passed'
    AND actual_output_grams IS NOT NULL
    AND created_at::DATE BETWEEN v_start_date AND v_end_date;

  -- 3. Sum finished cartons packed this month
  SELECT COALESCE(SUM(cartons_produced), 0)
  INTO v_total_produced_cartons
  FROM packaging_orders
  WHERE packaging_date BETWEEN v_start_date AND v_end_date;

  -- 4. Calculate overhead allocation rate per liter
  IF v_total_produced_liters > 0 THEN
    v_overhead_per_liter := ROUND((v_total_opex / v_total_produced_liters), 4);
  END IF;

  RETURN jsonb_build_object(
    'month', p_month,
    'year', p_year,
    'total_opex', v_total_opex,
    'total_produced_liters', v_total_produced_liters,
    'total_produced_cartons', v_total_produced_cartons,
    'overhead_per_liter', v_overhead_per_liter,
    'expense_breakdown', COALESCE(v_breakdown, '[]'::jsonb)
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- ------------------------------------------------------------------------------
-- RPC 7: rpc_year_end_closing
-- Optional Year-End Closing Wizard per SPEC.md (transfers Net Profit to 3201)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_year_end_closing(
  p_fiscal_year INTEGER,
  p_closing_date DATE,
  p_created_by UUID
)
RETURNS JSONB AS $$
DECLARE
  v_seq INT;
  v_jv_id UUID;
  v_jv_number TEXT;
  v_total_revenue NUMERIC(14,2) := 0;
  v_total_expense NUMERIC(14,2) := 0;
  v_net_profit NUMERIC(14,2) := 0;
  v_retained_acc UUID;
  v_acc RECORD;
  v_acc_balance NUMERIC(14,2);
BEGIN
  -- 1. Check if Retained Earnings Account 3201 exists
  SELECT id INTO v_retained_acc FROM accounts WHERE code = '3201' LIMIT 1;
  IF v_retained_acc IS NULL THEN
    RAISE EXCEPTION 'حساب الأرباح المبقاة (3201) غير موجود في شجرة الحسابات / Retained earnings account (3201) not found';
  END IF;

  -- Check if already executed for this year
  IF EXISTS (SELECT 1 FROM journal_entries WHERE ref_type = 'year_end_closing' AND entry_date = p_closing_date) THEN
    RAISE EXCEPTION 'تم تنفيذ الإقفال السنوي لهذا التاريخ مسبقاً / Year-end closing already performed for this date';
  END IF;

  -- 2. Calculate Revenue & Expense totals for closing
  SELECT COALESCE(SUM(current_balance), 0) INTO v_total_revenue
  FROM accounts
  WHERE type IN ('revenue', 'contra_revenue') AND is_active = true;

  SELECT COALESCE(SUM(current_balance), 0) INTO v_total_expense
  FROM accounts
  WHERE type IN ('expense', 'cogs') AND is_active = true;

  v_net_profit := v_total_revenue - v_total_expense;

  -- 3. Create Year-End Closing JV
  v_seq := nextval('seq_journal_entries');
  v_jv_number := 'JV-' || p_fiscal_year::TEXT || '-YE-001';

  INSERT INTO journal_entries (
    entry_number,
    entry_date,
    description,
    ref_type,
    ref_id,
    is_posted,
    status,
    total_debit,
    total_credit,
    created_by
  ) VALUES (
    v_jv_number,
    p_closing_date,
    'قيد الإقفال السنوي وترحيل صافي أرباح/خسائر العام ' || p_fiscal_year::TEXT || ' لحساب الأرباح المبقاة 3201',
    'year_end_closing',
    NULL,
    true,
    'posted',
    GREATEST(v_total_revenue, v_total_expense),
    GREATEST(v_total_revenue, v_total_expense),
    p_created_by
  ) RETURNING id INTO v_jv_id;

  -- 4. Close Revenues (Dr: Revenue accounts to zero them out)
  FOR v_acc IN SELECT * FROM accounts WHERE type IN ('revenue', 'contra_revenue') AND current_balance != 0 LOOP
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_jv_id, v_acc.id, v_acc.current_balance, 0, 'إقفال حساب إيراد: ' || v_acc.name_ar);

    UPDATE accounts SET current_balance = 0 WHERE id = v_acc.id;
  END LOOP;

  -- 5. Close Expenses (Cr: Expense accounts to zero them out)
  FOR v_acc IN SELECT * FROM accounts WHERE type IN ('expense', 'cogs') AND current_balance != 0 LOOP
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_jv_id, v_acc.id, 0, v_acc.current_balance, 'إقفال حساب مصروف: ' || v_acc.name_ar);

    UPDATE accounts SET current_balance = 0 WHERE id = v_acc.id;
  END LOOP;

  -- 6. Transfer Net Profit to Retained Earnings 3201
  IF v_net_profit >= 0 THEN
    -- Net Profit: Cr: 3201
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_jv_id, v_retained_acc, 0, v_net_profit, 'ترحيل صافي أرباح العام إلى الأرباح المبقاة');

    UPDATE accounts SET current_balance = current_balance + v_net_profit WHERE id = v_retained_acc;
  ELSE
    -- Net Loss: Dr: 3201
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_jv_id, v_retained_acc, ABS(v_net_profit), 0, 'ترحيل صافي خسائر العام إلى الأرباح المبقاة');

    UPDATE accounts SET current_balance = current_balance - ABS(v_net_profit) WHERE id = v_retained_acc;
  END IF;

  -- 7. Lock all fiscal periods belonging to this year
  UPDATE fiscal_periods
  SET is_locked = true,
      locked_at = NOW(),
      locked_by = p_created_by
  WHERE EXTRACT(YEAR FROM start_date) = p_fiscal_year;

  -- 8. Audit Log
  INSERT INTO audit_logs (user_id, action, table_name, record_id, details)
  VALUES (
    p_created_by,
    'YEAR_END_CLOSING',
    'journal_entries',
    v_jv_id::TEXT,
    'Year-End Closing for ' || p_fiscal_year::TEXT || ' Net Profit: ' || v_net_profit::TEXT || ' SAR transferred to 3201'
  );

  RETURN jsonb_build_object(
    'success', true,
    'fiscal_year', p_fiscal_year,
    'net_profit', v_net_profit,
    'journal_entry_id', v_jv_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ------------------------------------------------------------------------------
-- RPC 8: rpc_get_financial_reports
-- High performance RPC to retrieve Trial Balance, Income Statement & Balance Sheet
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_get_financial_reports(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS JSONB AS $$
DECLARE
  v_trial_balance JSONB;
  v_total_revenue NUMERIC(14,2) := 0;
  v_total_cogs NUMERIC(14,2) := 0;
  v_gross_profit NUMERIC(14,2) := 0;
  v_total_opex NUMERIC(14,2) := 0;
  v_net_profit NUMERIC(14,2) := 0;
  v_total_assets NUMERIC(14,2) := 0;
  v_total_liabilities NUMERIC(14,2) := 0;
  v_total_equity NUMERIC(14,2) := 0;
  v_vat_sales_taxable NUMERIC(14,2) := 0;
  v_vat_sales_tax NUMERIC(14,2) := 0;
  v_vat_purchase_taxable NUMERIC(14,2) := 0;
  v_vat_purchase_tax NUMERIC(14,2) := 0;
  v_net_vat_due NUMERIC(14,2) := 0;
BEGIN
  -- 1. Trial Balance Generation
  SELECT jsonb_agg(jsonb_build_object(
    'account_id', a.id,
    'code', a.code,
    'name_ar', a.name_ar,
    'name_en', a.name_en,
    'type', a.type,
    'initial_balance', 0.00,
    'period_debit', COALESCE(mv.debit, 0.00),
    'period_credit', COALESCE(mv.credit, 0.00),
    'ending_balance', a.current_balance
  ) ORDER BY a.code)
  INTO v_trial_balance
  FROM accounts a
  LEFT JOIN (
    SELECT 
      jl.account_id,
      SUM(jl.debit) AS debit,
      SUM(jl.credit) AS credit
    FROM journal_lines jl
    JOIN journal_entries je ON jl.journal_entry_id = je.id
    WHERE je.entry_date BETWEEN p_start_date AND p_end_date
      AND je.is_posted = true
    GROUP BY jl.account_id
  ) mv ON a.id = mv.account_id
  WHERE a.type != 'header';

  -- 2. Income Statement Totals
  SELECT COALESCE(SUM(current_balance), 0) INTO v_total_revenue
  FROM accounts WHERE type IN ('revenue', 'contra_revenue') AND is_active = true;

  SELECT COALESCE(SUM(current_balance), 0) INTO v_total_cogs
  FROM accounts WHERE (code LIKE '51%' OR type = 'cogs') AND is_active = true;

  v_gross_profit := v_total_revenue - v_total_cogs;

  SELECT COALESCE(SUM(current_balance), 0) INTO v_total_opex
  FROM accounts WHERE (code LIKE '61%' OR (type = 'expense' AND code NOT LIKE '51%')) AND is_active = true;

  v_net_profit := v_gross_profit - v_total_opex;

  -- 3. Balance Sheet Totals
  SELECT COALESCE(SUM(current_balance), 0) INTO v_total_assets
  FROM accounts WHERE type IN ('asset', 'contra_asset') AND is_active = true;

  SELECT COALESCE(SUM(current_balance), 0) INTO v_total_liabilities
  FROM accounts WHERE type = 'liability' AND is_active = true;

  SELECT COALESCE(SUM(current_balance), 0) INTO v_total_equity
  FROM accounts WHERE type = 'equity' AND is_active = true;

  -- 4. VAT Return Data (ZATCA 15%)
  SELECT 
    COALESCE(SUM(total_amount_ex_vat), 0),
    COALESCE(SUM(vat_amount), 0)
  INTO v_vat_sales_taxable, v_vat_sales_tax
  FROM sales_invoices
  WHERE invoice_date BETWEEN p_start_date AND p_end_date;

  SELECT 
    COALESCE(SUM(total_ex_vat), 0),
    COALESCE(SUM(vat_amount), 0)
  INTO v_vat_purchase_taxable, v_vat_purchase_tax
  FROM purchase_invoices
  WHERE invoice_date BETWEEN p_start_date AND p_end_date;

  v_net_vat_due := v_vat_sales_tax - v_vat_purchase_tax;

  RETURN jsonb_build_object(
    'trial_balance', COALESCE(v_trial_balance, '[]'::jsonb),
    'income_statement', jsonb_build_object(
      'total_revenue', v_total_revenue,
      'total_cogs', v_total_cogs,
      'gross_profit', v_gross_profit,
      'total_opex', v_total_opex,
      'net_profit', v_net_profit
    ),
    'balance_sheet', jsonb_build_object(
      'total_assets', v_total_assets,
      'total_liabilities', v_total_liabilities,
      'total_equity', v_total_equity,
      'retained_earnings_current', v_net_profit
    ),
    'vat_return', jsonb_build_object(
      'sales_taxable', v_vat_sales_taxable,
      'sales_vat', v_vat_sales_tax,
      'purchases_taxable', v_vat_purchase_taxable,
      'purchases_vat', v_vat_purchase_tax,
      'net_vat_due', v_net_vat_due
    )
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
