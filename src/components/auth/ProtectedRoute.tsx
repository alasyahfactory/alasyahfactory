import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { canAccessRoute, getDefaultRouteForRole } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import type { UserRole } from "@/types/database";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, profile, role, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-industrial-bg p-6">
        <div className="w-full max-w-md space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    );
  }

  // Not logged in -> go to /login
  if (!user || !profile || !role) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check specific allowedRoles if passed
  if (allowedRoles && !allowedRoles.includes(role)) {
    const defaultRoute = getDefaultRouteForRole(role);
    return <Navigate to={defaultRoute} replace />;
  }

  // Check general route lockdown
  if (!canAccessRoute(role, location.pathname)) {
    const defaultRoute = getDefaultRouteForRole(role);
    return <Navigate to={defaultRoute} replace />;
  }

  return <>{children}</>;
}
