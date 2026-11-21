-- ============================================================================
-- Al-Asyah Detergent Factory ERP - Phase 4 Migration
-- Module: Sales, ZATCA Phase 1 E-Invoicing, Delivery Van Custody & Rep Commissions
-- Single Source of Truth: SPEC.md (v3.1) Sections 4, 6.5, 7, 8.3
-- ============================================================================

-- 1. Sequences for Strict Non-Gap Document Numbering
CREATE SEQUENCE IF NOT EXISTS seq_sales_invoices START WITH 1;
CREATE SEQUENCE IF NOT EXISTS seq_sales_returns START WITH 1;
CREATE SEQUENCE IF NOT EXISTS seq_quotations START WITH 1;
CREATE SEQUENCE IF NOT EXISTS seq_van_transfers START WITH 1;

-- 2. Customers Table
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  vat_number TEXT, -- 15 digits (starts & ends with 3)
  cr_number TEXT,
  phone TEXT NOT NULL,
  national_address TEXT,
  credit_limit NUMERIC(14,2) NOT NULL DEFAULT 50000.00,
  default_payment_days INTEGER NOT NULL DEFAULT 30,
  assigned_rep_id UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  price_list_id UUID,
  guarantee_text TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Price Lists and Price List Items
CREATE TABLE IF NOT EXISTS price_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS price_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id UUID NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  price_per_piece NUMERIC(12,2) NOT NULL,
  price_per_carton NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(price_list_id, item_id)
);

-- 4. Quotations (Price Offers)
CREATE TABLE IF NOT EXISTS quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_number TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES customers(id),
  quotation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE NOT NULL,
  total_ex_vat NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  vat_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  grand_total NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'converted_to_invoice')),
  notes TEXT,
  created_by UUID REFERENCES users_profile(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quotation_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id),
  quantity NUMERIC(12,2) NOT NULL,
  unit_type TEXT NOT NULL DEFAULT 'carton' CHECK (unit_type IN ('piece', 'carton')),
  unit_price NUMERIC(12,2) NOT NULL,
  vat_rate NUMERIC(4,2) NOT NULL DEFAULT 0.15,
  vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  total_line NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Sales Invoices (ZATCA Phase 1 Compliant)
