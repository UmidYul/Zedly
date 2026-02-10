'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/lib/api';
import { Upload, FileText, AlertCircle, CheckCircle, Download } from 'lucide-react';

interface ImportResult {
  total: number;
  success: number;
  failed: number;
  errors: Array<{
    row: number;
    data: string[];
    error: string;
  }>;
}

export default function ImportPage() {
  const [type, setType] = useState<'students' | 'teachers'>('students');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.csv')) {
        setError('Пожалуйста, выберите CSV файл');
        return;
      }
      setFile(selectedFile);
      setError('');
      setResult(null);
    }
  };

  const handleImport = async () => {
    if (!file) {
      setError('Выберите файл');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const formData = new FormData();
      formData.append('file', file);

      const response = await apiClient.post(`/admin/import/${type}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setResult(response.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Ошибка импорта');
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    let csvContent = '';
    if (type === 'students') {
      csvContent = 'firstName,lastName,username,email,password,classId\n';
      csvContent += 'Иван,Иванов,ivanov_student,ivanov@example.com,Password123,\n';
      csvContent += 'Мария,Петрова,petrova_student,petrova@example.com,Password123,\n';
    } else {
      csvContent = 'firstName,lastName,username,email,password,subject\n';
      csvContent += 'Анна,Смирнова,smirnova_teacher,smirnova@example.com,Password123,Математика\n';
      csvContent += 'Петр,Сидоров,sidorov_teacher,sidorov@example.com,Password123,Физика\n';
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `template_${type}.csv`;
    link.click();
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Импорт пользователей</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload Card */}
        <Card>
          <CardHeader>
            <CardTitle>Загрузить CSV файл</CardTitle>
            <CardDescription>
              Импортируйте учителей или учеников из CSV файла
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Type Selection */}
            <div className="space-y-2">
              <Label>Тип пользователей</Label>
              <div className="flex gap-4">
                <button
                  onClick={() => {
                    setType('students');
                    setFile(null);
                    setResult(null);
                  }}
                  className={`flex-1 p-4 border-2 rounded-lg transition-colors ${type === 'students'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                    }`}
                >
                  <p className="font-semibold">Ученики</p>
                  <p className="text-sm text-gray-600">Импорт учеников</p>
                </button>
                <button
                  onClick={() => {
                    setType('teachers');
                    setFile(null);
                    setResult(null);
                  }}
                  className={`flex-1 p-4 border-2 rounded-lg transition-colors ${type === 'teachers'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                    }`}
                >
                  <p className="font-semibold">Учителя</p>
                  <p className="text-sm text-gray-600">Импорт учителей</p>
                </button>
              </div>
            </div>

            {/* File Upload */}
            <div className="space-y-2">
              <Label htmlFor="file">CSV файл</Label>
              <div className="flex flex-col gap-2">
                <input
                  id="file"
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-md file:border-0
                    file:text-sm file:font-semibold
                    file:bg-blue-50 file:text-blue-700
                    hover:file:bg-blue-100"
                />
                {file && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <FileText className="w-4 h-4" />
                    <span>{file.name}</span>
                    <span className="text-gray-400">
                      ({(file.size / 1024).toFixed(1)} KB)
                    </span>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={handleImport} disabled={!file || loading} className="flex-1">
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                    Импорт...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Импортировать
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Instructions Card */}
        <Card>
          <CardHeader>
            <CardTitle>Инструкция</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Формат CSV файла</h3>
              <p className="text-sm text-gray-600 mb-2">
                {type === 'students'
                  ? 'Для учеников: firstName,lastName,username,email,password,classId'
                  : 'Для учителей: firstName,lastName,username,email,password,subject'}
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Требования</h3>
              <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                <li>Первая строка - заголовки (обязательно)</li>
                <li>Кодировка UTF-8</li>
                <li>Разделитель - запятая</li>
                <li>Email {type === 'teachers' ? 'обязателен' : 'опционален'}</li>
                <li>Password минимум 8 символов</li>
              </ul>
            </div>

            <Button variant="outline" onClick={downloadTemplate} className="w-full">
              <Download className="w-4 h-4 mr-2" />
              Скачать шаблон CSV
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Results */}
      {result && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Результаты импорта</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">Всего</p>
                <p className="text-2xl font-bold">{result.total}</p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg">
                <div className="flex items-center gap-2 text-green-800 mb-1">
                  <CheckCircle className="w-4 h-4" />
                  <p className="text-sm font-medium">Успешно</p>
                </div>
                <p className="text-2xl font-bold text-green-800">{result.success}</p>
              </div>
              <div className="p-4 bg-red-50 rounded-lg">
                <div className="flex items-center gap-2 text-red-800 mb-1">
                  <AlertCircle className="w-4 h-4" />
                  <p className="text-sm font-medium">Ошибки</p>
                </div>
                <p className="text-2xl font-bold text-red-800">{result.failed}</p>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div>
                <h3 className="font-semibold mb-3">Ошибки ({result.errors.length})</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {result.errors.map((err, idx) => (
                    <div key={idx} className="p-3 bg-red-50 rounded border border-red-200">
                      <p className="text-sm font-medium text-red-800">
                        Строка {err.row}: {err.error}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        Данные: {err.data.join(', ')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
