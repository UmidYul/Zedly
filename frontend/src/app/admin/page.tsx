'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, GraduationCap, School, FileText } from 'lucide-react';
import { apiClient } from '@/lib/api';

interface Stats {
  teachers: number;
  students: number;
  classes: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({ teachers: 0, students: 0, classes: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      const [teachersRes, studentsRes, classesRes] = await Promise.all([
        apiClient.get('/admin/teachers'),
        apiClient.get('/admin/students'),
        apiClient.get('/admin/classes'),
      ]);

      setStats({
        teachers: teachersRes.data.teachers?.length || 0,
        students: studentsRes.data.students?.length || 0,
        classes: classesRes.data.classes?.length || 0,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: 'Учителя',
      value: stats.teachers,
      icon: GraduationCap,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      title: 'Ученики',
      value: stats.students,
      icon: Users,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      title: 'Классы',
      value: stats.classes,
      icon: School,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
    {
      title: 'Тесты',
      value: 0,
      icon: FileText,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
    },
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-300 border-t-blue-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((stat) => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  {stat.title}
                </CardTitle>
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Быстрый доступ</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <a
                href="/admin/teachers"
                className="p-4 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                <GraduationCap className="w-8 h-8 text-blue-600 mb-2" />
                <h3 className="font-semibold">Управление учителями</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Добавить, редактировать или удалить учителей
                </p>
              </a>

              <a
                href="/admin/students"
                className="p-4 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Users className="w-8 h-8 text-green-600 mb-2" />
                <h3 className="font-semibold">Управление учениками</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Добавить, редактировать или удалить учеников
                </p>
              </a>

              <a
                href="/admin/classes"
                className="p-4 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                <School className="w-8 h-8 text-purple-600 mb-2" />
                <h3 className="font-semibold">Управление классами</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Создавать и настраивать классы
                </p>
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
