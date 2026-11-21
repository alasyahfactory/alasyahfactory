-- ============================================================================
-- Al-Asyah Detergent Factory ERP - Phase 3 Migration
-- Module: Manufacturing, BOM Formulas, Tank Lifecycle, QC Gate & Multi-Size Packaging
-- Single Source of Truth: SPEC.md (v3.1) Sections 6.2, 6.3, 7
-- ============================================================================

-- 1. Ensure tanks table allows full status spectrum without enum restriction
ALTER TABLE tanks ALTER COLUMN status TYPE TEXT;
ALTER TABLE tanks DROP CONSTRAINT IF EXISTS check_tank_status;
ALTER TABLE tanks ADD CONSTRAINT check_tank_status CHECK (
  status IN ('empty', 'mixing', 'pending_qc', 'qc_pending', 'ready_for_packaging', 'in_tank', 'rework')
);

-- 2. Bulk Item Support on Items (WIP Item produced in tank)
-- Ensure items table has bulk_in_tank type
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_item_type_check;
ALTER TABLE items ADD CONSTRAINT items_item_type_check CHECK (
  item_type IN ('raw_material', 'packaging', 'bulk_in_tank', 'finished_good')
);

-- 3. Formulas (Bill of Materials - BOM)
CREATE TABLE IF NOT EXISTS formulas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  bulk_item_id UUID REFERENCES items(id) ON DELETE SET NULL,
  batch_size_grams NUMERIC(14,2) NOT NULL DEFAULT 5000000, -- 5,000 Kg = 5 Tons default
  density NUMERIC(6,3) DEFAULT 1.020,
  target_ph_min NUMERIC(4,2) DEFAULT 6.50,
  target_ph_max NUMERIC(4,2) DEFAULT 7.50,
  target_viscosity_min NUMERIC(8,2) DEFAULT 2500, -- in cP
  target_viscosity_max NUMERIC(8,2) DEFAULT 3500,
  instructions TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Formula Lines (Raw materials breakdown per batch)
CREATE TABLE IF NOT EXISTS formula_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  formula_id UUID NOT NULL REFERENCES formulas(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id),
  qty_grams NUMERIC(14,2) NOT NULL,
  percentage NUMERIC(6,3), -- auto-calculated % of total batch
  addition_step INTEGER DEFAULT 1,
  instructions TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Packaging Specifications (BOM for Packaging finished goods from bulk)
CREATE TABLE IF NOT EXISTS packaging_specs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  finished_good_id UUID NOT NULL REFERENCES items(id),
  bulk_item_id UUID NOT NULL REFERENCES items(id),
  volume_per_unit_grams NUMERIC(12,2) NOT NULL, -- e.g. 5000g for 5L gallon
  bottle_item_id UUID NOT NULL REFERENCES items(id), -- Gallon/Bottle with cap
  front_sticker_item_id UUID REFERENCES items(id),
  back_sticker_item_id UUID REFERENCES items(id),
  carton_item_id UUID REFERENCES items(id),
  pieces_per_carton INTEGER NOT NULL DEFAULT 4,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Mixing Batches (Tank Mixing & QC Gate)
