'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiClient } from '@/lib/api';
import { Plus, Trash2 } from 'lucide-react';

interface Class {
  id: string;
  name: string;
  parallel: number;
  letter: string;
  student_count: number;
  created_at: string;
}

const classSchema = z.object({
  name: z.string().min(1, 'Обязательное поле'),
  parallel: z.coerce.number().int().min(1, 'От 1').max(11, 'До 11'),
  letter: z.string().length(1, 'Одна буква'),
});

type ClassForm = z.infer<typeof classSchema>;

export default function ClassesPage() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ClassForm>({
    resolver: zodResolver(classSchema),
  });

  useEffect(() => {
    loadClasses();
  }, []);

  const loadClasses = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/admin/classes');
      setClasses(response.data.classes || []);
    } catch (error) {
      console.error('Error loading classes:', error);
      setError('Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: ClassForm) => {
    try {
      setError('');
      await apiClient.post('/admin/classes', data);
      reset();
      setShowForm(false);
      await loadClasses();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Ошибка создания класса');
    }
  };

  const handleDelete = async (id: string, studentCount: number) => {
    if (studentCount > 0) {
      alert('Нельзя удалить класс с учениками');
      return;
    }

    if (!confirm('Удалить класс?')) return;

    try {
      await apiClient.delete(`/admin/classes/${id}`);
      await loadClasses();
    } catch (error: any) {
      console.error('Error deleting class:', error);
      alert(error.response?.data?.message || 'Ошибка удаления');
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Управление классами</h1>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="w-4 h-4 mr-2" />
          Добавить класс
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Новый класс</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="parallel">Параллель (1-11)</Label>
                  <Input
                    id="parallel"
                    type="number"
                    min="1"
                    max="11"
                    {...register('parallel')}
                    disabled={isSubmitting}
                  />
                  {errors.parallel && (
                    <p className="text-sm text-destructive">{errors.parallel.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="letter">Буква (А, Б, В...)</Label>
                  <Input
                    id="letter"
                    maxLength={1}
                    {...register('letter')}
                    disabled={isSubmitting}
                  />
                  {errors.letter && (
                    <p className="text-sm text-destructive">{errors.letter.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">Название (9А, 10Б...)</Label>
                  <Input
                    id="name"
                    {...register('name')}
                    disabled={isSubmitting}
                    placeholder="9А"
                  />
                  {errors.name && (
                    <p className="text-sm text-destructive">{errors.name.message}</p>
                  )}
                </div>
              </div>

              {error && (
                <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                  {error}
                </div>
              )}

              <div className="flex gap-2">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Создание...' : 'Создать'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    reset();
                    setError('');
                  }}
                >
                  Отмена
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Список классов ({classes.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-300 border-t-blue-600"></div>
            </div>
          ) : classes.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>Нет классов</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {classes.map((cls) => (
                <Card key={cls.id} className="relative">
                  <CardHeader>
                    <CardTitle className="text-xl">{cls.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <p className="text-sm text-gray-600">
                        <span className="font-medium">Параллель:</span> {cls.parallel}
                      </p>
                      <p className="text-sm text-gray-600">
                        <span className="font-medium">Буква:</span> {cls.letter}
                      </p>
                      <p className="text-sm text-gray-600">
                        <span className="font-medium">Учеников:</span> {cls.student_count}
                      </p>
                    </div>
                    <div className="mt-4 pt-4 border-t">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(cls.id, cls.student_count)}
                        disabled={cls.student_count > 0}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Удалить
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
