/**
 * @file dashboard/courses/page.tsx
 * @description Courses listing page with create/edit/delete functionality.
 * Each course card links to the course builder for sections and nodes.
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  BookOpen,
  ChevronRight,
} from 'lucide-react';

const COURSE_COLORS = [
  '#4F46E5', '#06B6D4', '#10B981', '#F59E0B',
  '#EC4899', '#8B5CF6', '#EF4444', '#3B82F6',
];

interface Course {
  id: string;
  title: string;
  subject: string;
  description: string;
  color_hex: string;
  order_index: number;
  created_at: string;
}

interface CourseForm {
  title: string;
  subject: string;
  description: string;
  color_hex: string;
}

const EMPTY_FORM: CourseForm = { title: '', subject: '', description: '', color_hex: COURSE_COLORS[0] };

export default function CoursesPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CourseForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCourses = useCallback(async () => {
    if (!user) return;
    const { data, error: fetchError } = await supabase
      .from('courses')
      .select('*')
      .order('order_index', { ascending: true });

    if (!fetchError && data) {
      setCourses(data);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchCourses();
    }
  }, [user, fetchCourses]);

  const openCreateModal = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setError(null);
    setShowModal(true);
  };

  const openEditModal = (course: Course) => {
    setForm({
      title: course.title,
      subject: course.subject,
      description: course.description,
      color_hex: course.color_hex,
    });
    setEditingId(course.id);
    setError(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      setError('Course title is required.');
      return;
    }

    setSaving(true);
    setError(null);

    if (editingId) {
      const { error: updateError } = await supabase
        .from('courses')
        .update({
          title: form.title.trim(),
          subject: '',
          description: form.description.trim(),
          color_hex: form.color_hex,
        })
        .eq('id', editingId);

      if (updateError) {
        setError(updateError.message);
      } else {
        setShowModal(false);
        fetchCourses();
      }
    } else {
      const { error: insertError } = await supabase
        .from('courses')
        .insert({
          title: form.title.trim(),
          subject: '',
          description: form.description.trim(),
          color_hex: form.color_hex,
          order_index: courses.length,
          teacher_id: user!.id,
        });

      if (insertError) {
        setError(insertError.message);
      } else {
        setShowModal(false);
        fetchCourses();
      }
    }
    setSaving(false);
  };

  const handleDelete = async (courseId: string) => {
    if (!confirm('Delete this course and all its sections, nodes, and content? This cannot be undone.')) {
      return;
    }
    await supabase.from('courses').delete().eq('id', courseId);
    fetchCourses();
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Courses</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Create and manage your course catalog.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-all duration-200 cursor-pointer"
          style={{ background: 'linear-gradient(135deg, var(--accent-indigo), var(--accent-purple))' }}
        >
          <Plus size={16} /> New Course
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 rounded-2xl animate-pulse" style={{ background: 'var(--bg-card)' }} />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <div
          className="text-center py-16 rounded-2xl"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}
        >
          <BookOpen size={48} className="mx-auto text-[var(--text-muted)] mb-4" />
          <h3 className="text-lg font-semibold mb-2">No courses yet</h3>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            Create your first course to start building content.
          </p>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white cursor-pointer"
            style={{ background: 'linear-gradient(135deg, var(--accent-indigo), var(--accent-purple))' }}
          >
            <Plus size={16} /> Create Course
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map((course) => (
            <div
              key={course.id}
              className="group rounded-2xl overflow-hidden transition-all duration-200"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}
            >
              {/* Color banner */}
              <div className="h-2" style={{ background: course.color_hex }} />
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-base truncate">{course.title}</h3>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                    <button
                      onClick={() => openEditModal(course)}
                      className="p-1.5 rounded-lg transition-colors cursor-pointer"
                      style={{ color: 'var(--text-muted)' }}
                      title="Edit course"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(course.id)}
                      className="p-1.5 rounded-lg transition-colors cursor-pointer"
                      style={{ color: 'var(--accent-rose)' }}
                      title="Delete course"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {course.description && (
                  <p className="text-xs text-[var(--text-secondary)] line-clamp-2 mb-4">
                    {course.description}
                  </p>
                )}
                <Link
                  href={`/dashboard/courses/${course.id}`}
                  className="flex items-center gap-1 text-xs font-medium transition-colors"
                  style={{ color: 'var(--accent-indigo)' }}
                >
                  Open Course Builder <ChevronRight size={14} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
        >
          <div
            className="w-full max-w-lg rounded-2xl p-6 animate-scale-in"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">{editingId ? 'Edit Course' : 'New Course'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 cursor-pointer text-[var(--text-muted)]">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Class 11 Physics"
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                />
              </div>



              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Course description..."
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-none"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Color</label>
                <div className="flex gap-2 flex-wrap">
                  {COURSE_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setForm({ ...form, color_hex: color })}
                      className="w-8 h-8 rounded-full cursor-pointer transition-transform"
                      style={{
                        background: color,
                        border: form.color_hex === color ? '3px solid var(--text-primary)' : '3px solid transparent',
                        transform: form.color_hex === color ? 'scale(1.15)' : 'scale(1)',
                      }}
                    />
                  ))}
                </div>
              </div>

              {error && (
                <div
                  className="text-sm px-4 py-2.5 rounded-xl"
                  style={{ background: 'rgba(244, 63, 94, 0.1)', color: 'var(--accent-rose)' }}
                >
                  {error}
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium cursor-pointer"
                style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, var(--accent-indigo), var(--accent-purple))' }}
              >
                {saving ? 'Saving...' : editingId ? 'Update Course' : 'Create Course'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
