/**
 * @file dashboard/students/page.tsx
 * @description Students listing page showing all students linked to this teacher.
 */

'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';
import { Users, Mail, Calendar } from 'lucide-react';

interface Student {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

export default function StudentsPage() {
  const { user } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('users')
        .select('id, name, email, created_at')
        .eq('role', 'student')
        .order('created_at', { ascending: false });

      if (data) setStudents(data);
      setLoading(false);
    };
    if (user) {
      fetch();
    }
  }, [user]);

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Students</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Students linked to your account via invite code.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: 'var(--bg-card)' }} />
          ))}
        </div>
      ) : students.length === 0 ? (
        <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
          <Users size={48} className="mx-auto text-[var(--text-muted)] mb-4" />
          <h3 className="text-lg font-semibold mb-2">No students yet</h3>
          <p className="text-sm text-[var(--text-secondary)]">
            Share your invite code with students so they can link to your account.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
          {students.map((student, i) => (
            <div
              key={student.id}
              className="flex items-center gap-4 px-5 py-4"
              style={{ borderBottom: i < students.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, var(--accent-emerald), var(--accent-cyan))' }}
              >
                {(student.name || student.email)[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{student.name || 'Unnamed'}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                    <Mail size={10} /> {student.email}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                    <Calendar size={10} /> Joined {new Date(student.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
