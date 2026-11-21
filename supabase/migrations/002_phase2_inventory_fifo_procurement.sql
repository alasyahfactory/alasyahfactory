-- ============================================================================
-- Al-Asyah Detergent Factory ERP - Phase 2 Migration
-- Module: Inventory, Strict FIFO Engine, Procurement & Suppliers
-- Single Source of Truth: SPEC.md (v3.1) Sections 6.2, 6.3, 6.4, 7
-- ============================================================================

-- Ensure journal_entries and journal_lines support standard ERP schema
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS total_debit NUMERIC(14,2) DEFAULT 0;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS total_credit NUMERIC(14,2) DEFAULT 0;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'posted';
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS is_posted BOOLEAN DEFAULT true;
ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS note TEXT;

-- 1. Items & Raw Materials Catalog
CREATE TABLE IF NOT EXISTS items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('raw_material', 'packaging', 'bulk_in_tank', 'finished_good')),
  base_unit TEXT NOT NULL CHECK (base_unit IN ('gram', 'piece')),
  density NUMERIC(6,3) DEFAULT 1.000, -- 1 Liter = 1 Kg = 1000g default for liquids
  pieces_per_carton INTEGER DEFAULT 1,
  volume_per_unit_grams NUMERIC(12,2) DEFAULT 0,
  shelf_life_months INTEGER DEFAULT 24,
  reorder_point NUMERIC(14,2) DEFAULT 0,
  current_stock NUMERIC(14,2) DEFAULT 0,
  default_warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure all columns exist if items table was partially created
ALTER TABLE items ADD COLUMN IF NOT EXISTS density NUMERIC(6,3) DEFAULT 1.000;
ALTER TABLE items ADD COLUMN IF NOT EXISTS pieces_per_carton INTEGER DEFAULT 1;
ALTER TABLE items ADD COLUMN IF NOT EXISTS volume_per_unit_grams NUMERIC(12,2) DEFAULT 0;
ALTER TABLE items ADD COLUMN IF NOT EXISTS shelf_life_months INTEGER DEFAULT 24;
ALTER TABLE items ADD COLUMN IF NOT EXISTS reorder_point NUMERIC(14,2) DEFAULT 0;
ALTER TABLE items ADD COLUMN IF NOT EXISTS current_stock NUMERIC(14,2) DEFAULT 0;
ALTER TABLE items ADD COLUMN IF NOT EXISTS default_warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;
ALTER TABLE items ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 2. Delivery Vehicles Catalog (Linked to Reps & Sales Vans)
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  assigned_rep_id UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;

-- 3. Suppliers Catalog
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar TEXT NOT NULL,
  name_en TEXT,
  tax_number VARCHAR(15), -- 15-digit ZATCA VAT number
  contact_phone TEXT,
  contact_email TEXT,
  address TEXT,
  credit_limit NUMERIC(14,2) DEFAULT 0,
  current_balance NUMERIC(14,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Purchase Orders
CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number TEXT NOT NULL UNIQUE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery_date DATE,
  target_warehouse_id UUID REFERENCES warehouses(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'partially_received', 'completed', 'cancelled')),
  subtotal NUMERIC(14,2) DEFAULT 0,
  tax_amount NUMERIC(14,2) DEFAULT 0,
  total_amount NUMERIC(14,2) DEFAULT 0,
  created_by UUID REFERENCES users_profile(id),
  approved_by UUID REFERENCES users_profile(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id),
  ordered_qty NUMERIC(14,2) NOT NULL,
  received_qty NUMERIC(14,2) DEFAULT 0,
  unit_price_ex_vat NUMERIC(14,4) NOT NULL,
  vat_rate NUMERIC(4,2) DEFAULT 15.00,
  vat_amount NUMERIC(14,2) DEFAULT 0,
  total_ex_vat NUMERIC(14,2) DEFAULT 0,
  total_inc_vat NUMERIC(14,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Purchase Receipts (Actual Scale Weight in KG / Units Received)
CREATE TABLE IF NOT EXISTS purchase_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number TEXT NOT NULL UNIQUE,
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('draft', 'completed', 'cancelled')),
  supplier_dn_number TEXT,
  received_by UUID REFERENCES users_profile(id),
  freight_cost NUMERIC(14,2) DEFAULT 0, -- Account 6104
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_receipt_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID NOT NULL REFERENCES purchase_receipts(id) ON DELETE CASCADE,
  po_line_id UUID REFERENCES purchase_order_lines(id) ON DELETE SET NULL,
  item_id UUID NOT NULL REFERENCES items(id),
  weight_kg NUMERIC(12,3), -- Actual scale weight
  received_qty NUMERIC(14,2) NOT NULL, -- in grams for liquids/powder, pieces for packaging
  unit_cost_ex_vat NUMERIC(14,4) NOT NULL,
  batch_number TEXT NOT NULL,
  production_date DATE,
  expiry_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Strict FIFO Cost Layers
