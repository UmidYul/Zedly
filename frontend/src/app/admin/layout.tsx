'use client';

import { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { UserRole } from '@/types';
import { Button } from '@/components/ui/button';
import { Users, GraduationCap, School, LogOut, LayoutDashboard, Upload } from 'lucide-react';
import Link from 'next/link';

interface AdminLayoutProps {
  children: ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();

  // TEMPORARY: Auth check disabled for UI preview
  if (!user || user.role !== UserRole.ADMIN) {
    router.push('/login');
    return null;
  }

  // Mock user for preview
  const mockUser = user || { username: 'admin', email: 'admin@example.com', role: UserRole.ADMIN };

  const handleLogout = () => {
    clearAuth();
    router.push('/login');
  };

  const navItems = [
    { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/teachers', label: 'Учителя', icon: GraduationCap },
    { href: '/admin/students', label: 'Ученики', icon: Users },
    { href: '/admin/classes', label: 'Классы', icon: School },
    { href: '/admin/import', label: 'Импорт', icon: Upload },
  ];

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-xl font-bold">Zedly</h1>
          <p className="text-sm text-gray-400 mt-1">Панель школы</p>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-4 py-2 rounded-md hover:bg-gray-800 transition-colors"
            >
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <div className="mb-3">
            <p className="text-sm font-medium">{mockUser.username}</p>
            <p className="text-xs text-gray-400">{mockUser.email}</p>
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Выйти
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 bg-gray-50">
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