CREATE TABLE IF NOT EXISTS mixing_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number TEXT NOT NULL UNIQUE,
  formula_id UUID NOT NULL REFERENCES formulas(id),
  tank_id UUID NOT NULL REFERENCES tanks(id),
  planned_qty_grams NUMERIC(14,2) NOT NULL,
  actual_output_grams NUMERIC(14,2),
  remaining_qty_grams NUMERIC(14,2),
  status TEXT NOT NULL DEFAULT 'mixing' CHECK (
    status IN ('mixing', 'pending_qc', 'qc_passed', 'ready_for_packaging', 'in_packaging', 'closed', 'cancelled', 'rework')
  ),
  
  -- Quality Gate (QC Gate) Fields
  qc_ph NUMERIC(4,2),
  qc_viscosity NUMERIC(8,2),
  qc_odor_ok BOOLEAN DEFAULT true,
  qc_color_ok BOOLEAN DEFAULT true,
  qc_status TEXT NOT NULL DEFAULT 'pending' CHECK (qc_status IN ('pending', 'passed', 'needs_rework')),
  qc_tested_by UUID REFERENCES users_profile(id),
  qc_tested_at TIMESTAMPTZ,
  qc_notes TEXT,
  
  -- Tank closure & yield variance
  actual_yield_grams NUMERIC(14,2),
  yield_variance_grams NUMERIC(14,2) DEFAULT 0,
  variance_cost NUMERIC(14,2) DEFAULT 0,
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  closed_by UUID REFERENCES users_profile(id),
  closed_at TIMESTAMPTZ,

  created_by UUID REFERENCES users_profile(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Mixing Consumptions (Chemicals consumed from raw materials warehouse into WIP)
CREATE TABLE IF NOT EXISTS mixing_consumptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mixing_batch_id UUID NOT NULL REFERENCES mixing_batches(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id),
  consumption_type TEXT NOT NULL DEFAULT 'standard' CHECK (
    consumption_type IN ('standard', 'adjustment_ph', 'adjustment_viscosity', 'rework', 'write_off')
  ),
  qty_grams NUMERIC(14,2) NOT NULL,
  unit_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
  total_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users_profile(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Packaging Orders (Filling multiple sizes from same tank)
CREATE TABLE IF NOT EXISTS packaging_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE,
  mixing_batch_id UUID NOT NULL REFERENCES mixing_batches(id),
  packaging_spec_id UUID NOT NULL REFERENCES packaging_specs(id),
  target_fg_item_id UUID NOT NULL REFERENCES items(id),
  packaging_date DATE NOT NULL DEFAULT CURRENT_DATE,
  units_produced INTEGER NOT NULL,
  cartons_produced INTEGER NOT NULL DEFAULT 0,
  bulk_consumed_grams NUMERIC(14,2) NOT NULL,
  
  -- Wasted packaging items
  wasted_bottles INTEGER NOT NULL DEFAULT 0,
  wasted_stickers INTEGER NOT NULL DEFAULT 0,
  wasted_cartons INTEGER NOT NULL DEFAULT 0,
  wasted_notes TEXT,

  total_cost NUMERIC(14,2) DEFAULT 0,
  unit_cost NUMERIC(14,4) DEFAULT 0,
  target_warehouse_id UUID REFERENCES warehouses(id),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('draft', 'completed', 'cancelled')),
  created_by UUID REFERENCES users_profile(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 8. Atomic PL/pgSQL RPC Engines for Phase 3
-- ============================================================================

-- A. rpc_pre_production_check: Checks raw material availability before mixing
CREATE OR REPLACE FUNCTION rpc_pre_production_check(
  p_formula_id UUID,
  p_batch_size_grams NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_formula RECORD;
  v_line RECORD;
  v_multiplier NUMERIC;
  v_required_qty NUMERIC;
  v_item RECORD;
  v_results JSONB := '[]'::JSONB;
  v_all_available BOOLEAN := true;
BEGIN
  SELECT * INTO v_formula FROM formulas WHERE id = p_formula_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Formula % not found', p_formula_id;
  END IF;

  v_multiplier := p_batch_size_grams / v_formula.batch_size_grams;

  FOR v_line IN (SELECT * FROM formula_lines WHERE formula_id = p_formula_id) LOOP
    v_required_qty := v_line.qty_grams * v_multiplier;
    SELECT * INTO v_item FROM items WHERE id = v_line.item_id;

    IF v_item.current_stock < v_required_qty THEN
      v_all_available := false;
    END IF;

    v_results := v_results || jsonb_build_object(
      'item_id', v_item.id,
      'sku', v_item.sku,
      'name_ar', v_item.name_ar,
      'name_en', v_item.name_en,
      'base_unit', v_item.base_unit,
      'required_qty', v_required_qty,
      'available_stock', v_item.current_stock,
      'missing_qty', GREATEST(0, v_required_qty - v_item.current_stock),
      'is_sufficient', (v_item.current_stock >= v_required_qty)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'formula_id', p_formula_id,
    'planned_batch_size', p_batch_size_grams,
    'can_produce', v_all_available,
    'items', v_results
  );
END;
$$;

-- B. rpc_start_mixing_batch: Starts mixing batch, locks tank, and consumes FIFO raw materials into WIP
CREATE OR REPLACE FUNCTION rpc_start_mixing_batch(
  p_formula_id UUID,
  p_tank_id UUID,
  p_planned_qty_grams NUMERIC,
  p_created_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_formula RECORD;
  v_tank RECORD;
  v_batch_id UUID;
  v_batch_num TEXT;
  v_line RECORD;
  v_multiplier NUMERIC;
  v_line_qty NUMERIC;
  v_consume_res JSONB;
  v_total_batch_cost NUMERIC := 0.00;
  v_raw_warehouse_id UUID;
  v_je_id UUID;
  v_je_num TEXT;
  v_account_raw UUID;
  v_account_wip UUID;
BEGIN
  -- 1. Check tank availability (must be empty)
  SELECT * INTO v_tank FROM tanks WHERE id = p_tank_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tank % not found', p_tank_id;
  END IF;

  IF v_tank.status != 'empty' THEN
    RAISE EXCEPTION 'Tank % is not empty (Current status: %). Cannot start new mixing batch.', v_tank.tank_code, v_tank.status;
  END IF;

  -- 2. Fetch formula
  SELECT * INTO v_formula FROM formulas WHERE id = p_formula_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Formula % not found', p_formula_id;
  END IF;

  v_multiplier := p_planned_qty_grams / v_formula.batch_size_grams;
  v_batch_num := 'BATCH-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || SUBSTRING(gen_random_uuid()::TEXT FROM 1 FOR 6);

  -- 3. Resolve Raw Materials warehouse
  SELECT id INTO v_raw_warehouse_id FROM warehouses WHERE warehouse_type = 'raw_materials' LIMIT 1;
  IF v_raw_warehouse_id IS NULL THEN
    SELECT id INTO v_raw_warehouse_id FROM warehouses LIMIT 1;
  END IF;

  -- 4. Create mixing_batches record
  INSERT INTO mixing_batches (
    batch_number,
    formula_id,
    tank_id,
    planned_qty_grams,
    remaining_qty_grams,
    status,
    qc_status,
    created_by
  ) VALUES (
    v_batch_num,
    p_formula_id,
    p_tank_id,
    p_planned_qty_grams,
    p_planned_qty_grams,
    'mixing',
    'pending',
    p_created_by
  ) RETURNING id INTO v_batch_id;

  -- 5. Lock and Consume Raw Materials via rpc_consume_fifo
  FOR v_line IN (SELECT * FROM formula_lines WHERE formula_id = p_formula_id) LOOP
    v_line_qty := v_line.qty_grams * v_multiplier;

    v_consume_res := rpc_consume_fifo(
      v_line.item_id,
      v_raw_warehouse_id,
      v_line_qty,
      'production_consume',
      v_batch_id,
      p_created_by
    );

    v_total_batch_cost := v_total_batch_cost + COALESCE((v_consume_res->>'total_cost')::NUMERIC, 0);

    -- Insert into mixing_consumptions
    INSERT INTO mixing_consumptions (
      mixing_batch_id,
      item_id,
      consumption_type,
      qty_grams,
      unit_cost,
      total_cost,
      created_by
    ) VALUES (
      v_batch_id,
      v_line.item_id,
      'standard',
      v_line_qty,
      COALESCE((v_consume_res->>'avg_unit_cost')::NUMERIC, 0),
      COALESCE((v_consume_res->>'total_cost')::NUMERIC, 0),
      p_created_by
    );
  END LOOP;

  -- 6. Update Tank status to 'mixing'
  UPDATE tanks
  SET status = 'mixing',
      current_batch_id = v_batch_id,
      current_qty_grams = p_planned_qty_grams
  WHERE id = p_tank_id;

  -- 7. Post balanced double-entry (Debit WIP 1133 / Credit Raw Materials 1131)
  IF v_total_batch_cost > 0 THEN
    SELECT id INTO v_account_raw FROM accounts WHERE code = '1131';
    SELECT id INTO v_account_wip FROM accounts WHERE code = '1133';

    IF v_account_raw IS NOT NULL AND v_account_wip IS NOT NULL THEN
      v_je_num := 'JV-MIX-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || SUBSTRING(gen_random_uuid()::TEXT FROM 1 FOR 4);
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
        'صرف خامات كيميائية لبدء تشغيلة الخلط ' || v_batch_num,
        ROUND(v_total_batch_cost, 2),
        ROUND(v_total_batch_cost, 2),
        'posted',
        true,
        p_created_by
      ) RETURNING id INTO v_je_id;

      -- Debit WIP 1133
      INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description, note)
      VALUES (v_je_id, v_account_wip, ROUND(v_total_batch_cost, 2), 0.00, 'إثبات تحويل خامات إلى مخزون تحت التشغيل بالتانك', 'إثبات تحويل خامات إلى مخزون تحت التشغيل بالتانك');

      -- Credit Raw Materials 1131
      INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description, note)
      VALUES (v_je_id, v_account_raw, 0.00, ROUND(v_total_batch_cost, 2), 'صرف خامات كيميائية من مستودع المواد الخام', 'صرف خامات كيميائية من مستودع المواد الخام');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', v_batch_id,
    'batch_number', v_batch_num,
    'total_consumed_cost', ROUND(v_total_batch_cost, 2)
  );