CREATE TABLE IF NOT EXISTS fifo_layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES items(id),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  batch_number TEXT NOT NULL,
  layer_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  initial_qty NUMERIC(14,2) NOT NULL,
  remaining_qty NUMERIC(14,2) NOT NULL,
  unit_cost_ex_vat NUMERIC(14,4) NOT NULL,
  expiry_date DATE,
  purchase_receipt_id UUID REFERENCES purchase_receipts(id) ON DELETE SET NULL,
  is_closed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Append-Only Inventory Movements
CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_number TEXT NOT NULL UNIQUE,
  item_id UUID NOT NULL REFERENCES items(id),
  movement_type TEXT NOT NULL CHECK (movement_type IN (
    'purchase_receipt',
    'purchase_return',
    'production_consume',
    'production_output',
    'sales_dispatch',
    'sales_return',
    'van_transfer',
    'opening_balance',
    'scrap_spoilage',
    'inventory_adjustment'
  )),
  source_warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  target_warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  batch_number TEXT,
  qty NUMERIC(14,2) NOT NULL,
  cost_per_unit NUMERIC(14,4) DEFAULT 0,
  total_cost NUMERIC(14,2) DEFAULT 0,
  fifo_layer_id UUID REFERENCES fifo_layers(id) ON DELETE SET NULL,
  reference_type TEXT,
  reference_id UUID,
  created_by UUID REFERENCES users_profile(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Negative Stock Queue (Automatic Variance Settlement on Account 5102)
CREATE TABLE IF NOT EXISTS negative_stock_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES items(id),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  qty_pending NUMERIC(14,2) NOT NULL,
  estimated_cost NUMERIC(14,4) NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  settled_at TIMESTAMPTZ,
  variance_amount NUMERIC(14,2) DEFAULT 0,
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Purchase Invoices (Accounts Payable 2101 & Input VAT 1140)
CREATE TABLE IF NOT EXISTS purchase_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  supplier_invoice_number TEXT NOT NULL,
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  purchase_receipt_id UUID REFERENCES purchase_receipts(id) ON DELETE SET NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  subtotal_ex_vat NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  freight_amount NUMERIC(14,2) NOT NULL DEFAULT 0, -- Account 6104
  total_inc_vat NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('draft', 'posted', 'paid', 'cancelled')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partially_paid', 'paid')),
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users_profile(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id),
  qty NUMERIC(14,2) NOT NULL,
  unit_price_ex_vat NUMERIC(14,4) NOT NULL,
  vat_rate NUMERIC(4,2) DEFAULT 15.00,
  vat_amount NUMERIC(14,2) DEFAULT 0,
  total_ex_vat NUMERIC(14,2) DEFAULT 0,
  total_inc_vat NUMERIC(14,2) DEFAULT 0,
  notes TEXT
);

