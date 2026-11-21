-- ==============================================================================
-- 007_seed_tanks_and_operations.sql
-- Al-Asyah Detergent Factory ERP — Tanks, Formulas & Operational Seed Data
-- Single Source of Truth: SPEC.md (v3.1) Sections 5, 6, 8
-- ==============================================================================

-- 1. Seed 5 Mixing Tanks
INSERT INTO tanks (tank_code, name_ar, name_en, capacity_liters, status, current_qty_grams, is_active)
VALUES
  ('TANK-01', 'تانك خلط صابون اليدين رقم 1', 'Hand Soap Mixing Tank 1', 5000, 'ready_for_packaging', 5000000, true),
  ('TANK-02', 'تانك خلط سائل الصحون رقم 2', 'Dishwashing Mixing Tank 2', 10000, 'mixing', 10000000, true),
  ('TANK-03', 'تانك خلط الكلور المبيض رقم 3', 'Chlorine Bleach Tank 3', 8000, 'pending_qc', 8000000, true),
  ('TANK-04', 'تانك خلط مطهر ومعقم الأرضيات رقم 4', 'Floor Disinfectant Tank 4', 6000, 'empty', 0, true),
  ('TANK-05', 'تانك خلط جل الغسيل والمنظفات الثقيلة رقم 5', 'Heavy Duty Gel Tank 5', 12000, 'empty', 0, true)
ON CONFLICT (tank_code) DO UPDATE SET
  name_ar = EXCLUDED.name_ar,
  name_en = EXCLUDED.name_en,
  capacity_liters = EXCLUDED.capacity_liters,
  status = EXCLUDED.status;

-- 2. Seed Sales Van Warehouse
INSERT INTO warehouses (code, name_ar, name_en, type, warehouse_type, vehicle_id, is_active)
SELECT 
  'VAN-01', 
  'مستودع سيارة التوزيع رقم 1', 
  'Sales Van Warehouse 1', 
  'sales_van'::warehouse_type, 
  'sales_van'::warehouse_type, 
  id, 
  true
FROM vehicles 
WHERE plate_number = 'أ ب ج 1234'
ON CONFLICT (code) DO NOTHING;

-- 3. Seed Additional Detergent Formulas (BOM)
INSERT INTO formulas (code, name_ar, name_en, density, batch_size_grams, target_ph_min, target_ph_max, target_viscosity_min, target_viscosity_max, instructions, is_active)
VALUES
  ('FORM-02', 'سائل غسيل الصحون عالي الرغوة والتركيز', 'High Foam Dishwashing Liquid Formula', 1.03, 10000000, 6.8, 7.5, 3000, 3500, 'إضافة الماء مع سلفونيك وتقليب بطيء ثم المعادلة بالصودا الكاوية وتليين التكسابون مع الملح والعطر واللون.', true),
  ('FORM-03', 'كلور التبييض والتعقيم المركز (هيبوكلوريت الصوديوم)', 'Concentrated Chlorine Bleach Formula', 1.08, 8000000, 11.0, 12.0, 40, 60, 'خلط الماء مع هيبوكلوريت الصوديوم بنسبة 12% وضبط القلوية بثنائي الصوديوم في تانك مقاوم للتآكل.', true),
  ('FORM-04', 'مطهر ومعقم الأرضيات الصنوبري المركز', 'Pine Floor Disinfectant Formula', 0.99, 6000000, 6.5, 7.2, 100, 200, 'إذابة زيت الصنوبر النقي مع مستحلب غير أيوني ثم إضافة رابع الأمونيوم المعقم وضبط اللزوجة واللون الأخضر.', true),
  ('FORM-05', 'جل الغسيل الأوتوماتيكي للملابس والأقمشة', 'Automatic Laundry Gel Detergent', 1.05, 12000000, 8.0, 9.0, 4000, 5000, 'إذابة الإنزيمات والمشتتات الضوئية وتثبيت الرغوة في درجات حرارة محكومة لضمان استقرار الجل.', true)
ON CONFLICT (code) DO NOTHING;

-- 4. Seed a Sample Approved Purchase Order for Receiving Testing on /warehouse
DO $$
DECLARE
  v_po_id UUID;
  v_supp_id UUID;
  v_wh_raw_id UUID;
  v_item_sles UUID;
  v_item_labsa UUID;
  v_owner_id UUID;
BEGIN
  SELECT id INTO v_supp_id FROM suppliers LIMIT 1;
  SELECT id INTO v_wh_raw_id FROM warehouses WHERE warehouse_type = 'raw_materials' LIMIT 1;
  SELECT id INTO v_item_sles FROM items WHERE item_type = 'raw_material' LIMIT 1;
  SELECT id INTO v_owner_id FROM users_profile WHERE role = 'owner' LIMIT 1;

  IF v_supp_id IS NOT NULL AND v_wh_raw_id IS NOT NULL AND v_item_sles IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM purchase_orders WHERE po_number = 'PO-2026-001') THEN
      INSERT INTO purchase_orders (
        po_number,
        supplier_id,
        target_warehouse_id,
        order_date,
        expected_delivery_date,
        status,
        subtotal,
        tax_amount,
        total_amount,
        created_by,
        approved_by,
        approved_at,
        notes
      ) VALUES (
        'PO-2026-001',
        v_supp_id,
        v_wh_raw_id,
        CURRENT_DATE,
        CURRENT_DATE + INTERVAL '3 days',
        'approved',
        10000.00,
        1500.00,
        11500.00,
        v_owner_id,
        v_owner_id,
        NOW(),
        'أمر شراء معتمد لخامات المنظفات جاهز للاستلام الميداني بالميزان'
      ) RETURNING id INTO v_po_id;

      INSERT INTO purchase_order_lines (
        purchase_order_id,
        item_id,
        ordered_qty,
        received_qty,
        unit_price_ex_vat,
        vat_rate,
        vat_amount,
        total_ex_vat,
        total_inc_vat
      ) VALUES (
        v_po_id,
        v_item_sles,
        2000000, -- 2,000 KG in grams
        0,
        5.00,
        0.15,
        1500.00,
        10000.00,
        11500.00
      );
    END IF;
  END IF;
END $$;

-- 5. Seed a Sample Approval Request on /approvals
DO $$
DECLARE
  v_owner_id UUID;
BEGIN
  SELECT id INTO v_owner_id FROM users_profile WHERE role = 'owner' LIMIT 1;

  IF NOT EXISTS (SELECT 1 FROM approval_requests WHERE reference_number = 'CUST-OVERRIDE-101') THEN
    INSERT INTO approval_requests (
      request_type,
      reference_number,
      requester_id,
      reason,
      amount,
      status
    ) VALUES (
      'credit_limit_override',
      'CUST-OVERRIDE-101',
      v_owner_id,
      'طلب زيادة استثنائية في السقف الائتماني لمؤسسة التوزيع الكبرى لتغطية موسم رمضان والعيد.',
      25000.00,
      'pending'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM approval_requests WHERE reference_number = 'PO-APPROVAL-902') THEN
    INSERT INTO approval_requests (
      request_type,
      reference_number,
      requester_id,
      reason,
      amount,
      status
    ) VALUES (
      'purchase_order',
      'PO-APPROVAL-902',
      v_owner_id,
      'طلب اعتماد أمر شراء استثنائي لكمية 50 طن مادة التكسابون SLES للاستفادة من خصم الكمية من المورد سابك.',
      180000.00,
      'pending'
    );
  END IF;
END $$;
