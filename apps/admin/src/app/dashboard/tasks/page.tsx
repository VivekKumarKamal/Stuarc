/**
 * @file dashboard/tasks/page.tsx
 * @description Task scheduler page. Allows the teacher to assign course nodes
 * as daily tasks to students, view scheduled tasks, and delete assignments.
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';
import {
  Plus,
  Trash2,
  X,
  CalendarDays,
  Play,
  FileText,
  Trophy,
  BookOpen,
  Link2,
  Check,
  Clock,
  AlertCircle,
} from 'lucide-react';

interface Student {
  id: string;
  name: string;
  email: string;
}

interface Course {
  id: string;
  title: string;
  color_hex: string;
}

interface NodeOption {
  id: string;
  title: string;
  type: 'lecture' | 'practice' | 'quiz' | 'reading';
  course_id: string;
}

interface TaskRow {
  id: string;
  student_id: string;
  node_id: string | null;
  due_date: string;
  status: string;
  completed_at: string | null;
  external_url: string | null;
  external_title: string | null;
  student: { name: string; email: string } | null;
  node: { title: string; type: string; course: { title: string; color_hex: string } | null } | null;
}

const NODE_ICONS: Record<string, typeof Play> = { lecture: Play, practice: FileText, quiz: Trophy, reading: BookOpen, link: Link2 };
const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: 'rgba(245, 158, 11, 0.1)', color: 'var(--accent-amber)', label: 'Pending' },
  in_progress: { bg: 'rgba(99, 102, 241, 0.1)', color: 'var(--accent-indigo)', label: 'In Progress' },
  completed: { bg: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-emerald)', label: 'Completed' },
};

export default function TaskSchedulerPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [nodes, setNodes] = useState<NodeOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [selectedCourseFilter, setSelectedCourseFilter] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // External link task mode
  const [taskMode, setTaskMode] = useState<'node' | 'link'>('node');
  const [externalTitle, setExternalTitle] = useState('');
  const [externalUrl, setExternalUrl] = useState('');

  // Filter controls
  const [filterDate, setFilterDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [filterStudent, setFilterStudent] = useState('');

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [studentsRes, coursesRes, nodesRes, tasksRes] = await Promise.all([
      supabase.from('users').select('id, name, email').eq('role', 'student'),
      supabase.from('courses').select('id, title, color_hex').order('order_index'),
      supabase.from('nodes').select('id, title, type, course_id').eq('is_published', true).order('order_index'),
      supabase.from('tasks')
        .select('id, student_id, node_id, due_date, status, completed_at, external_url, external_title, student:users!tasks_student_id_fkey(name, email), node:nodes!tasks_node_id_fkey(title, type, course:courses!nodes_course_id_fkey(title, color_hex))')
        .order('due_date', { ascending: false })
        .limit(200),
    ]);

    if (studentsRes.data) setStudents(studentsRes.data);
    if (coursesRes.data) setCourses(coursesRes.data);
    if (nodesRes.data) setNodes(nodesRes.data);
    if (tasksRes.data) setTasks(tasksRes.data as unknown as TaskRow[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user, fetchData]);

  const filteredTasks = tasks.filter((t) => {
    if (filterDate && t.due_date !== filterDate) return false;
    if (filterStudent && t.student_id !== filterStudent) return false;
    return true;
  });

  const filteredNodes = selectedCourseFilter
    ? nodes.filter((n) => n.course_id === selectedCourseFilter)
    : nodes;

  const toggleStudent = (id: string) => {
    setSelectedStudents((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const selectAllStudents = () => {
    if (selectedStudents.length === students.length) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(students.map((s) => s.id));
    }
  };

  const handleAssign = async () => {
    if (selectedStudents.length === 0 || !dueDate) {
      setError('Please select at least one student and a due date.');
      return;
    }
    if (taskMode === 'node' && !selectedNodeId) {
      setError('Please select a node to assign.');
      return;
    }
    if (taskMode === 'link' && (!externalTitle.trim() || !externalUrl.trim())) {
      setError('Please enter a title and URL for the link task.');
      return;
    }
    setSaving(true);
    setError(null);

    const rows = selectedStudents.map((studentId) => ({
      student_id: studentId,
      node_id: taskMode === 'node' ? selectedNodeId : null,
      due_date: dueDate,
      status: 'pending',
      external_url: taskMode === 'link' ? externalUrl.trim() : null,
      external_title: taskMode === 'link' ? externalTitle.trim() : null,
    }));

    const { error: insertError } = await supabase.from('tasks').insert(rows);

    if (insertError) {
      setError(insertError.message);
    } else {
      setShowModal(false);
      setSelectedStudents([]);
      setSelectedNodeId('');
      setExternalTitle('');
      setExternalUrl('');
      setDueDate('');
      setTaskMode('node');
      fetchData();
    }
    setSaving(false);
  };

  const handleDelete = async (taskId: string) => {
    if (!confirm('Remove this task assignment?')) return;
    await supabase.from('tasks').delete().eq('id', taskId);
    fetchData();
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Task Scheduler</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Assign daily tasks to students and track their progress.
          </p>
        </div>
        <button
          onClick={() => { setShowModal(true); setError(null); setDueDate(new Date().toISOString().split('T')[0]); setTaskMode('node'); setExternalTitle(''); setExternalUrl(''); }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white cursor-pointer"
          style={{ background: 'linear-gradient(135deg, var(--accent-indigo), var(--accent-purple))' }}
        >
          <Plus size={16} /> Assign Task
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div>
          <label className="block text-[10px] text-[var(--text-muted)] mb-1">Date</label>
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="px-3 py-2 rounded-xl text-sm outline-none"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
          />
        </div>
        <div>
          <label className="block text-[10px] text-[var(--text-muted)] mb-1">Student</label>
          <select
            value={filterStudent}
            onChange={(e) => setFilterStudent(e.target.value)}
            className="px-3 py-2 rounded-xl text-sm outline-none cursor-pointer"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
          >
            <option value="">All Students</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.name || s.email}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Task Table */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: 'var(--bg-card)' }} />
          ))}
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
          <CalendarDays size={48} className="mx-auto text-[var(--text-muted)] mb-4" />
          <h3 className="text-lg font-semibold mb-2">No tasks for this date</h3>
          <p className="text-sm text-[var(--text-secondary)]">
            Assign tasks to students using the button above.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <th className="text-left px-5 py-3 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Student</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Node</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Course</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Due</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((task) => {
                  const status = STATUS_STYLES[task.status] || STATUS_STYLES['pending'];
                  const isLinkTask = !!task.external_url;
                  const nodeType = isLinkTask ? 'link' : (task.node?.type || 'lecture');
                  const Icon = NODE_ICONS[nodeType] || Play;
                  return (
                    <tr key={task.id} className="group" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td className="px-5 py-3">
                        <p className="font-medium">{(task.student as unknown as Student)?.name || 'Unknown'}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">{(task.student as unknown as Student)?.email}</p>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <Icon size={14} className="text-[var(--text-muted)]" />
                          <span>{isLinkTask ? task.external_title : (task.node?.title || 'Unknown')}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        {isLinkTask ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                            <Link2 size={10} /> External Link
                          </span>
                        ) : task.node?.course ? (
                          <span className="inline-flex items-center gap-1.5 text-xs">
                            <span className="w-2 h-2 rounded-full" style={{ background: task.node.course.color_hex }} />
                            {task.node.course.title}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-5 py-3 text-[var(--text-secondary)]">{task.due_date}</td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg" style={{ background: status.bg, color: status.color }}>
                          {task.status === 'completed' ? <Check size={12} /> : task.status === 'in_progress' ? <Clock size={12} /> : <AlertCircle size={12} />}
                          {status.label}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <button
                          onClick={() => handleDelete(task.id)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg cursor-pointer transition-opacity"
                          style={{ color: 'var(--accent-rose)' }}
                          title="Delete task"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Assign Task Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-lg rounded-2xl p-6 animate-scale-in max-h-[90vh] overflow-y-auto" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">Assign Task</h2>
              <button onClick={() => setShowModal(false)} className="p-1 cursor-pointer text-[var(--text-muted)]"><X size={20} /></button>
            </div>

            <div className="space-y-5">
              {/* Task mode toggle */}
              <div>
                <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Task Type</label>
                <div className="flex gap-2">
                  {([['node', '📚 Course Node'], ['link', '🔗 External Link']] as const).map(([val, label]) => (
                    <button key={val} onClick={() => setTaskMode(val as 'node' | 'link')} className="flex-1 py-2.5 rounded-xl text-xs font-medium cursor-pointer transition-all" style={{ background: taskMode === val ? 'rgba(99, 102, 241, 0.1)' : 'var(--bg-input)', border: `1px solid ${taskMode === val ? 'var(--accent-indigo)' : 'var(--border-subtle)'}`, color: taskMode === val ? 'var(--accent-indigo)' : 'var(--text-secondary)' }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Students */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-[var(--text-secondary)]">Students</label>
                  <button onClick={selectAllStudents} className="text-[10px] text-[var(--accent-indigo)] cursor-pointer">
                    {selectedStudents.length === students.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                {students.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)] py-3">No students linked yet. Share your invite code first.</p>
                ) : (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto rounded-xl p-2" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>
                    {students.map((s) => (
                      <label key={s.id} className="flex items-center gap-3 px-2 py-1.5 rounded-lg cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={selectedStudents.includes(s.id)}
                          onChange={() => toggleStudent(s.id)}
                          className="accent-[var(--accent-indigo)]"
                        />
                        <span>{s.name || s.email}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Course Node mode OR External Link mode */}
              {taskMode === 'node' ? (
                <>
                  <div>
                    <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Course Filter</label>
                    <select
                      value={selectedCourseFilter}
                      onChange={(e) => { setSelectedCourseFilter(e.target.value); setSelectedNodeId(''); }}
                      className="w-full px-4 py-2.5 rounded-xl text-sm outline-none cursor-pointer"
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                    >
                      <option value="">All Courses</option>
                      {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Node to Assign</label>
                    <select
                      value={selectedNodeId}
                      onChange={(e) => setSelectedNodeId(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl text-sm outline-none cursor-pointer"
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                    >
                      <option value="">Select a node</option>
                      {filteredNodes.map((n) => (
                        <option key={n.id} value={n.id}>[{n.type.toUpperCase()}] {n.title}</option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Title</label>
                    <input
                      type="text"
                      value={externalTitle}
                      onChange={(e) => setExternalTitle(e.target.value)}
                      placeholder="e.g. Read this article on thermodynamics"
                      className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">URL</label>
                    <input
                      type="url"
                      value={externalUrl}
                      onChange={(e) => setExternalUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                    />
                  </div>
                </>
              )}

              {/* Due Date */}
              <div>
                <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                />
              </div>

              {error && (
                <div className="text-sm px-4 py-2.5 rounded-xl" style={{ background: 'rgba(244, 63, 94, 0.1)', color: 'var(--accent-rose)' }}>
                  {error}
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 rounded-xl text-sm cursor-pointer" style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>Cancel</button>
              <button onClick={handleAssign} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-60" style={{ background: 'linear-gradient(135deg, var(--accent-indigo), var(--accent-purple))' }}>
                {saving ? 'Assigning...' : `Assign to ${selectedStudents.length} Student${selectedStudents.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
