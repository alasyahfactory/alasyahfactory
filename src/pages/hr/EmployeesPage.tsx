import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import {
  Users,
  ArrowRight,
  Plus,
  Search,
  Phone,
  Briefcase,
  Building,
  CreditCard,
  Edit,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import type { Employee, UserProfile } from "@/types/database";

export function EmployeesPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const isArabic = i18n.language === "ar";

  const [searchTerm, setSearchTerm] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Form State
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [phone, setPhone] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [department, setDepartment] = useState<string>("production");
  const [basicSalary, setBasicSalary] = useState<number>(0);
  const [housingAllowance, setHousingAllowance] = useState<number>(0);
  const [transportAllowance, setTransportAllowance] = useState<number>(0);
  const [iban, setIban] = useState("");
  const [userProfileId, setUserProfileId] = useState<string>("");

  // Fetch Users Profiles for linking
  const { data: userProfiles } = useQuery<UserProfile[]>({
    queryKey: ["users_profiles_for_employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("users_profile").select("*").eq("is_active", true);
      if (error) throw error;
      return (data || []) as UserProfile[];
    },
  });

  // Fetch Employees
  const { data: employees, isLoading } = useQuery<Employee[]>({
    queryKey: ["employees_list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select(`
          *,
          user_profile:users_profile(full_name, phone, role)
        `)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as Employee[];
    },
  });

  // Create Employee Mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const seq = Math.floor(Math.random() * 900) + 100;
      const empCode = `EMP-${seq}`;

      const { data, error } = await supabase.from("employees").insert({
        emp_code: empCode,
        name_ar: nameAr,
        name_en: nameEn || nameAr,
        phone,
        national_id: nationalId,
        job_title: jobTitle,
        department,
        basic_salary: Number(basicSalary),
        housing_allowance: Number(housingAllowance),
        transport_allowance: Number(transportAllowance),
        iban: iban || null,
        user_profile_id: userProfileId || null,
        is_active: true,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(isArabic ? "تم إضافة الموظف بنجاح" : "Employee added successfully");
      queryClient.invalidateQueries({ queryKey: ["employees_list"] });
      setCreateModalOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      toast.error(err.message || (isArabic ? "فشل إضافة الموظف" : "Failed to add employee"));
    },
  });

  const resetForm = () => {
    setNameAr("");
    setNameEn("");
    setPhone("");
    setNationalId("");
    setJobTitle("");
    setBasicSalary(0);
    setHousingAllowance(0);
    setTransportAllowance(0);
    setIban("");
    setUserProfileId("");
  };

  const filteredEmployees = employees?.filter((emp) => {
    const matchesSearch =
      emp.name_ar.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.emp_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.phone.includes(searchTerm);
    const matchesDept = departmentFilter === "all" || emp.department === departmentFilter;
    return matchesSearch && matchesDept;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-industrial-accent" />
            {isArabic ? "دليل الموظفين وشؤون العاملين" : "Employees Directory"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isArabic
              ? "بيانات الكادر الصناعي، الرواتب والبدلات، الحسابات البنكية، وربط مستخدمي النظام"
              : "Factory staff registry, salaries, allowances, IBAN, and user linkages"}
          </p>
        </div>

        <Button
          onClick={() => {
            resetForm();
            setCreateModalOpen(true);
          }}
          className="gap-2 bg-slate-900 text-white hover:bg-slate-800 shadow-sm font-semibold"
        >
          <Plus className="h-4 w-4" />
          <span>{isArabic ? "إضافة موظف جديد" : "Add Employee"}</span>
        </Button>
      </div>

      {/* Filter and Search */}
      <Card className="border-industrial-border bg-white shadow-sm">
        <CardContent className="p-3.5 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-80">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={isArabic ? "بحث باسم الموظف، الكود أو الجوال..." : "Search employee..."}
              className="ps-9 bg-slate-50 border-industrial-border text-xs"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="h-9 px-3 rounded-md border border-industrial-border bg-slate-50 text-xs font-medium text-slate-700"
            >
              <option value="all">كافة الأقسام</option>
              <option value="production">صالة الإنتاج والخلط</option>
              <option value="warehouse">المستودعات والتوريد</option>
              <option value="sales">المبيعات والتوزيع</option>
              <option value="accounting">المحاسبة والمالية</option>
              <option value="management">الإدارة العامة</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Employees Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="border-industrial-border p-4">
              <Skeleton className="h-28 w-full" />
            </Card>
          ))
        ) : filteredEmployees?.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-400 text-xs">
            {isArabic ? "لا يوجد موظفون مطابقون لبحثك" : "No employees found"}
          </div>
        ) : (
          filteredEmployees?.map((emp) => {
            const totalSalary = emp.basic_salary + emp.housing_allowance + emp.transport_allowance + emp.other_allowances;

            return (
              <Card key={emp.id} className="border-industrial-border bg-white shadow-sm p-4 space-y-3 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-mono text-xs font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-800">
                      {emp.emp_code}
                    </span>
                    <h3 className="font-bold text-slate-900 text-sm mt-1">{emp.name_ar}</h3>
                    <span className="text-[11px] text-slate-500 font-medium block">{emp.job_title}</span>
                  </div>

                  <Badge variant="outline" className="text-[10px]">
                    {emp.department === "production"
                      ? "إنتاج"
                      : emp.department === "warehouse"
                      ? "مستودع"
                      : emp.department === "sales"
                      ? "مبيعات"
                      : emp.department === "accounting"
                      ? "محاسبة"
                      : "إدارة"}
                  </Badge>
                </div>

                <div className="space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">رقم الجوال:</span>
                    <span className="font-mono text-slate-800">{emp.phone}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">الهوية / الإقامة:</span>
                    <span className="font-mono text-slate-800">{emp.national_id}</span>
                  </div>
                  <div className="flex items-center justify-between font-bold">
                    <span className="text-slate-700">الراتب الأساسي:</span>
                    <span className="font-mono text-slate-900">{emp.basic_salary.toFixed(2)} ر.س</span>
                  </div>
                  <div className="flex items-center justify-between font-bold text-emerald-800">
                    <span>إجمالي الأجر الشهري:</span>
                    <span className="font-mono">{totalSalary.toFixed(2)} ر.س</span>
                  </div>
                </div>

                {emp.user_profile && (
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                    <span>مستخدم بالنظام:</span>
                    <Badge variant="secondary" className="text-[10px] py-0 font-mono">
                      {emp.user_profile.role}
                    </Badge>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>

    </div>
  );
}
