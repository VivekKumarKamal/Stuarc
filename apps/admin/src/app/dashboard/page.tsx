/**
 * @file dashboard/page.tsx
 * @description Dashboard overview page showing quick stats and recent activity.
 */

'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';
import { BookOpen, Users, CalendarDays, TrendingUp } from 'lucide-react';
import Link from 'next/link';

interface DashboardStats {
  courseCount: number;
  studentCount: number;
  taskCount: number;
  nodeCount: number;
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    courseCount: 0,
    studentCount: 0,
    taskCount: 0,
    nodeCount: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      const [courses, students, tasks, nodes] = await Promise.all([
        supabase.from('courses').select('id', { count: 'exact', head: true }),
        supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'student'),
        supabase.from('tasks').select('id', { count: 'exact', head: true }),
        supabase.from('nodes').select('id', { count: 'exact', head: true }),
      ]);

      setStats({
        courseCount: courses.count ?? 0,
        studentCount: students.count ?? 0,
        taskCount: tasks.count ?? 0,
        nodeCount: nodes.count ?? 0,
      });
      setLoading(false);
    };

    fetchStats();
  }, []);

  const statCards = [
    { label: 'Courses', value: stats.courseCount, icon: BookOpen, color: 'var(--accent-indigo)', href: '/dashboard/courses' },
    { label: 'Students', value: stats.studentCount, icon: Users, color: 'var(--accent-emerald)', href: '/dashboard/students' },
    { label: 'Tasks Assigned', value: stats.taskCount, icon: CalendarDays, color: 'var(--accent-amber)', href: '/dashboard/tasks' },
    { label: 'Total Nodes', value: stats.nodeCount, icon: TrendingUp, color: 'var(--accent-cyan)', href: '/dashboard/courses' },
  ];

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">
          Welcome back{profile?.name ? `, ${profile.name}` : ''} 👋
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Here&apos;s an overview of your teaching dashboard.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-28 rounded-2xl animate-pulse"
              style={{ background: 'var(--bg-card)' }}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map(({ label, value, icon: Icon, color, href }) => (
            <Link
              key={label}
              href={href}
              className="group rounded-2xl p-5 transition-all duration-200"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = color;
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: `${color}15` }}
                >
                  <Icon size={20} style={{ color }} />
                </div>
              </div>
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">{label}</p>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Link
          href="/dashboard/courses"
          className="group rounded-2xl p-6 transition-all duration-200"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}
        >
          <h3 className="font-semibold mb-2">📚 Manage Courses</h3>
          <p className="text-sm text-[var(--text-secondary)]">
            Create and organize courses, sections, and content nodes.
          </p>
        </Link>
        <Link
          href="/dashboard/tasks"
          className="group rounded-2xl p-6 transition-all duration-200"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}
        >
          <h3 className="font-semibold mb-2">📅 Schedule Tasks</h3>
          <p className="text-sm text-[var(--text-secondary)]">
            Assign daily tasks to your students and manage their schedules.
          </p>
        </Link>
      </div>
    </div>
  );
}