-- 10. Purchase Returns (Debit Note DN with Supplier Defect Compensation)
CREATE TABLE IF NOT EXISTS purchase_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number TEXT NOT NULL UNIQUE,
  purchase_invoice_id UUID REFERENCES purchase_invoices(id) ON DELETE SET NULL,
  purchase_receipt_id UUID REFERENCES purchase_receipts(id) ON DELETE SET NULL,
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  return_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_claimed_ex_vat NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_vat_refund NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_claimed_inc_vat NUMERIC(14,2) NOT NULL DEFAULT 0,
  stock_deducted_value NUMERIC(14,2) NOT NULL DEFAULT 0, -- Deducted from 1131
  consumed_compensation_value NUMERIC(14,2) NOT NULL DEFAULT 0, -- Credited to 4201
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('draft', 'completed', 'cancelled')),
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users_profile(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_return_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id),
  fifo_layer_id UUID REFERENCES fifo_layers(id) ON DELETE SET NULL,
  claimed_qty NUMERIC(14,2) NOT NULL,
  remaining_in_stock_qty NUMERIC(14,2) NOT NULL DEFAULT 0,
  consumed_qty NUMERIC(14,2) NOT NULL DEFAULT 0,
  unit_price_ex_vat NUMERIC(14,4) NOT NULL,
  vat_rate NUMERIC(4,2) DEFAULT 15.00,
  total_ex_vat NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_inc_vat NUMERIC(14,2) NOT NULL DEFAULT 0,
  stock_deducted_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  compensation_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  reason TEXT
);

-- ============================================================================
-- 11. Atomic PL/pgSQL RPC Engines
-- ============================================================================

-- A. rpc_receive_fifo: Atomically receives inventory into FIFO layers & settles negative stock queue
CREATE OR REPLACE FUNCTION rpc_receive_fifo(
  p_receipt_id UUID,
  p_created_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_receipt RECORD;
  v_line RECORD;
  v_layer_id UUID;
  v_mov_num TEXT;
  v_neg_queue RECORD;
  v_settle_qty NUMERIC;
  v_variance NUMERIC;
  v_settled_total NUMERIC := 0;
BEGIN
  -- 1. Fetch receipt
  SELECT * INTO v_receipt FROM purchase_receipts WHERE id = p_receipt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase receipt % not found', p_receipt_id;
  END IF;

  -- 2. Loop through receipt lines
  FOR v_line IN (SELECT * FROM purchase_receipt_lines WHERE receipt_id = p_receipt_id) LOOP
    -- Insert FIFO Layer
    INSERT INTO fifo_layers (
      item_id,
      warehouse_id,
      batch_number,
      layer_date,
      initial_qty,
      remaining_qty,
      unit_cost_ex_vat,
      expiry_date,
      purchase_receipt_id
    ) VALUES (
      v_line.item_id,
      v_receipt.warehouse_id,
      v_line.batch_number,
      NOW(),
      v_line.received_qty,
      v_line.received_qty,
      v_line.unit_cost_ex_vat,
      v_line.expiry_date,
      p_receipt_id
    ) RETURNING id INTO v_layer_id;

    -- Update Item current_stock
    UPDATE items
    SET current_stock = current_stock + v_line.received_qty,
        updated_at = NOW()
    WHERE id = v_line.item_id;

    -- Record in inventory_movements (Append-only)
    v_mov_num := 'MOV-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || SUBSTRING(gen_random_uuid()::TEXT FROM 1 FOR 6);
    INSERT INTO inventory_movements (
      movement_number,
      item_id,
      movement_type,
      target_warehouse_id,
      batch_number,
      qty,
      cost_per_unit,
      total_cost,
      fifo_layer_id,
      reference_type,
      reference_id,
      created_by,
      notes
    ) VALUES (
      v_mov_num,
      v_line.item_id,
      'purchase_receipt',
      v_receipt.warehouse_id,
      v_line.batch_number,
      v_line.received_qty,
      v_line.unit_cost_ex_vat,
      ROUND((v_line.received_qty * v_line.unit_cost_ex_vat)::NUMERIC, 2),
      v_layer_id,
      'purchase_receipt',
      p_receipt_id,
      p_created_by,
      'استلام مشتريات بالوزن الفعلي - باتش ' || v_line.batch_number
    );

    -- Check and settle negative stock queue for this item and warehouse
    FOR v_neg_queue IN (
      SELECT * FROM negative_stock_queue
      WHERE item_id = v_line.item_id
        AND warehouse_id = v_receipt.warehouse_id
        AND settled_at IS NULL
      ORDER BY created_at ASC
      FOR UPDATE
    ) LOOP
      IF v_line.received_qty > 0 THEN
        v_settle_qty := LEAST(v_line.received_qty, v_neg_queue.qty_pending);
        v_variance := (v_line.unit_cost_ex_vat - v_neg_queue.estimated_cost) * v_settle_qty;

        -- Update queue item
        UPDATE negative_stock_queue
        SET qty_pending = qty_pending - v_settle_qty,
            variance_amount = variance_amount + v_variance,
            settled_at = CASE WHEN qty_pending - v_settle_qty <= 0 THEN NOW() ELSE NULL END
        WHERE id = v_neg_queue.id;

        v_settled_total := v_settled_total + v_variance;
      END IF;
    END LOOP;

  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'receipt_id', p_receipt_id,
    'settled_variance', v_settled_total
  );