CREATE TABLE IF NOT EXISTS sales_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES customers(id),
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL DEFAULT CURRENT_DATE + 30,
  total_amount_ex_vat NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  vat_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  total_amount_inc_vat NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  advance_deducted NUMERIC(14,2) NOT NULL DEFAULT 0.00, -- Deducted from Account 2102
  net_amount_due NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partially_paid', 'paid')),
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('draft', 'posted', 'cancelled')),
  zatca_qr_base64 TEXT,
  print_count INTEGER NOT NULL DEFAULT 0,
  source_type TEXT NOT NULL DEFAULT 'direct' CHECK (source_type IN ('direct', 'van_sale', 'quotation')),
  van_warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  assigned_rep_id UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID REFERENCES users_profile(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id),
  quantity NUMERIC(12,2) NOT NULL,
  unit_type TEXT NOT NULL DEFAULT 'carton' CHECK (unit_type IN ('piece', 'carton')),
  pieces_count NUMERIC(12,2) NOT NULL, -- Total pieces calculated
  unit_price_ex_vat NUMERIC(12,2) NOT NULL,
  total_price_ex_vat NUMERIC(14,2) NOT NULL,
  vat_rate NUMERIC(4,2) NOT NULL DEFAULT 0.15,
  vat_amount NUMERIC(12,2) NOT NULL,
  total_line_inc_vat NUMERIC(14,2) NOT NULL,
  is_bonus_or_sample BOOLEAN NOT NULL DEFAULT false, -- If true, price=0, FIFO to 6106
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Sales Returns (Credit Notes - CN)
CREATE TABLE IF NOT EXISTS sales_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number TEXT NOT NULL UNIQUE,
  invoice_id UUID REFERENCES sales_invoices(id) ON DELETE SET NULL,
  customer_id UUID NOT NULL REFERENCES customers(id),
  return_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_ex_vat NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  vat_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  grand_total NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('draft', 'posted', 'cancelled')),
  zatca_qr_base64 TEXT,
  print_count INTEGER NOT NULL DEFAULT 0,
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID REFERENCES users_profile(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_return_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_return_id UUID NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id),
  quantity NUMERIC(12,2) NOT NULL,
  unit_type TEXT NOT NULL DEFAULT 'carton' CHECK (unit_type IN ('piece', 'carton')),
  pieces_count NUMERIC(12,2) NOT NULL,
  unit_price_ex_vat NUMERIC(12,2) NOT NULL,
  total_price_ex_vat NUMERIC(14,2) NOT NULL,
  vat_rate NUMERIC(4,2) NOT NULL DEFAULT 0.15,
  vat_amount NUMERIC(12,2) NOT NULL,
  total_line_inc_vat NUMERIC(14,2) NOT NULL,
  return_condition TEXT NOT NULL DEFAULT 'sellable' CHECK (return_condition IN ('sellable', 'damaged')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Van Custody Transfers (Loading and Unloading Delivery Vans)
CREATE TABLE IF NOT EXISTS van_custody_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_number TEXT NOT NULL UNIQUE,
  source_warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  target_warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  assigned_rep_id UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  transfer_type TEXT NOT NULL CHECK (transfer_type IN ('load_to_van', 'return_from_van')),
  transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'dispatched' CHECK (status IN ('draft', 'dispatched', 'confirmed_by_warehouse', 'cancelled')),
  confirmed_by UUID REFERENCES users_profile(id),
  confirmed_at TIMESTAMPTZ,
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID REFERENCES users_profile(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS van_custody_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID NOT NULL REFERENCES van_custody_transfers(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id),
  quantity NUMERIC(12,2) NOT NULL,
  unit_type TEXT NOT NULL DEFAULT 'carton' CHECK (unit_type IN ('piece', 'carton')),
  pieces_count NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Sales Rep Commissions
CREATE TABLE IF NOT EXISTS sales_rep_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id UUID NOT NULL REFERENCES users_profile(id),
  invoice_id UUID REFERENCES sales_invoices(id) ON DELETE SET NULL,
  sales_return_id UUID REFERENCES sales_returns(id) ON DELETE SET NULL,
  commission_amount NUMERIC(12,2) NOT NULL,
  calculation_basis TEXT NOT NULL DEFAULT 'percentage_of_sales' CHECK (
    calculation_basis IN ('percentage_of_sales', 'percentage_of_collection', 'manual_flat')
  ),
  percentage NUMERIC(5,2) DEFAULT 2.00, -- default 2%
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid_in_payroll', 'paid_in_voucher')),
  paid_date DATE,
  notes TEXT,
  created_by UUID REFERENCES users_profile(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 9. Atomic PL/pgSQL RPC Engines for Phase 4
-- ============================================================================

-- A. rpc_create_sales_invoice: Issues ZATCA tax invoice with strict FIFO, advance deduction & double entry
CREATE OR REPLACE FUNCTION rpc_create_sales_invoice(
  p_customer_id UUID,
  p_invoice_date DATE,
  p_due_date DATE,
  p_items JSONB, -- Array of { item_id, quantity, unit_type, unit_price_ex_vat, is_bonus }
  p_advance_deducted NUMERIC,
  p_source_type TEXT,
  p_van_warehouse_id UUID,
  p_assigned_rep_id UUID,
  p_zatca_qr_base64 TEXT,
  p_notes TEXT,
  p_created_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_customer RECORD;
  v_settings RECORD;
  v_invoice_id UUID;
  v_invoice_num TEXT;
  v_item RECORD;
  v_line_elem JSONB;
  v_pieces NUMERIC;
  v_item_id UUID;
  v_qty NUMERIC;
  v_unit_type TEXT;
  v_price NUMERIC;
  v_is_bonus BOOLEAN;
  v_line_ex_vat NUMERIC;
  v_line_vat NUMERIC;
  v_line_inc_vat NUMERIC;
  v_total_ex_vat NUMERIC := 0.00;
  v_total_vat NUMERIC := 0.00;
  v_total_inc_vat NUMERIC := 0.00;
  v_net_due NUMERIC := 0.00;
  v_total_cogs NUMERIC := 0.00;
  v_total_bonus_cost NUMERIC := 0.00;
  v_consume_res JSONB;
  v_source_wh UUID;
  v_je_id UUID;
  v_je_num TEXT;
  v_acc_ar UUID;
  v_acc_sales UUID;
  v_acc_vat UUID;
  v_acc_advances UUID;
  v_acc_cogs UUID;
  v_acc_bonus UUID;
  v_acc_fg UUID;
  v_acc_van UUID;
  v_current_ar NUMERIC := 0.00;
BEGIN
  -- 1. Check Customer & Credit Limit
  SELECT * INTO v_customer FROM customers WHERE id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer % not found', p_customer_id;
  END IF;

  -- 2. Determine Source Warehouse (Van or Finished Goods)
  IF p_source_type = 'van_sale' AND p_van_warehouse_id IS NOT NULL THEN
    v_source_wh := p_van_warehouse_id;
  ELSE
    SELECT id INTO v_source_wh FROM warehouses WHERE warehouse_type = 'finished_goods' LIMIT 1;
    IF v_source_wh IS NULL THEN
      SELECT id INTO v_source_wh FROM warehouses LIMIT 1;
    END IF;
  END IF;

  -- 3. Generate Strict Non-Gap Invoice Sequence: INV-YYYY-0001
  v_invoice_num := 'INV-' || TO_CHAR(p_invoice_date, 'YYYY') || '-' || LPAD(nextval('seq_sales_invoices')::TEXT, 4, '0');

  -- 4. Create Invoice Header
  INSERT INTO sales_invoices (
    invoice_number,
    customer_id,
    invoice_date,
    due_date,
    total_amount_ex_vat,
    vat_amount,
    total_amount_inc_vat,
    advance_deducted,
    net_amount_due,
    status,
    zatca_qr_base64,
    source_type,
    van_warehouse_id,
    assigned_rep_id,
    notes,
    created_by
  ) VALUES (
    v_invoice_num,
    p_customer_id,
    p_invoice_date,
    p_due_date,
    0.00,
    0.00,
    0.00,
    COALESCE(p_advance_deducted, 0.00),
    0.00,
    'posted',
    p_zatca_qr_base64,
    p_source_type,
    p_van_warehouse_id,
    p_assigned_rep_id,
    p_notes,
    p_created_by
  ) RETURNING id INTO v_invoice_id;

  -- 5. Process Invoice Lines & FIFO Inventory Deductions
  FOR v_line_elem IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_id := (v_line_elem->>'item_id')::UUID;
    v_qty := (v_line_elem->>'quantity')::NUMERIC;
    v_unit_type := COALESCE(v_line_elem->>'unit_type', 'carton');
    v_price := COALESCE((v_line_elem->>'unit_price_ex_vat')::NUMERIC, 0.00);
    v_is_bonus := COALESCE((v_line_elem->>'is_bonus_or_sample')::BOOLEAN, false);

    SELECT * INTO v_item FROM items WHERE id = v_item_id;

    -- Calculate pieces
    IF v_unit_type = 'carton' THEN
      v_pieces := v_qty * COALESCE(v_item.pieces_per_carton, 1);
    ELSE
      v_pieces := v_qty;
    END IF;

    IF v_is_bonus THEN
      v_price := 0.00;
      v_line_ex_vat := 0.00;
      v_line_vat := 0.00;
      v_line_inc_vat := 0.00;
    ELSE
      v_line_ex_vat := ROUND(v_qty * v_price, 2);
      v_line_vat := ROUND(v_line_ex_vat * 0.15, 2);
      v_line_inc_vat := v_line_ex_vat + v_line_vat;
    END IF;

    v_total_ex_vat := v_total_ex_vat + v_line_ex_vat;
    v_total_vat := v_total_vat + v_line_vat;
    v_total_inc_vat := v_total_inc_vat + v_line_inc_vat;

    -- Insert Invoice Line
    INSERT INTO sales_invoice_lines (
      invoice_id,
      item_id,
      quantity,
      unit_type,
      pieces_count,
      unit_price_ex_vat,
      total_price_ex_vat,
      vat_rate,
      vat_amount,
      total_line_inc_vat,
      is_bonus_or_sample
    ) VALUES (
      v_invoice_id,
      v_item_id,
      v_qty,
      v_unit_type,
      v_pieces,
      v_price,
      v_line_ex_vat,
      0.15,
      v_line_vat,
      v_line_inc_vat,
      v_is_bonus
    );

    -- Strict FIFO Consumption
    v_consume_res := rpc_consume_fifo(
      v_item_id,
      v_source_wh,
      v_pieces,
      'sales_issue',
      v_invoice_id,
      p_created_by
    );

    IF v_is_bonus THEN
      v_total_bonus_cost := v_total_bonus_cost + COALESCE((v_consume_res->>'total_cost')::NUMERIC, 0.00);
    ELSE
      v_total_cogs := v_total_cogs + COALESCE((v_consume_res->>'total_cost')::NUMERIC, 0.00);
    END IF;
  END LOOP;

  v_net_due := GREATEST(0.00, v_total_inc_vat - COALESCE(p_advance_deducted, 0.00));

  -- Update Invoice Totals
  UPDATE sales_invoices
  SET total_amount_ex_vat = v_total_ex_vat,
      vat_amount = v_total_vat,
      total_amount_inc_vat = v_total_inc_vat,
      net_amount_due = v_net_due,
      updated_at = NOW()
  WHERE id = v_invoice_id;

  -- 6. Post Balanced Double-Entry Journal Entry
  SELECT id INTO v_acc_ar FROM accounts WHERE code = '1110';
  SELECT id INTO v_acc_sales FROM accounts WHERE code = '4101';
  SELECT id INTO v_acc_vat FROM accounts WHERE code = '2110';
  SELECT id INTO v_acc_advances FROM accounts WHERE code = '2102';
  SELECT id INTO v_acc_cogs FROM accounts WHERE code = '5101';
  SELECT id INTO v_acc_bonus FROM accounts WHERE code = '6106';
  SELECT id INTO v_acc_fg FROM accounts WHERE code = '1134';
  SELECT id INTO v_acc_van FROM accounts WHERE code = '1135';

  IF v_acc_ar IS NOT NULL AND v_acc_sales IS NOT NULL AND v_acc_vat IS NOT NULL THEN
    v_je_num := 'JV-INV-' || TO_CHAR(p_invoice_date, 'YYYY') || '-' || LPAD(currval('seq_sales_invoices')::TEXT, 4, '0');
    
    INSERT INTO journal_entries (
      entry_number,
      entry_date,
      description,
      total_debit,
      total_credit,
      status,
      is_posted,
      created_by
    ) VALUES (
      v_je_num,
      p_invoice_date,
      'إثبات مبيعات الفاتورة الضريبية ' || v_invoice_num || ' للعميل ' || v_customer.name_ar,
      v_total_inc_vat + v_total_cogs + v_total_bonus_cost,
      v_total_inc_vat + v_total_cogs + v_total_bonus_cost,
      'posted',
      true,
      p_created_by
    ) RETURNING id INTO v_je_id;

    -- Debit AR 1110 (Net due)
    IF v_net_due > 0 THEN
      INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description, note)
      VALUES (v_je_id, v_acc_ar, v_net_due, 0.00, 'ذمم العملاء - صافي الفاتورة', v_customer.name_ar);
    END IF;

    -- Debit Customer Advances 2102 (if advance was deducted)
    IF COALESCE(p_advance_deducted, 0) > 0 AND v_acc_advances IS NOT NULL THEN
      INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description, note)
      VALUES (v_je_id, v_acc_advances, p_advance_deducted, 0.00, 'تسوية دفعة مقدمة (عربون) للفاتورة', v_customer.name_ar);
    END IF;

    -- Credit Sales Revenue 4101
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description, note)
    VALUES (v_je_id, v_acc_sales, 0.00, v_total_ex_vat, 'إيرادات مبيعات الفاتورة ' || v_invoice_num, 'إيرادات المبيعات');

    -- Credit Output VAT 2110 (15%)
    IF v_total_vat > 0 THEN
      INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description, note)
      VALUES (v_je_id, v_acc_vat, 0.00, v_total_vat, 'ضريبة القيمة المضافة مخرجات (15%)', 'ضريبة مخرجات');
    END IF;

    -- Debit COGS 5101 & Credit Inventory
    IF v_total_cogs > 0 AND v_acc_cogs IS NOT NULL THEN
      INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description, note)
      VALUES (v_je_id, v_acc_cogs, v_total_cogs, 0.00, 'تكلفة البضاعة المباعة (FIFO)', 'تكلفة مبيعات');

      INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description, note)
      VALUES (
        v_je_id,
        CASE WHEN p_source_type = 'van_sale' THEN v_acc_van ELSE v_acc_fg END,
        0.00,
        v_total_cogs,
        'صرف بضاعة تامة مباعة من المخزن',
        'مخزون بضاعة تامة'
      );
    END IF;

    -- Debit Bonus/Samples 6106 (if bonus items present)
    IF v_total_bonus_cost > 0 AND v_acc_bonus IS NOT NULL THEN
      INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description, note)
      VALUES (v_je_id, v_acc_bonus, v_total_bonus_cost, 0.00, 'مصروف بضاعة بونص وعينات مجانية', 'بونص ترويجي');

      INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description, note)
      VALUES (
        v_je_id,
        CASE WHEN p_source_type = 'van_sale' THEN v_acc_van ELSE v_acc_fg END,
        0.00,
        v_total_bonus_cost,
        'صرف بضاعة بونص من المخزن',
        'مخزون بضاعة تامة'
      );
    END IF;

    UPDATE sales_invoices SET journal_entry_id = v_je_id WHERE id = v_invoice_id;
  END IF;

  -- 7. Record Sales Rep Commission (Default 2% if rep assigned)
  IF p_assigned_rep_id IS NOT NULL AND v_total_ex_vat > 0 THEN
    INSERT INTO sales_rep_commissions (
      rep_id,
      invoice_id,
      commission_amount,
      calculation_basis,
      percentage,
      status,
      created_by
    ) VALUES (
      p_assigned_rep_id,
      v_invoice_id,
      ROUND(v_total_ex_vat * 0.02, 2),
      'percentage_of_sales',
      2.00,
      'pending',
      p_created_by
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_num,
    'total_amount_inc_vat', v_total_inc_vat,
    'net_amount_due', v_net_due,
    'cogs_total', v_total_cogs
  );