END;
$$;

-- C. rpc_record_qc_test: Records QC Gate parameters and controls packaging authorization
CREATE OR REPLACE FUNCTION rpc_record_qc_test(
  p_batch_id UUID,
  p_ph NUMERIC,
  p_viscosity NUMERIC,
  p_odor_ok BOOLEAN,
  p_color_ok BOOLEAN,
  p_status TEXT,
  p_tested_by UUID,
  p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_batch RECORD;
  v_tank_status TEXT;
  v_batch_status TEXT;
BEGIN
  SELECT * INTO v_batch FROM mixing_batches WHERE id = p_batch_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mixing batch % not found', p_batch_id;
  END IF;

  IF p_status = 'passed' THEN
    v_tank_status := 'ready_for_packaging';
    v_batch_status := 'ready_for_packaging';
  ELSIF p_status = 'needs_rework' THEN
    v_tank_status := 'rework';
    v_batch_status := 'rework';
  ELSE
    v_tank_status := 'pending_qc';
    v_batch_status := 'pending_qc';
  END IF;

  -- Update batch
  UPDATE mixing_batches
  SET qc_ph = p_ph,
      qc_viscosity = p_viscosity,
      qc_odor_ok = p_odor_ok,
      qc_color_ok = p_color_ok,
      qc_status = p_status,
      qc_tested_by = p_tested_by,
      qc_tested_at = NOW(),
      qc_notes = p_notes,
      status = v_batch_status,
      updated_at = NOW()
  WHERE id = p_batch_id;

  -- Update tank
  UPDATE tanks
  SET status = v_tank_status
  WHERE id = v_batch.tank_id;

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', p_batch_id,
    'qc_status', p_status,
    'tank_status', v_tank_status
  );