END;
$$;

-- B. rpc_consume_fifo: Atomically consumes stock FIFO with row-level locks
CREATE OR REPLACE FUNCTION rpc_consume_fifo(
  p_item_id UUID,
  p_warehouse_id UUID,
  p_qty NUMERIC,
  p_reference_type TEXT,
  p_reference_id UUID,
  p_created_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_remaining_to_consume NUMERIC := p_qty;
  v_layer RECORD;
  v_consumed_from_layer NUMERIC;
  v_total_cost NUMERIC := 0.00;
  v_last_known_cost NUMERIC := 0.00;
  v_consumed_layers JSONB := '[]'::JSONB;
  v_mov_num TEXT;
BEGIN
  IF p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantity to consume must be greater than zero';
  END IF;

  -- 1. Lock and consume from open FIFO layers
  FOR v_layer IN (
    SELECT * FROM fifo_layers
    WHERE item_id = p_item_id
      AND warehouse_id = p_warehouse_id
      AND is_closed = false
      AND remaining_qty > 0
    ORDER BY layer_date ASC, created_at ASC
    FOR UPDATE
  ) LOOP
    v_last_known_cost := v_layer.unit_cost_ex_vat;
    v_consumed_from_layer := LEAST(v_remaining_to_consume, v_layer.remaining_qty);

    -- Deduct from layer
    UPDATE fifo_layers
    SET remaining_qty = remaining_qty - v_consumed_from_layer,
        is_closed = (remaining_qty - v_consumed_from_layer <= 0),
        updated_at = NOW()
    WHERE id = v_layer.id;

    v_total_cost := v_total_cost + (v_consumed_from_layer * v_layer.unit_cost_ex_vat);
    v_remaining_to_consume := v_remaining_to_consume - v_consumed_from_layer;

    -- Record movement
    v_mov_num := 'MOV-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || SUBSTRING(gen_random_uuid()::TEXT FROM 1 FOR 6);
    INSERT INTO inventory_movements (
      movement_number,
      item_id,
      movement_type,
      source_warehouse_id,
      batch_number,
      qty,
      cost_per_unit,
      total_cost,
      fifo_layer_id,
      reference_type,
      reference_id,
      created_by
    ) VALUES (
      v_mov_num,
      p_item_id,
      p_reference_type,
      p_warehouse_id,
      v_layer.batch_number,
      -v_consumed_from_layer,
      v_layer.unit_cost_ex_vat,
      ROUND((v_consumed_from_layer * v_layer.unit_cost_ex_vat)::NUMERIC, 2),
      v_layer.id,
      p_reference_type,
      p_reference_id,
      p_created_by
    );

    v_consumed_layers := v_consumed_layers || jsonb_build_object(
      'layer_id', v_layer.id,
      'batch_number', v_layer.batch_number,
      'qty', v_consumed_from_layer,
      'unit_cost', v_layer.unit_cost_ex_vat
    );

    EXIT WHEN v_remaining_to_consume <= 0;
  END LOOP;

  -- 2. If deficit remains (Negative Stock), push to negative_stock_queue
  IF v_remaining_to_consume > 0 THEN
    IF v_last_known_cost <= 0 THEN
      -- Get latest known cost across any layer
      SELECT unit_cost_ex_vat INTO v_last_known_cost
      FROM fifo_layers
      WHERE item_id = p_item_id
      ORDER BY created_at DESC LIMIT 1;
      IF v_last_known_cost IS NULL THEN
        v_last_known_cost := 0.00;
      END IF;
    END IF;

    INSERT INTO negative_stock_queue (
      item_id,
      warehouse_id,
      qty_pending,
      estimated_cost,
      reference_type,
      reference_id
    ) VALUES (
      p_item_id,
      p_warehouse_id,
      v_remaining_to_consume,
      v_last_known_cost,
      p_reference_type,
      p_reference_id
    );

    v_total_cost := v_total_cost + (v_remaining_to_consume * v_last_known_cost);
  END IF;

  -- 3. Update Item current_stock
  UPDATE items
  SET current_stock = current_stock - p_qty,
      updated_at = NOW()
  WHERE id = p_item_id;

  RETURN jsonb_build_object(
    'success', true,
    'consumed_qty', p_qty,
    'total_cost', ROUND(v_total_cost, 2),
    'avg_unit_cost', CASE WHEN p_qty > 0 THEN ROUND((v_total_cost / p_qty)::NUMERIC, 4) ELSE 0 END,
    'deficit_queued', v_remaining_to_consume,
    'layers', v_consumed_layers
  );
END;
$$;

-- C. rpc_post_opening_balances: Post initial stock layers and balance with account 3102
CREATE OR REPLACE FUNCTION rpc_post_opening_balances(
  p_items_data JSONB,
  p_created_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item JSONB;
  v_item_id UUID;
  v_warehouse_id UUID;
  v_qty NUMERIC;
  v_unit_cost NUMERIC;
  v_batch TEXT;
  v_layer_id UUID;
  v_total_inventory_value NUMERIC := 0.00;
  v_mov_num TEXT;
  v_je_id UUID;
  v_je_num TEXT;
  v_account_raw UUID;
  v_account_pkg UUID;
  v_account_fg UUID;
  v_account_equity UUID;
BEGIN
  -- Resolve accounts
  SELECT id INTO v_account_raw FROM accounts WHERE code = '1131';
  SELECT id INTO v_account_pkg FROM accounts WHERE code = '1132';
  SELECT id INTO v_account_fg FROM accounts WHERE code = '1134';
  SELECT id INTO v_account_equity FROM accounts WHERE code = '3102'; -- Opening Balance Equity

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items_data) LOOP
    v_item_id := (v_item->>'item_id')::UUID;
    v_warehouse_id := (v_item->>'warehouse_id')::UUID;
    v_qty := (v_item->>'qty')::NUMERIC;
    v_unit_cost := (v_item->>'unit_cost')::NUMERIC;
    v_batch := COALESCE(v_item->>'batch_number', 'OPENING-2026');

    IF v_qty > 0 THEN
      -- Create initial FIFO layer
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
        v_warehouse_id,
        v_batch,
        NOW(),
        v_qty,
        v_qty,
        v_unit_cost
      ) RETURNING id INTO v_layer_id;

      -- Update item current stock
      UPDATE items
      SET current_stock = current_stock + v_qty,
          updated_at = NOW()
      WHERE id = v_item_id;

      -- Inventory movement
      v_mov_num := 'MOV-OPEN-' || SUBSTRING(gen_random_uuid()::TEXT FROM 1 FOR 8);
      INSERT INTO inventory_movements (
        movement_number,
        item_id,
        movement_type,
        target_warehouse_id,
        batch_number,
        qty,
        cost_per_unit,
        total_cost,
        fifo_layer_id,
        reference_type,
        created_by,
        notes
      ) VALUES (
        v_mov_num,
        v_item_id,
        'opening_balance',
        v_warehouse_id,
        v_batch,
        v_qty,
        v_unit_cost,
        ROUND((v_qty * v_unit_cost)::NUMERIC, 2),
        v_layer_id,
        'opening_balance',
        p_created_by,
        'تسجيل الرصيد الافتتاحي للمخزون'
      );

      v_total_inventory_value := v_total_inventory_value + (v_qty * v_unit_cost);
    END IF;
  END LOOP;

  -- Create balanced Journal Entry for Opening Balance (Debit Inventory, Credit Opening Equity 3102)
  IF v_total_inventory_value > 0 AND v_account_equity IS NOT NULL THEN
    v_je_num := 'JV-OPEN-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || SUBSTRING(gen_random_uuid()::TEXT FROM 1 FOR 4);
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
      'قيد إثبات الأرصدة الافتتاحية للمخزون الأولي',
      ROUND(v_total_inventory_value, 2),
      ROUND(v_total_inventory_value, 2),
      'posted',
      true,
      p_created_by
    ) RETURNING id INTO v_je_id;

    -- Debit Inventory Account (1131 Raw Materials default)
    INSERT INTO journal_lines (
      journal_entry_id,
      account_id,
      debit,
      credit,
      description,
      note
    ) VALUES (
      v_je_id,
      COALESCE(v_account_raw, v_account_fg),
      ROUND(v_total_inventory_value, 2),
      0.00,
      'إثبات تكلفة بضاعة أول المدة',
      'إثبات تكلفة بضاعة أول المدة'
    );

    -- Credit Opening Balance Equity (3102)
    INSERT INTO journal_lines (
      journal_entry_id,
      account_id,
      debit,
      credit,
      description,
      note
    ) VALUES (
      v_je_id,
      v_account_equity,
      0.00,
      ROUND(v_total_inventory_value, 2),
      'تسوية الأرصدة الافتتاحية لحقوق الملكية',
      'تسوية الأرصدة الافتتاحية لحقوق الملكية'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'total_inventory_value', ROUND(v_total_inventory_value, 2),
    'journal_entry_id', v_je_id
  );
