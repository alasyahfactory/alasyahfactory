import React, { lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { getDefaultRouteForRole } from "@/lib/auth";

// Pages - Eager for login, Lazy for application shell (Code-Splitting performance guide)
import { LoginPage } from "@/pages/auth/LoginPage";

const OwnerDashboard = lazy(() => import("@/pages/dashboard/OwnerDashboard").then(m => ({ default: m.OwnerDashboard })));
const AccountantDashboard = lazy(() => import("@/pages/accounting/AccountantDashboard").then(m => ({ default: m.AccountantDashboard })));
const FactorySettingsPage = lazy(() => import("@/pages/settings/FactorySettingsPage").then(m => ({ default: m.FactorySettingsPage })));
const UsersPage = lazy(() => import("@/pages/settings/UsersPage").then(m => ({ default: m.UsersPage })));
const FacilitiesPage = lazy(() => import("@/pages/settings/FacilitiesPage").then(m => ({ default: m.FacilitiesPage })));
const ChartOfAccountsPage = lazy(() => import("@/pages/accounting/ChartOfAccountsPage").then(m => ({ default: m.ChartOfAccountsPage })));
const FiscalPeriodsPage = lazy(() => import("@/pages/accounting/FiscalPeriodsPage").then(m => ({ default: m.FiscalPeriodsPage })));
const AuditLogPage = lazy(() => import("@/pages/settings/AuditLogPage").then(m => ({ default: m.AuditLogPage })));
const VehiclesPage = lazy(() => import("@/pages/settings/VehiclesPage").then(m => ({ default: m.VehiclesPage })));
const ItemsPage = lazy(() => import("@/pages/inventory/ItemsPage").then(m => ({ default: m.ItemsPage })));
const StocktakingPage = lazy(() => import("@/pages/inventory/StocktakingPage").then(m => ({ default: m.StocktakingPage })));
const OpeningBalancesPage = lazy(() => import("@/pages/inventory/OpeningBalancesPage").then(m => ({ default: m.OpeningBalancesPage })));
const SuppliersPage = lazy(() => import("@/pages/procurement/SuppliersPage").then(m => ({ default: m.SuppliersPage })));
const PurchaseOrdersPage = lazy(() => import("@/pages/procurement/PurchaseOrdersPage").then(m => ({ default: m.PurchaseOrdersPage })));
const PurchaseReceiptsPage = lazy(() => import("@/pages/procurement/PurchaseReceiptsPage").then(m => ({ default: m.PurchaseReceiptsPage })));
const PurchaseReturnsPage = lazy(() => import("@/pages/procurement/PurchaseReturnsPage").then(m => ({ default: m.PurchaseReturnsPage })));
const FormulasPage = lazy(() => import("@/pages/manufacturing/FormulasPage").then(m => ({ default: m.FormulasPage })));
const PackagingSpecsPage = lazy(() => import("@/pages/manufacturing/PackagingSpecsPage").then(m => ({ default: m.PackagingSpecsPage })));
const MixingBatchesPage = lazy(() => import("@/pages/manufacturing/MixingBatchesPage").then(m => ({ default: m.MixingBatchesPage })));
const PackagingOrdersPage = lazy(() => import("@/pages/manufacturing/PackagingOrdersPage").then(m => ({ default: m.PackagingOrdersPage })));
const CustomersPage = lazy(() => import("@/pages/sales/CustomersPage").then(m => ({ default: m.CustomersPage })));
const QuotationsPage = lazy(() => import("@/pages/sales/QuotationsPage").then(m => ({ default: m.QuotationsPage })));
const SalesInvoicesPage = lazy(() => import("@/pages/sales/SalesInvoicesPage").then(m => ({ default: m.SalesInvoicesPage })));
const SalesReturnsPage = lazy(() => import("@/pages/sales/SalesReturnsPage").then(m => ({ default: m.SalesReturnsPage })));
const VanCustodyPage = lazy(() => import("@/pages/sales/VanCustodyPage").then(m => ({ default: m.VanCustodyPage })));
const JournalEntriesPage = lazy(() => import("@/pages/accounting/JournalEntriesPage").then(m => ({ default: m.JournalEntriesPage })));
const VouchersPage = lazy(() => import("@/pages/accounting/VouchersPage").then(m => ({ default: m.VouchersPage })));
const ChecksPage = lazy(() => import("@/pages/accounting/ChecksPage").then(m => ({ default: m.ChecksPage })));
const FinancialReportsPage = lazy(() => import("@/pages/accounting/FinancialReportsPage").then(m => ({ default: m.FinancialReportsPage })));
const YearEndClosingPage = lazy(() => import("@/pages/accounting/YearEndClosingPage").then(m => ({ default: m.YearEndClosingPage })));
const EmployeesPage = lazy(() => import("@/pages/hr/EmployeesPage").then(m => ({ default: m.EmployeesPage })));
const EmployeeAdvancesPage = lazy(() => import("@/pages/hr/EmployeeAdvancesPage").then(m => ({ default: m.EmployeeAdvancesPage })));
const PayrollRunsPage = lazy(() => import("@/pages/hr/PayrollRunsPage").then(m => ({ default: m.PayrollRunsPage })));
const FixedAssetsPage = lazy(() => import("@/pages/assets/FixedAssetsPage").then(m => ({ default: m.FixedAssetsPage })));
const AnalyticsReportsPage = lazy(() => import("@/pages/analytics/AnalyticsReportsPage").then(m => ({ default: m.AnalyticsReportsPage })));
const ApprovalsCenterPage = lazy(() => import("@/pages/settings/ApprovalsCenterPage").then(m => ({ default: m.ApprovalsCenterPage })));
const ProductionShell = lazy(() => import("@/pages/shells/ProductionShell").then(m => ({ default: m.ProductionShell })));
const WarehouseShell = lazy(() => import("@/pages/shells/WarehouseShell").then(m => ({ default: m.WarehouseShell })));
const RepShell = lazy(() => import("@/pages/shells/RepShell").then(m => ({ default: m.RepShell })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutes
      retry: 1,
    },
  },
});

