import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { loginWithPhone } from "@/lib/auth";
import type { UserProfile, UserRole } from "@/types/database";

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  role: UserRole | null;
  isOwner: boolean;
  isAccountant: boolean;
  isLoading: boolean;
  error: string | null;
  login: (phone: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async (userId: string): Promise<UserProfile | null> => {
    try {
      const { data, error: profileErr } = await supabase
        .from("users_profile")
        .select("*")
        .eq("id", userId)
        .single();

      if (profileErr || !data) {
        console.error("Error fetching user profile:", profileErr);
        return null;
      }

      // Check active state
      if (!data.is_active || data.deleted_at !== null) {
        await supabase.auth.signOut();
        setError("تم تعطيل هذا الحساب أو حذفه من قبل الإدارة / This account is inactive or deleted");
        setUser(null);
        setProfile(null);
        return null;
      }

      return data as UserProfile;
    } catch (err) {
      console.error("Profile fetch exception:", err);
      return null;
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const p = await fetchProfile(user.id);
    setProfile(p);
  }, [user, fetchProfile]);

  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user && isMounted) {
          const userProfile = await fetchProfile(session.user.id);
          if (userProfile && isMounted) {
            setUser(session.user);
            setProfile(userProfile);
          }
        }
      } catch (err) {
        console.error("Auth init error:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    initAuth();

    // Listen to Supabase auth events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: any, session: any) => {
        if (event === "SIGNED_OUT" || !session) {
          setUser(null);
          setProfile(null);
          setIsLoading(false);
        } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          setUser(session.user);
          const p = await fetchProfile(session.user.id);
          setProfile(p);
          setIsLoading(false);
        }
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  // Real-time listener for current user's profile status
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`profile-watch-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "users_profile",
          filter: `id=eq.${user.id}`,
        },
        async (payload: { new: UserProfile }) => {
          const updated = payload.new;
          if (!updated.is_active || updated.deleted_at !== null) {
            await logout();
            setError("تم تعطيل حسابك فورياً أو تسجيل خروجك من قبل المدير / Your account was disabled by administrator");
          } else {
            setProfile(updated);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const login = async (phone: string, pass: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const { user: authUser, profile: userProfile } = await loginWithPhone(phone, pass);
      setUser(authUser as User);
      setProfile(userProfile);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "خطأ غير متوقع في الدخول";
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      setUser(null);
      setProfile(null);
      setError(null);
    }
  };

  const isOwner = profile?.role === "owner";
  const isAccountant = profile?.role === "accountant";

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        role: profile?.role || null,
        isOwner,
        isAccountant,
        isLoading,
        error,
        login,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
