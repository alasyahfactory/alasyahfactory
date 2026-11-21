// Deno runtime for Supabase Edge Functions
// Follows SPEC.md (v3.1) - Secure User Management Edge Function
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestPayload {
  action: "create_user" | "reset_password" | "force_logout_and_disable" | "delete_user";
  target_user_id?: string;
  phone?: string;
  password?: string;
  full_name?: string;
  role?: "owner" | "accountant" | "production" | "warehouse" | "sales_rep";
  can_view_formulas?: boolean;
  can_view_costs?: boolean;
  can_approve_on_behalf?: boolean;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Missing Supabase server-side environment variables" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Verify caller via Authorization header JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: { user: callerUser }, error: userAuthError } = await supabaseAdmin.auth.getUser(token);
    if (userAuthError || !callerUser) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired caller session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Check if caller is active owner in users_profile
    const { data: callerProfile, error: profileError } = await supabaseAdmin
      .from("users_profile")
      .select("id, role, is_active, deleted_at, full_name")
      .eq("id", callerUser.id)
      .single();

    if (
      profileError ||
      !callerProfile ||
      callerProfile.role !== "owner" ||
      !callerProfile.is_active ||
      callerProfile.deleted_at !== null
    ) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Caller is not an authorized active owner" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload: RequestPayload = await req.json();
    const { action } = payload;

    if (!action) {
      return new Response(
        JSON.stringify({ error: "Action is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle Actions
    if (action === "create_user") {
      const {
        phone,
        password,
        full_name,
        role = "production",
        can_view_formulas = false,
        can_view_costs = false,
        can_approve_on_behalf = false,
      } = payload;

      if (!phone || !password || !full_name) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: phone, password, full_name" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Standardize phone
      const cleanPhone = phone.replace(/[^0-9]/g, "");
      let normalizedPhone = cleanPhone;
      if (cleanPhone.startsWith("05")) {
        normalizedPhone = "966" + cleanPhone.substring(1);
      } else if (cleanPhone.startsWith("5") && cleanPhone.length === 9) {
        normalizedPhone = "966" + cleanPhone;
      }

      const syntheticEmail = `${normalizedPhone}@factory.local`;

      // 1. Create auth user
      const { data: newAuthData, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
        email: syntheticEmail,
        password: password,
        email_confirm: true,
        user_metadata: {
          full_name,
          phone: normalizedPhone,
          role,
        },
      });

      if (createAuthError || !newAuthData.user) {
        return new Response(
          JSON.stringify({ error: createAuthError?.message || "Failed to create Auth user" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const newUserId = newAuthData.user.id;

      // 2. Insert users_profile
      const { data: newProfile, error: insertProfileError } = await supabaseAdmin
        .from("users_profile")
        .insert({
          id: newUserId,
          full_name,
          phone: normalizedPhone,
          role,
          can_view_formulas,
          can_view_costs,
          can_approve_on_behalf,
          is_active: true,
          deleted_at: null,
        })
        .select()
        .single();

      if (insertProfileError) {
        // Rollback auth user
        await supabaseAdmin.auth.admin.deleteUser(newUserId);
        return new Response(
          JSON.stringify({ error: insertProfileError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 3. Write to audit_logs
      await supabaseAdmin.from("audit_logs").insert({
        user_id: callerUser.id,
        action: "USER_CREATED",
        table_name: "users_profile",
        record_id: newUserId,
        new_values: newProfile,
        details: `Created new staff ${full_name} (${role}) with phone ${normalizedPhone}`,
      });

      return new Response(
        JSON.stringify({ success: true, user: newProfile }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "reset_password") {
      const { target_user_id, password } = payload;
      if (!target_user_id || !password) {
        return new Response(
          JSON.stringify({ error: "Missing target_user_id or password" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: resetError } = await supabaseAdmin.auth.admin.updateUserById(target_user_id, {
        password: password,
      });

      if (resetError) {
        return new Response(
          JSON.stringify({ error: resetError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Also force sign out from old sessions
      await supabaseAdmin.auth.admin.signOut(target_user_id, "global");

      await supabaseAdmin.from("audit_logs").insert({
        user_id: callerUser.id,
        action: "PASSWORD_RESET",
        table_name: "users_profile",
        record_id: target_user_id,
        details: `Owner reset password and invalidated existing sessions for user ${target_user_id}`,
      });

      return new Response(
        JSON.stringify({ success: true, message: "Password updated successfully" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "force_logout_and_disable") {
      const { target_user_id } = payload;
      if (!target_user_id) {
        return new Response(
          JSON.stringify({ error: "Missing target_user_id" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Prevent disabling self
      if (target_user_id === callerUser.id) {
        return new Response(
          JSON.stringify({ error: "Owner cannot disable their own account" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 1. Deactivate profile
      const { error: updateError } = await supabaseAdmin
        .from("users_profile")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", target_user_id);

      if (updateError) {
        return new Response(
          JSON.stringify({ error: updateError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 2. Global Sign-out via Auth Admin
      await supabaseAdmin.auth.admin.signOut(target_user_id, "global");

      // 3. Write audit log
      await supabaseAdmin.from("audit_logs").insert({
        user_id: callerUser.id,
        action: "FORCE_LOGOUT_AND_DISABLE",
        table_name: "users_profile",
        record_id: target_user_id,
        details: `Owner disabled user and forced global sign-out for user ${target_user_id}`,
      });

      return new Response(
        JSON.stringify({ success: true, message: "User disabled and globally signed out" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "delete_user") {
      const { target_user_id } = payload;
      if (!target_user_id) {
        return new Response(
          JSON.stringify({ error: "Missing target_user_id" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (target_user_id === callerUser.id) {
        return new Response(
          JSON.stringify({ error: "Owner cannot delete their own account" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Call smart delete RPC
      const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc("rpc_soft_delete_or_purge_user", {
        target_user_id,
        performing_user_id: callerUser.id,
      });

      if (rpcError) {
        return new Response(
          JSON.stringify({ error: rpcError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Always revoke auth session
      await supabaseAdmin.auth.admin.signOut(target_user_id, "global");

      // If hard deleted from profile, also delete from auth
      if (rpcResult?.status === "hard_deleted") {
        await supabaseAdmin.auth.admin.deleteUser(target_user_id);
      } else {
        // Ban login for soft-deleted user (ban duration: 100 years)
        await supabaseAdmin.auth.admin.updateUserById(target_user_id, {
          ban_duration: "876000h",
        });
      }

      return new Response(
        JSON.stringify({ success: true, result: rpcResult }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    return new Response(
      JSON.stringify({ error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