function RoleRootRedirect() {
  const { role } = useAuth();
  if (!role) return <Navigate to="/login" replace />;
  return <Navigate to={getDefaultRouteForRole(role)} replace />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Login Route */}
            <Route path="/login" element={<LoginPage />} />

            {/* Authenticated Application Shell */}
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              {/* Owner Home Dashboard */}
              <Route
                path="/"
                element={
                  <ProtectedRoute allowedRoles={["owner"]}>
                    <OwnerDashboard />
                  </ProtectedRoute>
                }
              />

              {/* Owner Settings Routes */}
              <Route
                path="/approvals"
                element={
                  <ProtectedRoute allowedRoles={["owner"]}>
                    <ApprovalsCenterPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings/factory"
                element={
                  <ProtectedRoute allowedRoles={["owner"]}>
                    <FactorySettingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings/users"
                element={
                  <ProtectedRoute allowedRoles={["owner"]}>
                    <UsersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings/facilities"
                element={
                  <ProtectedRoute allowedRoles={["owner"]}>
                    <FacilitiesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings/vehicles"
                element={
                  <ProtectedRoute allowedRoles={["owner", "accountant"]}>
                    <VehiclesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings/audit-log"
                element={
                  <ProtectedRoute allowedRoles={["owner"]}>
                    <AuditLogPage />
                  </ProtectedRoute>
                }
              />

              {/* Phase 2: Inventory & Materials Routes */}
              <Route
                path="/inventory/items"
                element={
                  <ProtectedRoute allowedRoles={["owner", "accountant", "production", "warehouse"]}>
                    <ItemsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/inventory/stocktaking"
                element={
                  <ProtectedRoute allowedRoles={["owner", "accountant", "warehouse"]}>
                    <StocktakingPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/inventory/opening-balances"
                element={
                  <ProtectedRoute allowedRoles={["owner", "accountant"]}>
                    <OpeningBalancesPage />
                  </ProtectedRoute>
                }
              />

              {/* Phase 2: Procurement & Suppliers Routes */}
              <Route
                path="/procurement/suppliers"
                element={
                  <ProtectedRoute allowedRoles={["owner", "accountant"]}>
                    <SuppliersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/procurement/orders"
                element={
                  <ProtectedRoute allowedRoles={["owner", "accountant"]}>
                    <PurchaseOrdersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/procurement/receipts"
                element={
                  <ProtectedRoute allowedRoles={["owner", "accountant", "warehouse"]}>
                    <PurchaseReceiptsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/procurement/returns"
                element={
                  <ProtectedRoute allowedRoles={["owner", "accountant"]}>
                    <PurchaseReturnsPage />
                  </ProtectedRoute>
                }
              />

              {/* Accounting Routes (Owner & Accountant) */}
              <Route
                path="/accounting"
                element={
                  <ProtectedRoute allowedRoles={["owner", "accountant"]}>
                    <AccountantDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/accounting/coa"
                element={
                  <ProtectedRoute allowedRoles={["owner", "accountant"]}>
                    <ChartOfAccountsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/accounting/periods"
                element={
                  <ProtectedRoute allowedRoles={["owner", "accountant"]}>
                    <FiscalPeriodsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/accounting/journal-entries"
                element={
                  <ProtectedRoute allowedRoles={["owner", "accountant"]}>
                    <JournalEntriesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/accounting/vouchers"
                element={
                  <ProtectedRoute allowedRoles={["owner", "accountant"]}>
                    <VouchersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/accounting/checks"
                element={
                  <ProtectedRoute allowedRoles={["owner", "accountant"]}>
                    <ChecksPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/accounting/reports"
                element={
                  <ProtectedRoute allowedRoles={["owner", "accountant"]}>
                    <FinancialReportsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/accounting/year-end"
                element={
                  <ProtectedRoute allowedRoles={["owner"]}>
                    <YearEndClosingPage />
                  </ProtectedRoute>
                }
              />

              {/* Phase 5: HR & Payroll */}
              <Route
                path="/hr/employees"
                element={
                  <ProtectedRoute allowedRoles={["owner", "accountant"]}>
                    <EmployeesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/hr/advances"
                element={
                  <ProtectedRoute allowedRoles={["owner", "accountant"]}>
                    <EmployeeAdvancesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/hr/payroll"
                element={
                  <ProtectedRoute allowedRoles={["owner", "accountant"]}>
                    <PayrollRunsPage />
                  </ProtectedRoute>
                }
              />

              {/* Phase 5: Fixed Assets & Director Analytics */}
              <Route
                path="/assets/registry"
                element={
                  <ProtectedRoute allowedRoles={["owner", "accountant"]}>
                    <FixedAssetsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reports/director-analytics"
                element={
                  <ProtectedRoute allowedRoles={["owner"]}>
                    <AnalyticsReportsPage />
                  </ProtectedRoute>
                }
              />

              {/* Phase 3: Manufacturing, BOM, Tanks & Packaging */}
              <Route
                path="/manufacturing/formulas"
                element={
                  <ProtectedRoute allowedRoles={["owner", "production", "accountant"]}>
                    <FormulasPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/manufacturing/specs"
                element={
                  <ProtectedRoute allowedRoles={["owner", "production", "accountant"]}>
                    <PackagingSpecsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/manufacturing/mixing"
                element={
                  <ProtectedRoute allowedRoles={["owner", "production"]}>
                    <MixingBatchesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/manufacturing/packaging"
                element={
                  <ProtectedRoute allowedRoles={["owner", "production"]}>
                    <PackagingOrdersPage />
                  </ProtectedRoute>
                }
              />

              {/* Phase 4: Sales, ZATCA e-Invoicing, Returns & Van Custody */}
              <Route
                path="/sales/customers"
                element={
                  <ProtectedRoute allowedRoles={["owner", "accountant"]}>
                    <CustomersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/sales/quotations"
                element={
                  <ProtectedRoute allowedRoles={["owner", "accountant"]}>
                    <QuotationsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/sales/invoices"
                element={
                  <ProtectedRoute allowedRoles={["owner", "accountant"]}>
                    <SalesInvoicesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/sales/returns"
                element={
                  <ProtectedRoute allowedRoles={["owner", "accountant"]}>
                    <SalesReturnsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/sales/van-custody"
                element={
                  <ProtectedRoute allowedRoles={["owner", "accountant"]}>
                    <VanCustodyPage />
                  </ProtectedRoute>
                }
              />

              {/* Production Mobile Shell (Phase 3) */}
              <Route
                path="/production"
                element={
                  <ProtectedRoute allowedRoles={["owner", "production"]}>
                    <ProductionShell />
                  </ProtectedRoute>
                }
              />

              {/* Warehouse Mobile Shell (Phase 2 Target) */}
              <Route
                path="/warehouse"
                element={
                  <ProtectedRoute allowedRoles={["owner", "warehouse"]}>
                    <WarehouseShell />
                  </ProtectedRoute>
                }
              />

              {/* Sales Rep Mobile Shell (Phase 3 Target) */}
              <Route
                path="/rep"
                element={
                  <ProtectedRoute allowedRoles={["owner", "sales_rep"]}>
                    <RepShell />
                  </ProtectedRoute>
                }
              />
            </Route>

            {/* Catch-all redirect to role-appropriate home */}
            <Route path="*" element={<RoleRootRedirect />} />
          </Routes>
          <Toaster position="top-center" richColors closeButton />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