END;
$$;

-- D. rpc_process_purchase_return_with_compensation: Process integrated debit note
CREATE OR REPLACE FUNCTION rpc_process_purchase_return_with_compensation(
  p_return_id UUID,
  p_created_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ret RECORD;
  v_line RECORD;
  v_layer RECORD;
  v_remaining_in_stock NUMERIC;
  v_consumed_qty NUMERIC;
  v_stock_deduct_val NUMERIC;
  v_comp_val NUMERIC;
  v_total_stock_deduct NUMERIC := 0.00;
  v_total_comp NUMERIC := 0.00;
  v_je_id UUID;
  v_je_num TEXT;
  v_account_supplier UUID;
  v_account_raw UUID;
  v_account_comp UUID;
  v_account_vat UUID;
BEGIN
  SELECT * INTO v_ret FROM purchase_returns WHERE id = p_return_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase return % not found', p_return_id;
  END IF;

  -- Accounts lookup
  SELECT id INTO v_account_supplier FROM accounts WHERE code = '2101'; -- Accounts Payable
  SELECT id INTO v_account_raw FROM accounts WHERE code = '1131';      -- Raw Materials Inventory
  SELECT id INTO v_account_comp FROM accounts WHERE code = '4201';     -- Supplier Defect Compensation
  SELECT id INTO v_account_vat FROM accounts WHERE code = '1140';      -- Input VAT

  FOR v_line IN (SELECT * FROM purchase_return_lines WHERE return_id = p_return_id) LOOP
    -- Fetch layer
    IF v_line.fifo_layer_id IS NOT NULL THEN
      SELECT * INTO v_layer FROM fifo_layers WHERE id = v_line.fifo_layer_id FOR UPDATE;
      v_remaining_in_stock := LEAST(v_line.claimed_qty, v_layer.remaining_qty);
    ELSE
      v_remaining_in_stock := 0;
    END IF;

    v_consumed_qty := GREATEST(0, v_line.claimed_qty - v_remaining_in_stock);
    v_stock_deduct_val := v_remaining_in_stock * v_line.unit_price_ex_vat;
    v_comp_val := v_consumed_qty * v_line.unit_price_ex_vat;

    -- Update return line
    UPDATE purchase_return_lines
    SET remaining_in_stock_qty = v_remaining_in_stock,
        consumed_qty = v_consumed_qty,
        stock_deducted_amount = ROUND(v_stock_deduct_val, 2),
        compensation_amount = ROUND(v_comp_val, 2)
    WHERE id = v_line.id;

    -- Deduct remaining part from FIFO layer
    IF v_remaining_in_stock > 0 THEN
      UPDATE fifo_layers
      SET remaining_qty = remaining_qty - v_remaining_in_stock,
          is_closed = (remaining_qty - v_remaining_in_stock <= 0),
          updated_at = NOW()
      WHERE id = v_layer.id;

      -- Deduct from item stock
      UPDATE items
      SET current_stock = current_stock - v_remaining_in_stock,
          updated_at = NOW()
      WHERE id = v_line.item_id;

      -- Record inventory movement
      INSERT INTO inventory_movements (
        movement_number,
        item_id,
        movement_type,
        source_warehouse_id,
        batch_number,
        qty,
        cost_per_unit,
        total_cost,
        fifo_layer_id,
        reference_type,
        reference_id,
        created_by,
        notes
      ) VALUES (
        'MOV-RET-' || SUBSTRING(gen_random_uuid()::TEXT FROM 1 FOR 8),
        v_line.item_id,
        'purchase_return',
        v_layer.warehouse_id,
        v_layer.batch_number,
        -v_remaining_in_stock,
        v_line.unit_price_ex_vat,
        ROUND(v_stock_deduct_val, 2),
        v_layer.id,
        'purchase_return',
        p_return_id,
        p_created_by,
        'إشعار مدين: إرجاع خامات تالفة للمورد'
      );
    END IF;

    v_total_stock_deduct := v_total_stock_deduct + v_stock_deduct_val;
    v_total_comp := v_total_comp + v_comp_val;
  END LOOP;

  -- Update return header totals
  UPDATE purchase_returns
  SET stock_deducted_value = ROUND(v_total_stock_deduct, 2),
      consumed_compensation_value = ROUND(v_total_comp, 2),
      status = 'completed'
  WHERE id = p_return_id;

  -- Post balanced Journal Entry (SPEC.md Section 6.4)
  -- Debit: Supplier Payable (2101) with Total Claimed + VAT
  -- Credit: Inventory (1131) with actual physical returned stock value
  -- Credit: Supplier Compensation (4201) with consumed defect compensation
  -- Credit: Input VAT (1140) with VAT reversal
  v_je_num := 'JV-DN-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || SUBSTRING(gen_random_uuid()::TEXT FROM 1 FOR 4);
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
    'إشعار مدين مدمج للمورد: إرجاع بضاعة معيبة وتعويض المستهلك منها',
    v_ret.total_claimed_inc_vat,
    v_ret.total_claimed_inc_vat,
    'posted',
    true,
    p_created_by
  ) RETURNING id INTO v_je_id;

  -- Line 1: Debit Supplier 2101
  INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description, note)
  VALUES (v_je_id, v_account_supplier, v_ret.total_claimed_inc_vat, 0.00, 'خصم كامل المطالبة والضريبة من حساب المورد', 'خصم كامل المطالبة والضريبة من حساب المورد');

  -- Line 2: Credit Inventory 1131 (Physical Stock returned)
  IF v_total_stock_deduct > 0 THEN
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description, note)
    VALUES (v_je_id, v_account_raw, 0.00, ROUND(v_total_stock_deduct, 2), 'تخفيض مخزون الخامات بالمتبقي الفعلي المرتجع', 'تخفيض مخزون الخامات بالمتبقي الفعلي المرتجع');
  END IF;

  -- Line 3: Credit Supplier Defect Compensation 4201 (Consumed part compensation)
  IF v_total_comp > 0 THEN
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description, note)
    VALUES (v_je_id, v_account_comp, 0.00, ROUND(v_total_comp, 2), 'تعويض المورد عن الجزء المستهلك من الخامة المعيبة', 'تعويض المورد عن الجزء المستهلك من الخامة المعيبة');
  END IF;

  -- Line 4: Credit Input VAT 1140
  IF v_ret.total_vat_refund > 0 THEN
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description, note)
    VALUES (v_je_id, v_account_vat, 0.00, v_ret.total_vat_refund, 'عكس ضريبة القيمة المضافة للإشعار المدين', 'عكس ضريبة القيمة المضافة للإشعار المدين');
  END IF;

  -- Link journal entry to return
  UPDATE purchase_returns SET journal_entry_id = v_je_id WHERE id = p_return_id;

  RETURN jsonb_build_object(
    'success', true,
    'return_id', p_return_id,
    'stock_deducted', ROUND(v_total_stock_deduct, 2),
    'compensation', ROUND(v_total_comp, 2),
    'journal_entry_id', v_je_id
  );
