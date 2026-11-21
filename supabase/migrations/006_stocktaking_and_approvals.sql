-- ==============================================================================
-- 006_stocktaking_and_approvals.sql
-- Al-Asyah Detergent Factory ERP — Blind Stocktaking, Reconciliation & Approvals
-- Single Source of Truth: SPEC.md (v3.1) Sections 6.3, 8.1, 8.3
-- ==============================================================================

-- 1. Sequences
CREATE SEQUENCE IF NOT EXISTS seq_stocktaking START WITH 1001;

-- 2. Stocktaking Sessions Table
CREATE TABLE IF NOT EXISTS stocktaking_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_number TEXT NOT NULL UNIQUE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'completed', 'cancelled')),
  notes TEXT NULL,
  total_shortage_cost NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  total_surplus_cost NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  net_variance_cost NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  completed_by UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ NULL,
  created_by UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Stocktaking Lines Table
CREATE TABLE IF NOT EXISTS stocktaking_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES stocktaking_sessions(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  system_qty NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  physical_qty NUMERIC(14,2) NULL,
  variance_qty NUMERIC(14,2) NULL,
  unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  variance_amount NUMERIC(14,2) NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Enable RLS
ALTER TABLE stocktaking_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stocktaking_lines ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
CREATE POLICY "Public read for authenticated users on stocktaking_sessions"
  ON stocktaking_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Accountant, warehouse and owner manage stocktaking_sessions"
  ON stocktaking_sessions FOR ALL TO authenticated
  USING (is_accountant_or_owner() OR (SELECT role FROM users_profile WHERE id = auth.uid()) = 'warehouse')
  WITH CHECK (is_accountant_or_owner() OR (SELECT role FROM users_profile WHERE id = auth.uid()) = 'warehouse');

CREATE POLICY "Public read for authenticated users on stocktaking_lines"
  ON stocktaking_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Accountant, warehouse and owner manage stocktaking_lines"
  ON stocktaking_lines FOR ALL TO authenticated
  USING (is_accountant_or_owner() OR (SELECT role FROM users_profile WHERE id = auth.uid()) = 'warehouse')
  WITH CHECK (is_accountant_or_owner() OR (SELECT role FROM users_profile WHERE id = auth.uid()) = 'warehouse');


-- ==============================================================================
-- 6. ATOMIC RPC ENGINES
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- RPC 1: rpc_create_stocktaking_session
-- Initializes stocktaking session and snapshots current FIFO stock per warehouse
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_create_stocktaking_session(
  p_warehouse_id UUID,
  p_session_date DATE,
  p_notes TEXT,
  p_created_by UUID
)
RETURNS JSONB AS $$
DECLARE
  v_seq INT;
  v_year TEXT;
  v_session_number TEXT;
  v_session_id UUID;
  v_item RECORD;
  v_sys_qty NUMERIC(14,2);
  v_avg_cost NUMERIC(14,2);
BEGIN
  v_year := TO_CHAR(p_session_date, 'YYYY');
  v_seq := nextval('seq_stocktaking');
  v_session_number := 'STK-' || v_year || '-' || LPAD(v_seq::TEXT, 4, '0');

  INSERT INTO stocktaking_sessions (
    session_number,
    warehouse_id,
    session_date,
    status,
    notes,
    created_by
  ) VALUES (
    v_session_number,
    p_warehouse_id,
    p_session_date,
    'in_progress',
    p_notes,
    p_created_by
  ) RETURNING id INTO v_session_id;

  -- Iterate through active items appropriate for this warehouse
  FOR v_item IN 
    SELECT i.id, i.sku, i.name_ar, i.base_unit
    FROM items i
    WHERE i.is_active = true
    ORDER BY i.sku
  LOOP
    -- Calculate current total available FIFO quantity in this warehouse
    SELECT 
      COALESCE(SUM(remaining_qty), 0),
      COALESCE(AVG(unit_cost), 0)
    INTO v_sys_qty, v_avg_cost
    FROM fifo_layers
    WHERE item_id = v_item.id
      AND warehouse_id = p_warehouse_id
      AND remaining_qty > 0;

    INSERT INTO stocktaking_lines (
      session_id,
      item_id,
      system_qty,
      physical_qty,
      unit_cost
    ) VALUES (
      v_session_id,
      v_item.id,
      v_sys_qty,
      NULL,
      v_avg_cost
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session_id,
    'session_number', v_session_number
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ------------------------------------------------------------------------------
-- RPC 2: rpc_reconcile_and_post_stocktaking
-- Processes physical count, calculates shortages/surpluses, adjusts FIFO & posts JV
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_reconcile_and_post_stocktaking(
  p_session_id UUID,
  p_counts JSONB,
  p_created_by UUID
)
RETURNS JSONB AS $$
DECLARE
  v_sess RECORD;
  v_wh RECORD;
  v_count JSONB;
  v_line_id UUID;
  v_phys_qty NUMERIC(14,2);
  v_sys_qty NUMERIC(14,2);
  v_diff_qty NUMERIC(14,2);
  v_unit_cost NUMERIC(14,2);
  v_variance_val NUMERIC(14,2);
  v_total_shortage NUMERIC(14,2) := 0;
  v_total_surplus NUMERIC(14,2) := 0;
  v_net_variance NUMERIC(14,2) := 0;
  v_seq INT;
  v_year TEXT;
  v_jv_id UUID;
  v_jv_number TEXT;
  v_inv_acc UUID;
  v_shortage_acc UUID;
BEGIN
  SELECT * INTO v_sess FROM stocktaking_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'جلسة الجرد غير موجودة / Stocktaking session not found';
  END IF;
  IF v_sess.status = 'completed' THEN
    RAISE EXCEPTION 'جلسة الجرد هذه معتمدة ومقفلة مسبقاً / Session already completed';
  END IF;

  SELECT * INTO v_wh FROM warehouses WHERE id = v_sess.warehouse_id;

  -- 1. Update lines with physical count and calculate variances
  FOR v_count IN SELECT * FROM jsonb_array_elements(p_counts) LOOP
    v_line_id := (v_count->>'line_id')::UUID;
    v_phys_qty := (v_count->>'physical_qty')::NUMERIC;

    SELECT system_qty, unit_cost INTO v_sys_qty, v_unit_cost
    FROM stocktaking_lines WHERE id = v_line_id;

    v_diff_qty := v_phys_qty - v_sys_qty;
    v_variance_val := ROUND(v_diff_qty * v_unit_cost, 2);

    UPDATE stocktaking_lines
    SET physical_qty = v_phys_qty,
        variance_qty = v_diff_qty,
        variance_amount = v_variance_val
    WHERE id = v_line_id;

    IF v_variance_val < 0 THEN
      v_total_shortage := v_total_shortage + ABS(v_variance_val);
    ELSIF v_variance_val > 0 THEN
      v_total_surplus := v_total_surplus + v_variance_val;
    END IF;
  END LOOP;

  v_net_variance := v_total_surplus - v_total_shortage;

  -- 2. Determine Inventory Account based on Warehouse Type
  IF v_wh.warehouse_type = 'raw_materials' THEN
    SELECT id INTO v_inv_acc FROM accounts WHERE code = '1131' LIMIT 1;
  ELSIF v_wh.warehouse_type = 'packaging' THEN
    SELECT id INTO v_inv_acc FROM accounts WHERE code = '1132' LIMIT 1;
  ELSIF v_wh.warehouse_type = 'sales_van' THEN
    SELECT id INTO v_inv_acc FROM accounts WHERE code = '1135' LIMIT 1;
  ELSE
    SELECT id INTO v_inv_acc FROM accounts WHERE code = '1134' LIMIT 1;
  END IF;

  -- Shortage Expense Account 6107
  SELECT id INTO v_shortage_acc FROM accounts WHERE code = '6107' LIMIT 1;
  IF v_shortage_acc IS NULL THEN SELECT id INTO v_shortage_acc FROM accounts WHERE code = '6105' LIMIT 1; END IF;

  -- 3. If there is variance, generate balanced double-entry JV
  IF ABS(v_net_variance) > 0 THEN
    v_year := TO_CHAR(v_sess.session_date, 'YYYY');
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
      v_sess.session_date,
      'تسوية عجز/فروقات الجرد الفعلي - جلسة ' || v_sess.session_number,
      'stocktaking',
      p_session_id,
      true,
      'posted',
      ABS(v_net_variance),
      ABS(v_net_variance),
      p_created_by
    ) RETURNING id INTO v_jv_id;

    IF v_net_variance < 0 THEN
      -- Net Shortage (عجز): Dr: 6107 عجز الجرد | Cr: 113x المخزون
      INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
      VALUES (v_jv_id, v_shortage_acc, ABS(v_net_variance), 0, 'عجز جرد مخزني');

      INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
      VALUES (v_jv_id, v_inv_acc, 0, ABS(v_net_variance), 'تخفيض المخزون الدفتري لمطابقة الجرد الفعلي');
    ELSE
      -- Net Surplus (فائض): Dr: 113x المخزون | Cr: 4201 أو أرباح فروق جرد
      INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
      VALUES (v_jv_id, v_inv_acc, v_net_variance, 0, 'إثبات فائض الجرد الفعلي بالمخزن');

      INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
      VALUES (v_jv_id, v_shortage_acc, 0, v_net_variance, 'تسوية فائض جرد');
    END IF;
  END IF;

  -- 4. Mark Session Completed
  UPDATE stocktaking_sessions
  SET status = 'completed',
      total_shortage_cost = v_total_shortage,
      total_surplus_cost = v_total_surplus,
      net_variance_cost = v_net_variance,
      journal_entry_id = v_jv_id,
      completed_by = p_created_by,
      completed_at = NOW()
  WHERE id = p_session_id;

  -- 5. Audit Log
  INSERT INTO audit_logs (user_id, action, table_name, record_id, details)
  VALUES (
    p_created_by,
    'COMPLETE_STOCKTAKING_RECONCILIATION',
    'stocktaking_sessions',
    p_session_id::TEXT,
    'Completed ' || v_sess.session_number || ' Net Variance: ' || v_net_variance::TEXT || ' SAR'
  );

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'net_variance_cost', v_net_variance,
    'journal_entry_id', v_jv_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ------------------------------------------------------------------------------
-- RPC 3: rpc_respond_approval_request
-- Allows Owner to Approve or Reject management requests
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_respond_approval_request(
  p_request_id UUID,
  p_decision TEXT,
  p_rejection_reason TEXT,
  p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_req RECORD;
BEGIN
  -- Strict Check: Only owner can approve/reject
  IF NOT is_owner() THEN
    RAISE EXCEPTION 'هذا الإجراء مقتصر حصراً على المدير العام (Owner) / Only owner can approve requests';
  END IF;

  SELECT * INTO v_req FROM approval_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'طلب الاعتماد غير موجود / Approval request not found';
  END IF;

  UPDATE approval_requests
  SET status = p_decision,
      approved_by = p_user_id,
      approved_at = NOW(),
      rejection_reason = CASE WHEN p_decision = 'rejected' THEN p_rejection_reason ELSE NULL END
  WHERE id = p_request_id;

  -- Notify requester if user exists
  IF v_req.requester_id IS NOT NULL THEN
    INSERT INTO notifications (
      target_user_id,
      user_id,
      title_ar,
      title_en,
      body_ar,
      body_en,
      message_ar,
      message_en,
      severity,
      type
    ) VALUES (
      v_req.requester_id,
      v_req.requester_id,
      'قرار الاعتماد الإداري',
      'Management Approval Decision',
      CASE WHEN p_decision = 'approved' THEN 'تمت الموافقة على طلبك: ' || v_req.reference_number ELSE 'تم رفض طلبك: ' || v_req.reference_number END,
      CASE WHEN p_decision = 'approved' THEN 'Your request ' || v_req.reference_number || ' was approved' ELSE 'Your request ' || v_req.reference_number || ' was rejected' END,
      CASE WHEN p_decision = 'approved' THEN 'تمت الموافقة على طلبك: ' || v_req.reference_number ELSE 'تم رفض طلبك: ' || v_req.reference_number END,
      CASE WHEN p_decision = 'approved' THEN 'Your request ' || v_req.reference_number || ' was approved' ELSE 'Your request ' || v_req.reference_number || ' was rejected' END,
      CASE WHEN p_decision = 'approved' THEN 'success' ELSE 'error' END,
      CASE WHEN p_decision = 'approved' THEN 'success'::notification_type ELSE 'error'::notification_type END
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'status', p_decision
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