END;
$$;

-- B. rpc_create_sales_return: Issues Tax Credit Note (CN) with Sellable/Damaged logic & Double Entry
CREATE OR REPLACE FUNCTION rpc_create_sales_return(
  p_invoice_id UUID,
  p_customer_id UUID,
  p_return_date DATE,
  p_items JSONB, -- Array of { item_id, quantity, unit_type, unit_price_ex_vat, return_condition }
  p_zatca_qr_base64 TEXT,
  p_notes TEXT,
  p_created_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_customer RECORD;
  v_return_id UUID;
  v_return_num TEXT;
  v_item RECORD;
  v_line_elem JSONB;
  v_item_id UUID;
  v_qty NUMERIC;
  v_unit_type TEXT;
  v_price NUMERIC;
  v_pieces NUMERIC;
  v_condition TEXT;
  v_line_ex_vat NUMERIC;
  v_line_vat NUMERIC;
  v_line_inc_vat NUMERIC;
  v_total_ex_vat NUMERIC := 0.00;
  v_total_vat NUMERIC := 0.00;
  v_total_inc_vat NUMERIC := 0.00;
  v_total_restock_cost NUMERIC := 0.00;
  v_total_damaged_cost NUMERIC := 0.00;
  v_fg_wh UUID;
  v_je_id UUID;
  v_je_num TEXT;
  v_acc_ar UUID;
  v_acc_returns UUID;
  v_acc_vat UUID;
  v_acc_cogs UUID;
  v_acc_fg UUID;
  v_acc_scrap UUID;
BEGIN
  SELECT * INTO v_customer FROM customers WHERE id = p_customer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer % not found', p_customer_id;
  END IF;

  SELECT id INTO v_fg_wh FROM warehouses WHERE warehouse_type = 'finished_goods' LIMIT 1;

  -- Generate Sequence: CN-YYYY-0001
  v_return_num := 'CN-' || TO_CHAR(p_return_date, 'YYYY') || '-' || LPAD(nextval('seq_sales_returns')::TEXT, 4, '0');

  INSERT INTO sales_returns (
    return_number,
    invoice_id,
    customer_id,
    return_date,
    total_ex_vat,
    vat_amount,
    grand_total,
    status,
    zatca_qr_base64,
    notes,
    created_by
  ) VALUES (
    v_return_num,
    p_invoice_id,
    p_customer_id,
    p_return_date,
    0.00,
    0.00,
    0.00,
    'posted',
    p_zatca_qr_base64,
    p_notes,
    p_created_by
  ) RETURNING id INTO v_return_id;

  FOR v_line_elem IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_id := (v_line_elem->>'item_id')::UUID;
    v_qty := (v_line_elem->>'quantity')::NUMERIC;
    v_unit_type := COALESCE(v_line_elem->>'unit_type', 'carton');
    v_price := (v_line_elem->>'unit_price_ex_vat')::NUMERIC;
    v_condition := COALESCE(v_line_elem->>'return_condition', 'sellable');

    SELECT * INTO v_item FROM items WHERE id = v_item_id;

    IF v_unit_type = 'carton' THEN
      v_pieces := v_qty * COALESCE(v_item.pieces_per_carton, 1);
    ELSE
      v_pieces := v_qty;
    END IF;

    v_line_ex_vat := ROUND(v_qty * v_price, 2);
    v_line_vat := ROUND(v_line_ex_vat * 0.15, 2);
    v_line_inc_vat := v_line_ex_vat + v_line_vat;

    v_total_ex_vat := v_total_ex_vat + v_line_ex_vat;
    v_total_vat := v_total_vat + v_line_vat;
    v_total_inc_vat := v_total_inc_vat + v_line_inc_vat;

    INSERT INTO sales_return_lines (
      sales_return_id,
      item_id,
      quantity,
      unit_type,
      pieces_count,
      unit_price_ex_vat,
      total_price_ex_vat,
      vat_rate,
      vat_amount,
      total_line_inc_vat,
      return_condition
    ) VALUES (
      v_return_id,
      v_item_id,
      v_qty,
      v_unit_type,
      v_pieces,
      v_price,
      v_line_ex_vat,
      0.15,
      v_line_vat,
      v_line_inc_vat,
      v_condition
    );

    -- If Sellable, return stock into FIFO layers
    IF v_condition = 'sellable' THEN
      INSERT INTO fifo_layers (
        item_id,
        warehouse_id,
        batch_number,
        layer_date,
        initial_qty,
        remaining_qty,
        unit_cost_ex_vat
      ) VALUES (
        v_item_id,
        v_fg_wh,
        v_return_num,
        p_return_date,
        v_pieces,
        v_pieces,
        v_price * 0.70 -- Estimated base cost
      );

      UPDATE items
      SET current_stock = current_stock + v_pieces,
          updated_at = NOW()
      WHERE id = v_item_id;

      v_total_restock_cost := v_total_restock_cost + ROUND(v_pieces * (v_price * 0.70), 2);
    ELSE
      -- Damaged return: direct to Scrap & Spoilage Expense 6105
      v_total_damaged_cost := v_total_damaged_cost + ROUND(v_pieces * (v_price * 0.70), 2);
    END IF;
  END LOOP;

  UPDATE sales_returns
  SET total_ex_vat = v_total_ex_vat,
      vat_amount = v_total_vat,
      grand_total = v_total_inc_vat
  WHERE id = v_return_id;

  -- Double Entry for Credit Note
  SELECT id INTO v_acc_ar FROM accounts WHERE code = '1110';
  SELECT id INTO v_acc_returns FROM accounts WHERE code = '4102';
  SELECT id INTO v_acc_vat FROM accounts WHERE code = '2110';
  SELECT id INTO v_acc_cogs FROM accounts WHERE code = '5101';
  SELECT id INTO v_acc_fg FROM accounts WHERE code = '1134';
  SELECT id INTO v_acc_scrap FROM accounts WHERE code = '6105';

  IF v_acc_ar IS NOT NULL AND v_acc_returns IS NOT NULL AND v_acc_vat IS NOT NULL THEN
    v_je_num := 'JV-CN-' || TO_CHAR(p_return_date, 'YYYY') || '-' || LPAD(currval('seq_sales_returns')::TEXT, 4, '0');
    
    INSERT INTO journal_entries (
      entry_number,
      entry_date,
      description,
      total_debit,
      total_credit,
      status,
      is_posted,
      created_by
    ) VALUES (
      v_je_num,
      p_return_date,
      'إثبات إشعار دائن ضريبي ' || v_return_num || ' للعميل ' || v_customer.name_ar,
      v_total_inc_vat,
      v_total_inc_vat,
      'posted',
      true,
      p_created_by
    ) RETURNING id INTO v_je_id;

    -- Debit Sales Returns 4102
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description, note)
    VALUES (v_je_id, v_acc_returns, v_total_ex_vat, 0.00, 'مردودات ومسموحات المبيعات', v_return_num);

    -- Debit Output VAT 2110 (Tax reduction)
    IF v_total_vat > 0 THEN
      INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description, note)
      VALUES (v_je_id, v_acc_vat, v_total_vat, 0.00, 'تخفيض ضريبة القيمة المضافة مخرجات', v_return_num);
    END IF;

    -- Credit AR 1110 (Reduce customer balance)
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description, note)
    VALUES (v_je_id, v_acc_ar, 0.00, v_total_inc_vat, 'تخفيض رصيد ذمة العميل بموجب الإشعار الدائن', v_customer.name_ar);

    UPDATE sales_returns SET journal_entry_id = v_je_id WHERE id = v_return_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'return_id', v_return_id,
    'return_number', v_return_num,
    'grand_total', v_total_inc_vat
  );