END;
$$;

-- ============================================================================
-- 12. Row Level Security (RLS) Policies
-- ============================================================================

ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_receipt_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE fifo_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE negative_stock_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_return_lines ENABLE ROW LEVEL SECURITY;

-- Helper to safely recreate policies
DO $$
BEGIN
  -- Items
  DROP POLICY IF EXISTS "items_read" ON items;
  DROP POLICY IF EXISTS "items_write" ON items;
  CREATE POLICY "items_read" ON items FOR SELECT TO authenticated USING (true);
  CREATE POLICY "items_write" ON items FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM users_profile WHERE id = auth.uid() AND role IN ('owner', 'accountant', 'production'))
  );

  -- Vehicles
  DROP POLICY IF EXISTS "vehicles_read" ON vehicles;
  DROP POLICY IF EXISTS "vehicles_write" ON vehicles;
  CREATE POLICY "vehicles_read" ON vehicles FOR SELECT TO authenticated USING (true);
  CREATE POLICY "vehicles_write" ON vehicles FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM users_profile WHERE id = auth.uid() AND role IN ('owner', 'accountant'))
  );

  -- Suppliers
  DROP POLICY IF EXISTS "suppliers_read" ON suppliers;
  DROP POLICY IF EXISTS "suppliers_write" ON suppliers;
  CREATE POLICY "suppliers_read" ON suppliers FOR SELECT TO authenticated USING (true);
  CREATE POLICY "suppliers_write" ON suppliers FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM users_profile WHERE id = auth.uid() AND role IN ('owner', 'accountant'))
  );

  -- Purchase Orders
  DROP POLICY IF EXISTS "po_read" ON purchase_orders;
  DROP POLICY IF EXISTS "po_write" ON purchase_orders;
  CREATE POLICY "po_read" ON purchase_orders FOR SELECT TO authenticated USING (true);
  CREATE POLICY "po_write" ON purchase_orders FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM users_profile WHERE id = auth.uid() AND role IN ('owner', 'accountant'))
  );

  DROP POLICY IF EXISTS "po_lines_all" ON purchase_order_lines;
  CREATE POLICY "po_lines_all" ON purchase_order_lines FOR ALL TO authenticated USING (true);

  -- Purchase Receipts
  DROP POLICY IF EXISTS "pr_all" ON purchase_receipts;
  CREATE POLICY "pr_all" ON purchase_receipts FOR ALL TO authenticated USING (true);
  DROP POLICY IF EXISTS "pr_lines_all" ON purchase_receipt_lines;
  CREATE POLICY "pr_lines_all" ON purchase_receipt_lines FOR ALL TO authenticated USING (true);

  -- FIFO Layers & Movements
  DROP POLICY IF EXISTS "fifo_layers_read" ON fifo_layers;
  CREATE POLICY "fifo_layers_read" ON fifo_layers FOR SELECT TO authenticated USING (true);
  DROP POLICY IF EXISTS "inv_mov_read" ON inventory_movements;
  CREATE POLICY "inv_mov_read" ON inventory_movements FOR SELECT TO authenticated USING (true);

  -- Negative stock queue
  DROP POLICY IF EXISTS "neg_stock_read" ON negative_stock_queue;
  CREATE POLICY "neg_stock_read" ON negative_stock_queue FOR SELECT TO authenticated USING (true);

  -- Invoices & Returns
  DROP POLICY IF EXISTS "pi_all" ON purchase_invoices;
  CREATE POLICY "pi_all" ON purchase_invoices FOR ALL TO authenticated USING (true);
  DROP POLICY IF EXISTS "pi_lines_all" ON purchase_invoice_lines;
  CREATE POLICY "pi_lines_all" ON purchase_invoice_lines FOR ALL TO authenticated USING (true);
  DROP POLICY IF EXISTS "pr_ret_all" ON purchase_returns;
  CREATE POLICY "pr_ret_all" ON purchase_returns FOR ALL TO authenticated USING (true);
  DROP POLICY IF EXISTS "pr_ret_lines_all" ON purchase_return_lines;
  CREATE POLICY "pr_ret_lines_all" ON purchase_return_lines FOR ALL TO authenticated USING (true);
END $$;
