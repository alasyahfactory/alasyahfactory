-- ==============================================================================
-- 008_seed_staff_users.sql
-- Seed Standard Roles with Password '123456' for Testing All Modules & Shells
-- ==============================================================================

-- 1. Create Accountant User (0500000002)
DO $$
DECLARE
  v_uid UUID := gen_random_uuid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = '966500000002@factory.local') THEN
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, role, aud, created_at, updated_at
    ) VALUES (
      v_uid, '00000000-0000-0000-0000-000000000000', '966500000002@factory.local',
      crypt('123456', gen_salt('bf')), NOW(),
      '{"provider":"email","providers":["email"]}',
      '{"phone":"0500000002","full_name":"المحاسب المالي","email_verified":true}',
      'authenticated', 'authenticated', NOW(), NOW()
    );

    INSERT INTO users_profile (
      id, phone, full_name, role, can_view_formulas, can_view_costs, can_approve_on_behalf, is_active
    ) VALUES (
      v_uid, '0500000002', 'المحاسب المالي', 'accountant', false, true, false, true
    );
  ELSE
    UPDATE auth.users SET encrypted_password = crypt('123456', gen_salt('bf')) WHERE email = '966500000002@factory.local';
  END IF;
END $$;

-- 2. Create Production Supervisor User (0500000003)
DO $$
DECLARE
  v_uid UUID := gen_random_uuid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = '966500000003@factory.local') THEN
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, role, aud, created_at, updated_at
    ) VALUES (
      v_uid, '00000000-0000-0000-0000-000000000000', '966500000003@factory.local',
      crypt('123456', gen_salt('bf')), NOW(),
      '{"provider":"email","providers":["email"]}',
      '{"phone":"0500000003","full_name":"مشرف الإنتاج والتانكات","email_verified":true}',
      'authenticated', 'authenticated', NOW(), NOW()
    );

    INSERT INTO users_profile (
      id, phone, full_name, role, can_view_formulas, can_view_costs, can_approve_on_behalf, is_active
    ) VALUES (
      v_uid, '0500000003', 'مشرف الإنتاج والتانكات', 'production', true, false, false, true
    );
  ELSE
    UPDATE auth.users SET encrypted_password = crypt('123456', gen_salt('bf')) WHERE email = '966500000003@factory.local';
  END IF;
END $$;

-- 3. Create Warehouse Keeper User (0500000004)
DO $$
DECLARE
  v_uid UUID := gen_random_uuid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = '966500000004@factory.local') THEN
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, role, aud, created_at, updated_at
    ) VALUES (
      v_uid, '00000000-0000-0000-0000-000000000000', '966500000004@factory.local',
      crypt('123456', gen_salt('bf')), NOW(),
      '{"provider":"email","providers":["email"]}',
      '{"phone":"0500000004","full_name":"أمين المستودعات والميزان","email_verified":true}',
      'authenticated', 'authenticated', NOW(), NOW()
    );

    INSERT INTO users_profile (
      id, phone, full_name, role, can_view_formulas, can_view_costs, can_approve_on_behalf, is_active
    ) VALUES (
      v_uid, '0500000004', 'أمين المستودعات والميزان', 'warehouse', false, false, false, true
    );
  ELSE
    UPDATE auth.users SET encrypted_password = crypt('123456', gen_salt('bf')) WHERE email = '966500000004@factory.local';
  END IF;
END $$;

-- 4. Create Sales Rep User (0500000005)
DO $$
DECLARE
  v_uid UUID := gen_random_uuid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = '966500000005@factory.local') THEN
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, role, aud, created_at, updated_at
    ) VALUES (
      v_uid, '00000000-0000-0000-0000-000000000000', '966500000005@factory.local',
      crypt('123456', gen_salt('bf')), NOW(),
      '{"provider":"email","providers":["email"]}',
      '{"phone":"0500000005","full_name":"مندوب التوزيع الميداني","email_verified":true}',
      'authenticated', 'authenticated', NOW(), NOW()
    );

    INSERT INTO users_profile (
      id, phone, full_name, role, can_view_formulas, can_view_costs, can_approve_on_behalf, is_active
    ) VALUES (
      v_uid, '0500000005', 'مندوب التوزيع الميداني', 'sales_rep', false, false, false, true
    );

    -- Assign van to this rep
    UPDATE warehouses SET assigned_rep_id = v_uid WHERE code = 'VAN-01';
    -- Assign customers to this rep
    UPDATE customers SET assigned_rep_id = v_uid;
  ELSE
    UPDATE auth.users SET encrypted_password = crypt('123456', gen_salt('bf')) WHERE email = '966500000005@factory.local';
  END IF;
END $$;