END;
$$;

-- C. rpc_transfer_to_van: Transfers Finished Goods to Sales Van (1134 -> 1135)
CREATE OR REPLACE FUNCTION rpc_transfer_to_van(
  p_van_warehouse_id UUID,
  p_items JSONB, -- Array of { item_id, quantity, unit_type }
  p_notes TEXT,
  p_created_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_van_wh RECORD;
  v_fg_wh UUID;
  v_transfer_id UUID;
  v_tr_num TEXT;
  v_elem JSONB;
  v_item_id UUID;
  v_qty NUMERIC;
  v_unit_type TEXT;
  v_pieces NUMERIC;
  v_item RECORD;
  v_consume_res JSONB;
  v_total_cost NUMERIC := 0.00;
  v_je_id UUID;
  v_je_num TEXT;
  v_acc_fg UUID;
  v_acc_van UUID;
BEGIN
  SELECT * INTO v_van_wh FROM warehouses WHERE id = p_van_warehouse_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Van warehouse % not found', p_van_warehouse_id;
  END IF;

  SELECT id INTO v_fg_wh FROM warehouses WHERE warehouse_type = 'finished_goods' LIMIT 1;

  v_tr_num := 'VAN-LD-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(nextval('seq_van_transfers')::TEXT, 4, '0');

  INSERT INTO van_custody_transfers (
    transfer_number,
    source_warehouse_id,
    target_warehouse_id,
    assigned_rep_id,
    vehicle_id,
    transfer_type,
    status,
    notes,
    created_by
  ) VALUES (
    v_tr_num,
    v_fg_wh,
    p_van_warehouse_id,
    v_van_wh.assigned_rep_id,
    v_van_wh.vehicle_id,
    'load_to_van',
    'confirmed_by_warehouse',
    p_notes,
    p_created_by
  ) RETURNING id INTO v_transfer_id;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_id := (v_elem->>'item_id')::UUID;
    v_qty := (v_elem->>'quantity')::NUMERIC;
    v_unit_type := COALESCE(v_elem->>'unit_type', 'carton');

    SELECT * INTO v_item FROM items WHERE id = v_item_id;
    IF v_unit_type = 'carton' THEN
      v_pieces := v_qty * COALESCE(v_item.pieces_per_carton, 1);
    ELSE
      v_pieces := v_qty;
    END IF;

    INSERT INTO van_custody_items (transfer_id, item_id, quantity, unit_type, pieces_count)
    VALUES (v_transfer_id, v_item_id, v_qty, v_unit_type, v_pieces);

    -- Consume from main FG warehouse
    v_consume_res := rpc_consume_fifo(
      v_item_id,
      v_fg_wh,
      v_pieces,
      'internal_transfer',
      v_transfer_id,
      p_created_by
    );

    v_total_cost := v_total_cost + COALESCE((v_consume_res->>'total_cost')::NUMERIC, 0.00);

    -- Insert into Van Warehouse FIFO Layer
    INSERT INTO fifo_layers (
      item_id,
      warehouse_id,
      batch_number,
      layer_date,
      initial_qty,
      remaining_qty,
      unit_cost_ex_vat
    ) VALUES (
      v_item_id,
      p_van_warehouse_id,
      v_tr_num,
      CURRENT_DATE,
      v_pieces,
      v_pieces,
      COALESCE((v_consume_res->>'avg_unit_cost')::NUMERIC, 0.00)
    );
  END LOOP;

  -- Post Journal Entry (Debit 1135 Van Custody / Credit 1134 Finished Goods)
  SELECT id INTO v_acc_fg FROM accounts WHERE code = '1134';
  SELECT id INTO v_acc_van FROM accounts WHERE code = '1135';

  IF v_acc_fg IS NOT NULL AND v_acc_van IS NOT NULL AND v_total_cost > 0 THEN
    v_je_num := 'JV-TR-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(currval('seq_van_transfers')::TEXT, 4, '0');
    
    INSERT INTO journal_entries (
      entry_number,
      entry_date,
      description,
      total_debit,
      total_credit,
      status,
      is_posted,
      created_by
    ) VALUES (
      v_je_num,
      CURRENT_DATE,
      'تحميل بضاعة لسيارة التوزيع ' || v_van_wh.name_ar || ' برقم ' || v_tr_num,
      v_total_cost,
      v_total_cost,
      'posted',
      true,
      p_created_by
    ) RETURNING id INTO v_je_id;

    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description, note)
    VALUES (v_je_id, v_acc_van, v_total_cost, 0.00, 'إثبات تحميل بضاعة عهدة سيارة المندوب', v_tr_num);

    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description, note)
    VALUES (v_je_id, v_acc_fg, 0.00, v_total_cost, 'صرف بضاعة تامة لسيارة التوزيع', v_tr_num);

    UPDATE van_custody_transfers SET journal_entry_id = v_je_id WHERE id = v_transfer_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'transfer_id', v_transfer_id,
    'transfer_number', v_tr_num,
    'total_cost', v_total_cost
  );
