import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { getDefaultRouteForRole } from "@/lib/auth";

// Pages
import { LoginPage } from "@/pages/auth/LoginPage";
import { OwnerDashboard } from "@/pages/dashboard/OwnerDashboard";
import { AccountantDashboard } from "@/pages/accounting/AccountantDashboard";
import { FactorySettingsPage } from "@/pages/settings/FactorySettingsPage";
import { UsersPage } from "@/pages/settings/UsersPage";
import { FacilitiesPage } from "@/pages/settings/FacilitiesPage";
import { ChartOfAccountsPage } from "@/pages/accounting/ChartOfAccountsPage";
import { FiscalPeriodsPage } from "@/pages/accounting/FiscalPeriodsPage";
import { AuditLogPage } from "@/pages/settings/AuditLogPage";
import { VehiclesPage } from "@/pages/settings/VehiclesPage";
import { ItemsPage } from "@/pages/inventory/ItemsPage";
import { OpeningBalancesPage } from "@/pages/inventory/OpeningBalancesPage";
import { SuppliersPage } from "@/pages/procurement/SuppliersPage";
import { PurchaseOrdersPage } from "@/pages/procurement/PurchaseOrdersPage";
import { PurchaseReceiptsPage } from "@/pages/procurement/PurchaseReceiptsPage";
import { PurchaseReturnsPage } from "@/pages/procurement/PurchaseReturnsPage";
import { FormulasPage } from "@/pages/manufacturing/FormulasPage";
import { PackagingSpecsPage } from "@/pages/manufacturing/PackagingSpecsPage";
import { MixingBatchesPage } from "@/pages/manufacturing/MixingBatchesPage";
import { PackagingOrdersPage } from "@/pages/manufacturing/PackagingOrdersPage";
import { ProductionShell } from "@/pages/shells/ProductionShell";
import { WarehouseShell } from "@/pages/shells/WarehouseShell";
import { RepShell } from "@/pages/shells/RepShell";
import { CustomersPage } from "@/pages/sales/CustomersPage";
import { QuotationsPage } from "@/pages/sales/QuotationsPage";
import { SalesInvoicesPage } from "@/pages/sales/SalesInvoicesPage";
import { SalesReturnsPage } from "@/pages/sales/SalesReturnsPage";
import { VanCustodyPage } from "@/pages/sales/VanCustodyPage";
import { JournalEntriesPage } from "@/pages/accounting/JournalEntriesPage";
import { VouchersPage } from "@/pages/accounting/VouchersPage";
import { ChecksPage } from "@/pages/accounting/ChecksPage";
import { FinancialReportsPage } from "@/pages/accounting/FinancialReportsPage";
import { YearEndClosingPage } from "@/pages/accounting/YearEndClosingPage";
import { EmployeesPage } from "@/pages/hr/EmployeesPage";
import { EmployeeAdvancesPage } from "@/pages/hr/EmployeeAdvancesPage";
import { PayrollRunsPage } from "@/pages/hr/PayrollRunsPage";
import { FixedAssetsPage } from "@/pages/assets/FixedAssetsPage";
import { AnalyticsReportsPage } from "@/pages/analytics/AnalyticsReportsPage";

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