END;
$$;

-- D. rpc_execute_packaging_order: Fills finished goods, consumes packaging, and verifies QC Gate
CREATE OR REPLACE FUNCTION rpc_execute_packaging_order(
  p_batch_id UUID,
  p_spec_id UUID,
  p_units_produced INTEGER,
  p_wasted_bottles INTEGER,
  p_wasted_stickers INTEGER,
  p_wasted_cartons INTEGER,
  p_created_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_batch RECORD;
  v_spec RECORD;
  v_tank RECORD;
  v_bulk_consumed_grams NUMERIC;
  v_cartons_produced INTEGER;
  v_order_num TEXT;
  v_order_id UUID;
  v_pkg_warehouse_id UUID;
  v_fg_warehouse_id UUID;
  v_total_pkg_cost NUMERIC := 0.00;
  v_consume_res JSONB;
  v_unit_fg_cost NUMERIC := 0.00;
  v_fg_layer_id UUID;
BEGIN
  IF p_units_produced <= 0 THEN
    RAISE EXCEPTION 'Units produced must be greater than zero';
  END IF;

  -- 1. Check Batch and Strict QC Gate!
  SELECT * INTO v_batch FROM mixing_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mixing batch % not found', p_batch_id;
  END IF;

  IF v_batch.qc_status != 'passed' THEN
    RAISE EXCEPTION 'Strict Quality Gate Violation: Batch % has QC status "%". Packaging is prohibited until QC status is "passed".', v_batch.batch_number, v_batch.qc_status;
  END IF;

  -- 2. Fetch Packaging Spec
  SELECT * INTO v_spec FROM packaging_specs WHERE id = p_spec_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Packaging spec % not found', p_spec_id;
  END IF;

  v_bulk_consumed_grams := p_units_produced * v_spec.volume_per_unit_grams;
  v_cartons_produced := FLOOR(p_units_produced / v_spec.pieces_per_carton);

  IF v_batch.remaining_qty_grams < v_bulk_consumed_grams THEN
    RAISE EXCEPTION 'Insufficient bulk in tank. Requested: %g, Remaining: %g', v_bulk_consumed_grams, v_batch.remaining_qty_grams;
  END IF;

  -- Resolve warehouses
  SELECT id INTO v_pkg_warehouse_id FROM warehouses WHERE warehouse_type = 'packaging' LIMIT 1;
  SELECT id INTO v_fg_warehouse_id FROM warehouses WHERE warehouse_type = 'finished_goods' LIMIT 1;

  -- 3. Consume Bottles + Caps (p_units_produced + p_wasted_bottles)
  IF v_spec.bottle_item_id IS NOT NULL THEN
    v_consume_res := rpc_consume_fifo(
      v_spec.bottle_item_id,
      v_pkg_warehouse_id,
      (p_units_produced + p_wasted_bottles),
      'production_consume',
      p_batch_id,
      p_created_by
    );
    v_total_pkg_cost := v_total_pkg_cost + COALESCE((v_consume_res->>'total_cost')::NUMERIC, 0);
  END IF;

  -- 4. Consume Front Stickers
  IF v_spec.front_sticker_item_id IS NOT NULL THEN
    v_consume_res := rpc_consume_fifo(
      v_spec.front_sticker_item_id,
      v_pkg_warehouse_id,
      (p_units_produced + p_wasted_stickers),
      'production_consume',
      p_batch_id,
      p_created_by
    );
    v_total_pkg_cost := v_total_pkg_cost + COALESCE((v_consume_res->>'total_cost')::NUMERIC, 0);
  END IF;

  -- 5. Consume Cartons
  IF v_spec.carton_item_id IS NOT NULL AND v_cartons_produced > 0 THEN
    v_consume_res := rpc_consume_fifo(
      v_spec.carton_item_id,
      v_pkg_warehouse_id,
      (v_cartons_produced + p_wasted_cartons),
      'production_consume',
      p_batch_id,
      p_created_by
    );
    v_total_pkg_cost := v_total_pkg_cost + COALESCE((v_consume_res->>'total_cost')::NUMERIC, 0);
  END IF;

  -- 6. Insert Packaging Order
  v_order_num := 'PKG-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || SUBSTRING(gen_random_uuid()::TEXT FROM 1 FOR 6);
  v_unit_fg_cost := v_total_pkg_cost / p_units_produced;

  INSERT INTO packaging_orders (
    order_number,
    mixing_batch_id,
    packaging_spec_id,
    target_fg_item_id,
    units_produced,
    cartons_produced,
    bulk_consumed_grams,
    wasted_bottles,
    wasted_stickers,
    wasted_cartons,
    total_cost,
    unit_cost,
    target_warehouse_id,
    created_by
  ) VALUES (
    v_order_num,
    p_batch_id,
    p_spec_id,
    v_spec.finished_good_id,
    p_units_produced,
    v_cartons_produced,
    v_bulk_consumed_grams,
    p_wasted_bottles,
    p_wasted_stickers,
    p_wasted_cartons,
    v_total_pkg_cost,
    v_unit_fg_cost,
    v_fg_warehouse_id,
    p_created_by
  ) RETURNING id INTO v_order_id;

  -- 7. Add Finished Goods into FIFO Layer
  INSERT INTO fifo_layers (
    item_id,
    warehouse_id,
    batch_number,
    layer_date,
    initial_qty,
    remaining_qty,
    unit_cost_ex_vat
  ) VALUES (
    v_spec.finished_good_id,
    v_fg_warehouse_id,
    v_batch.batch_number,
    NOW(),
    p_units_produced,
    p_units_produced,
    v_unit_fg_cost
  ) RETURNING id INTO v_fg_layer_id;

  -- Update Finished Good current_stock
  UPDATE items
  SET current_stock = current_stock + p_units_produced,
      updated_at = NOW()
  WHERE id = v_spec.finished_good_id;

  -- 8. Deduct bulk from batch and tank
  UPDATE mixing_batches
  SET remaining_qty_grams = remaining_qty_grams - v_bulk_consumed_grams,
      status = 'in_packaging',
      updated_at = NOW()
  WHERE id = p_batch_id;

  UPDATE tanks
  SET current_qty_grams = current_qty_grams - v_bulk_consumed_grams
  WHERE id = v_batch.tank_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_num,
    'units_produced', p_units_produced,
    'cartons_produced', v_cartons_produced,
    'remaining_bulk_in_tank', (v_batch.remaining_qty_grams - v_bulk_consumed_grams)
  );