END;
$$;

-- D. rpc_return_from_van: Returns remaining custody from Sales Van back to main warehouse
CREATE OR REPLACE FUNCTION rpc_return_from_van(
  p_van_warehouse_id UUID,
  p_items JSONB, -- Array of { item_id, quantity, unit_type }
  p_notes TEXT,
  p_created_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_van_wh RECORD;
  v_fg_wh UUID;
  v_transfer_id UUID;
  v_tr_num TEXT;
  v_elem JSONB;
  v_item_id UUID;
  v_qty NUMERIC;
  v_unit_type TEXT;
  v_pieces NUMERIC;
  v_item RECORD;
  v_consume_res JSONB;
  v_total_cost NUMERIC := 0.00;
  v_je_id UUID;
  v_je_num TEXT;
  v_acc_fg UUID;
  v_acc_van UUID;
BEGIN
  SELECT * INTO v_van_wh FROM warehouses WHERE id = p_van_warehouse_id;
  SELECT id INTO v_fg_wh FROM warehouses WHERE warehouse_type = 'finished_goods' LIMIT 1;

  v_tr_num := 'VAN-RT-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(nextval('seq_van_transfers')::TEXT, 4, '0');

  INSERT INTO van_custody_transfers (
    transfer_number,
    source_warehouse_id,
    target_warehouse_id,
    assigned_rep_id,
    vehicle_id,
    transfer_type,
    status,
    notes,
    created_by
  ) VALUES (
    v_tr_num,
    p_van_warehouse_id,
    v_fg_wh,
    v_van_wh.assigned_rep_id,
    v_van_wh.vehicle_id,
    'return_from_van',
    'confirmed_by_warehouse',
    p_notes,
    p_created_by
  ) RETURNING id INTO v_transfer_id;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_id := (v_elem->>'item_id')::UUID;
    v_qty := (v_elem->>'quantity')::NUMERIC;
    v_unit_type := COALESCE(v_elem->>'unit_type', 'carton');

    SELECT * INTO v_item FROM items WHERE id = v_item_id;
    IF v_unit_type = 'carton' THEN
      v_pieces := v_qty * COALESCE(v_item.pieces_per_carton, 1);
    ELSE
      v_pieces := v_qty;
    END IF;

    INSERT INTO van_custody_items (transfer_id, item_id, quantity, unit_type, pieces_count)
    VALUES (v_transfer_id, v_item_id, v_qty, v_unit_type, v_pieces);

    -- Consume from Van warehouse
    v_consume_res := rpc_consume_fifo(
      v_item_id,
      p_van_warehouse_id,
      v_pieces,
      'internal_transfer',
      v_transfer_id,
      p_created_by
    );

    v_total_cost := v_total_cost + COALESCE((v_consume_res->>'total_cost')::NUMERIC, 0.00);

    -- Deposit back to main FG
    INSERT INTO fifo_layers (
      item_id,
      warehouse_id,
      batch_number,
      layer_date,
      initial_qty,
      remaining_qty,
      unit_cost_ex_vat
    ) VALUES (
      v_item_id,
      v_fg_wh,
      v_tr_num,
      CURRENT_DATE,
      v_pieces,
      v_pieces,
      COALESCE((v_consume_res->>'avg_unit_cost')::NUMERIC, 0.00)
    );
  END LOOP;

  -- Post Journal Entry (Debit 1134 Finished Goods / Credit 1135 Van Custody)
  SELECT id INTO v_acc_fg FROM accounts WHERE code = '1134';
  SELECT id INTO v_acc_van FROM accounts WHERE code = '1135';

  IF v_acc_fg IS NOT NULL AND v_acc_van IS NOT NULL AND v_total_cost > 0 THEN
    v_je_num := 'JV-RT-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(currval('seq_van_transfers')::TEXT, 4, '0');
    
    INSERT INTO journal_entries (
      entry_number,
      entry_date,
      description,
      total_debit,
      total_credit,
      status,
      is_posted,
      created_by
    ) VALUES (
      v_je_num,
      CURRENT_DATE,
      'إرجاع متبقي عهدة سيارة التوزيع ' || v_van_wh.name_ar || ' برقم ' || v_tr_num,
      v_total_cost,
      v_total_cost,
      'posted',
      true,
      p_created_by
    ) RETURNING id INTO v_je_id;

    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description, note)
    VALUES (v_je_id, v_acc_fg, v_total_cost, 0.00, 'إثبات استلام متبقي عهدة السيارة بالمستودع', v_tr_num);

    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description, note)
    VALUES (v_je_id, v_acc_van, 0.00, v_total_cost, 'إخلاء عهدة سيارة التوزيع بالمتبقي', v_tr_num);

    UPDATE van_custody_transfers SET journal_entry_id = v_je_id WHERE id = v_transfer_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'transfer_id', v_transfer_id,
    'transfer_number', v_tr_num,
    'total_cost', v_total_cost
  );
END;
$$;

-- 10. Seed Realistic Phase 4 Data (Customers & Default Price List)
INSERT INTO customers (id, code, name_ar, name_en, vat_number, cr_number, phone, national_address, credit_limit, default_payment_days, guarantee_text)
VALUES
  ('c0000000-0000-0000-0000-000000000001', 'CUST-0001', 'شركة أسواق العثيم المركزية', 'Al Othaim Supermarkets Co.', '300055443300003', '1010223344', '0501112233', 'الرياض - حي الربوة - طريق الدائري الشرقي', 150000.00, 45, 'نضمن خلو كافة منظفات الأسياح من الشوائب والترسبات ومطابقتها للمواصفة القياسية السعودية SASO مع التعهد باستبدال أو تعويض أي عبوة معيبة.'),
  ('c0000000-0000-0000-0000-000000000002', 'CUST-0002', 'مؤسسة مدار القصيم للتجارة والتوزيع', 'Madar Al-Qassim Est.', '310022334400003', '1131002233', '0554443322', 'بريدة - طريق الملك فهد - مجمع التوزيع', 60000.00, 30, 'ضمان جودة المصنع لمدة 24 شهراً من تاريخ التعبئة.')
ON CONFLICT (code) DO NOTHING;

INSERT INTO price_lists (id, name_ar, name_en, is_default, is_active)
VALUES ('e0000000-0000-0000-0000-000000000001', 'قائمة أسعار الجملة المعتمدة', 'Standard Wholesale Price List', true, true)
ON CONFLICT DO NOTHING;