END;
$$;

-- E. rpc_close_tank_with_actual_yield: Calculates yield loss, posts to 6105, and frees tank to 'empty'
CREATE OR REPLACE FUNCTION rpc_close_tank_with_actual_yield(
  p_batch_id UUID,
  p_actual_yield_grams NUMERIC,
  p_closed_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_batch RECORD;
  v_tank RECORD;
  v_loss_grams NUMERIC;
  v_unit_bulk_cost NUMERIC := 0.001; -- default per gram
  v_loss_cost NUMERIC := 0.00;
  v_je_id UUID;
  v_je_num TEXT;
  v_account_scrap UUID;
  v_account_wip UUID;
BEGIN
  SELECT * INTO v_batch FROM mixing_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mixing batch % not found', p_batch_id;
  END IF;

  SELECT * INTO v_tank FROM tanks WHERE id = v_batch.tank_id FOR UPDATE;

  -- Calculate variance (Yield Variance)
  -- If actual yield < remaining qty in tank, the remainder is tank wash / scrap loss
  v_loss_grams := GREATEST(0, v_batch.remaining_qty_grams - p_actual_yield_grams);
  v_loss_cost := ROUND((v_loss_grams * v_unit_bulk_cost)::NUMERIC, 2);

  -- Post variance to Spoilage & Scrap (Account 6105)
  IF v_loss_cost > 0 THEN
    SELECT id INTO v_account_scrap FROM accounts WHERE code = '6105'; -- Scrap & Spoilage Expense
    SELECT id INTO v_account_wip FROM accounts WHERE code = '1133';   -- WIP Inventory Bulk Tanks

    IF v_account_scrap IS NOT NULL AND v_account_wip IS NOT NULL THEN
      v_je_num := 'JV-SCRAP-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || SUBSTRING(gen_random_uuid()::TEXT FROM 1 FOR 4);
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
        'إثبات فاقد تانك الخلط وهالك التعبئة للتشغيلة ' || v_batch.batch_number,
        v_loss_cost,
        v_loss_cost,
        'posted',
        true,
        p_closed_by
      ) RETURNING id INTO v_je_id;

      -- Debit 6105 (Scrap & Spoilage Expense)
      INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description, note)
      VALUES (v_je_id, v_account_scrap, v_loss_cost, 0.00, 'مصروف فاقد التانك والهالك للتشغيلة', 'مصروف فاقد التانك والهالك للتشغيلة');

      -- Credit 1133 (WIP Bulk Tanks)
      INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description, note)
      VALUES (v_je_id, v_account_wip, 0.00, v_loss_cost, 'تخفيض المخزون تحت التشغيل بقيمة فاقد التانك', 'تخفيض المخزون تحت التشغيل بقيمة فاقد التانك');
    END IF;
  END IF;

  -- Close Batch
  UPDATE mixing_batches
  SET actual_yield_grams = p_actual_yield_grams,
      yield_variance_grams = -v_loss_grams,
      variance_cost = v_loss_cost,
      journal_entry_id = v_je_id,
      remaining_qty_grams = 0,
      status = 'closed',
      closed_by = p_closed_by,
      closed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_batch_id;

  -- Reset Tank to 'empty'
  UPDATE tanks
  SET status = 'empty',
      current_batch_id = NULL,
      current_qty_grams = 0
  WHERE id = v_batch.tank_id;

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', p_batch_id,
    'tank_id', v_batch.tank_id,
    'loss_grams', v_loss_grams,
    'loss_cost', v_loss_cost,
    'tank_status', 'empty'
  );
END;
$$;

-- ============================================================================
-- 9. Row Level Security Policies
-- ============================================================================

ALTER TABLE formulas ENABLE ROW LEVEL SECURITY;
ALTER TABLE formula_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE packaging_specs ENABLE ROW LEVEL SECURITY;
ALTER TABLE mixing_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE mixing_consumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE packaging_orders ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "formulas_read" ON formulas;
  CREATE POLICY "formulas_read" ON formulas FOR SELECT TO authenticated USING (true);
  DROP POLICY IF EXISTS "formulas_write" ON formulas;
  CREATE POLICY "formulas_write" ON formulas FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM users_profile WHERE id = auth.uid() AND role IN ('owner', 'production'))
  );

  DROP POLICY IF EXISTS "formula_lines_all" ON formula_lines;
  CREATE POLICY "formula_lines_all" ON formula_lines FOR ALL TO authenticated USING (true);

  DROP POLICY IF EXISTS "pkg_specs_all" ON packaging_specs;
  CREATE POLICY "pkg_specs_all" ON packaging_specs FOR ALL TO authenticated USING (true);

  DROP POLICY IF EXISTS "mixing_batches_all" ON mixing_batches;
  CREATE POLICY "mixing_batches_all" ON mixing_batches FOR ALL TO authenticated USING (true);

  DROP POLICY IF EXISTS "mixing_consumptions_all" ON mixing_consumptions;
  CREATE POLICY "mixing_consumptions_all" ON mixing_consumptions FOR ALL TO authenticated USING (true);

  DROP POLICY IF EXISTS "pkg_orders_all" ON packaging_orders;
  CREATE POLICY "pkg_orders_all" ON packaging_orders FOR ALL TO authenticated USING (true);
END $$;
