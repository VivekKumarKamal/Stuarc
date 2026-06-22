/**
 * @file dashboard/courses/[courseId]/page.tsx
 * @description Course builder page. Manages sections and nodes within a single course.
 * Supports creating, editing, deleting sections and nodes (lecture, practice, quiz, reading).
 * For lecture nodes: single URL input auto-detects Drive vs YouTube.
 * For practice/quiz nodes: configure FieldTally form ID, question count, time limit.
 * For reading nodes: configure fresh upload or reference from course resources.
 * Includes a Course Resources manager for per-course PDF/EPUB library.
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { supabase, fieldtallySupabase } from '@/lib/supabase';
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  X,
  Play,
  FileText,
  Trophy,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  GripVertical,
  Link2,
  FolderOpen,
  Video,
  HardDrive,
} from 'lucide-react';

type NodeType = 'lecture' | 'practice' | 'quiz' | 'reading';

interface Section {
  id: string;
  course_id: string;
  title: string;
  order_index: number;
}

interface CourseNode {
  id: string;
  section_id: string;
  course_id: string;
  title: string;
  type: NodeType;
  order_index: number;
  is_published: boolean;
  available_from: string | null;
}

interface Course {
  id: string;
  title: string;
  subject: string;
  color_hex: string;
}

interface Resource {
  id: string;
  course_id: string;
  teacher_id: string;
  title: string;
  file_type: 'pdf' | 'epub';
  drive_file_id: string;
  drive_url: string;
  file_size_bytes: number;
  page_count: number | null;
}

// ─── Video URL auto-detection ─────────────────────
function detectVideoSource(url: string): { type: 'youtube'; videoId: string } | { type: 'drive'; fileId: string } | null {
  if (!url) return null;
  // YouTube patterns
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) return { type: 'youtube', videoId: ytMatch[1] };
  // Drive patterns
  const driveMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  if (driveMatch) return { type: 'drive', fileId: driveMatch[1] };
  return null;
}

interface LectureForm {
  video_url: string;
  start_timestamp_seconds: string;
  end_timestamp_seconds: string;
  description: string;
  primer_notes: string;
}

interface ReadingForm {
  source_type: 'fresh' | 'reference';
  drive_url: string;
  file_type: 'pdf' | 'epub';
  resource_id: string;
  page_start: string;
  page_end: string;
  title: string;
  description: string;
  estimated_minutes: string;
}

interface PracticeQuizForm {
  fieldtally_form_id: string;
  title: string;
  question_count: number;
  time_limit_seconds: string;
}

const NODE_ICONS: Record<NodeType, typeof Play> = { lecture: Play, practice: FileText, quiz: Trophy, reading: BookOpen };
const NODE_COLORS: Record<NodeType, string> = {
  lecture: 'var(--accent-indigo)',
  practice: 'var(--accent-emerald)',
  quiz: 'var(--accent-amber)',
  reading: '#14b8a6',
};

export default function CourseBuilderPage() {
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const courseId = params.courseId as string;

  const [course, setCourse] = useState<Course | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [nodes, setNodes] = useState<CourseNode[]>([]);
  const [loading, setLoading] = useState(true);

  // Resources
  const [resources, setResources] = useState<Resource[]>([]);
  const [showResourcesPanel, setShowResourcesPanel] = useState(false);
  const [showResourceModal, setShowResourceModal] = useState(false);
  const [editResourceId, setEditResourceId] = useState<string | null>(null);
  const [resourceForm, setResourceForm] = useState({ title: '', file_type: 'pdf' as 'pdf' | 'epub', drive_url: '', page_count: '' });

  // Section modal
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [editSectionId, setEditSectionId] = useState<string | null>(null);
  const [sectionTitle, setSectionTitle] = useState('');

  // Node modal
  const [showNodeModal, setShowNodeModal] = useState(false);
  const [editNodeId, setEditNodeId] = useState<string | null>(null);
  const [nodeForm, setNodeForm] = useState({ title: '', type: 'lecture' as NodeType, section_id: '', available_from: '' });

  // Lecture detail modal
  const [showLectureModal, setShowLectureModal] = useState(false);
  const [lectureNodeId, setLectureNodeId] = useState<string | null>(null);
  const [lectureForm, setLectureForm] = useState<LectureForm>({
    video_url: '', start_timestamp_seconds: '', end_timestamp_seconds: '',
    description: '', primer_notes: '',
  });

  // Reading detail modal
  const [showReadingModal, setShowReadingModal] = useState(false);
  const [readingNodeId, setReadingNodeId] = useState<string | null>(null);
  const [readingForm, setReadingForm] = useState<ReadingForm>({
    source_type: 'fresh', drive_url: '', file_type: 'pdf',
    resource_id: '', page_start: '', page_end: '',
    title: '', description: '', estimated_minutes: '',
  });

  // Practice/Quiz detail modal
  const [showPQModal, setShowPQModal] = useState(false);
  const [pqNodeId, setPqNodeId] = useState<string | null>(null);
  const [pqType, setPqType] = useState<'practice' | 'quiz'>('practice');
  const [pqForm, setPqForm] = useState<PracticeQuizForm>({
    fieldtally_form_id: '', title: '', question_count: 0, time_limit_seconds: '',
  });

  const [fieldtallyForms, setFieldtallyForms] = useState<any[]>([]);
  const [loadingFieldtally, setLoadingFieldtally] = useState(false);
  const [manualFormIdMode, setManualFormIdMode] = useState(false);

  const [saving, setSaving] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [courseRes, sectionsRes, nodesRes, resourcesRes] = await Promise.all([
      supabase.from('courses').select('id, title, subject, color_hex').eq('id', courseId).single(),
      supabase.from('sections').select('*').eq('course_id', courseId).order('order_index'),
      supabase.from('nodes').select('*').eq('course_id', courseId).order('order_index'),
      supabase.from('resources').select('*').eq('course_id', courseId).order('created_at', { ascending: false }),
    ]);

    if (courseRes.data) setCourse(courseRes.data);
    if (sectionsRes.data) {
      setSections(sectionsRes.data);
      setExpandedSections(new Set(sectionsRes.data.map((s: Section) => s.id)));
    }
    if (nodesRes.data) setNodes(nodesRes.data);
    if (resourcesRes.data) setResources(resourcesRes.data);
    setLoading(false);
  }, [courseId, user]);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user, fetchData]);

  const getNodesForSection = (sectionId: string) =>
    nodes.filter((n) => n.section_id === sectionId).sort((a, b) => a.order_index - b.order_index);

  const toggleSection = (id: string) => {
    const next = new Set(expandedSections);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpandedSections(next);
  };

  // ─── Resource CRUD ────────────────────────────────
  const openCreateResource = () => {
    setResourceForm({ title: '', file_type: 'pdf', drive_url: '', page_count: '' });
    setEditResourceId(null);
    setShowResourceModal(true);
  };

  const openEditResource = (r: Resource) => {
    setResourceForm({
      title: r.title,
      file_type: r.file_type,
      drive_url: r.drive_url,
      page_count: r.page_count?.toString() || '',
    });
    setEditResourceId(r.id);
    setShowResourceModal(true);
  };

  const handleSaveResource = async () => {
    if (!resourceForm.title.trim() || !resourceForm.drive_url.trim()) return;
    setSaving(true);
    // Auto-extract drive file ID from URL
    const detected = detectVideoSource(resourceForm.drive_url.trim());
    const driveFileId = detected?.type === 'drive' ? detected.fileId : resourceForm.drive_url.trim();

    const payload = {
      course_id: courseId,
      teacher_id: user!.id,
      title: resourceForm.title.trim(),
      file_type: resourceForm.file_type,
      drive_file_id: driveFileId,
      drive_url: resourceForm.drive_url.trim(),
      page_count: resourceForm.page_count ? parseInt(resourceForm.page_count) : null,
    };

    if (editResourceId) {
      await supabase.from('resources').update(payload).eq('id', editResourceId);
    } else {
      await supabase.from('resources').insert(payload);
    }
    setSaving(false);
    setShowResourceModal(false);
    fetchData();
  };

  const handleDeleteResource = async (id: string) => {
    if (!confirm('Delete this resource? Reading nodes referencing it will lose the link.')) return;
    await supabase.from('resources').delete().eq('id', id);
    fetchData();
  };

  // ─── Section CRUD ─────────────────────────────────
  const openCreateSection = () => {
    setSectionTitle('');
    setEditSectionId(null);
    setShowSectionModal(true);
  };

  const openEditSection = (s: Section) => {
    setSectionTitle(s.title);
    setEditSectionId(s.id);
    setShowSectionModal(true);
  };

  const handleSaveSection = async () => {
    if (!sectionTitle.trim()) return;
    setSaving(true);
    if (editSectionId) {
      await supabase.from('sections').update({ title: sectionTitle.trim() }).eq('id', editSectionId);
    } else {
      await supabase.from('sections').insert({
        course_id: courseId,
        title: sectionTitle.trim(),
        order_index: sections.length,
      });
    }
    setSaving(false);
    setShowSectionModal(false);
    fetchData();
  };

  const handleDeleteSection = async (id: string) => {
    if (!confirm('Delete this section and all its nodes? This cannot be undone.')) return;
    await supabase.from('sections').delete().eq('id', id);
    fetchData();
  };

  // ─── Node CRUD ────────────────────────────────────
  const openCreateNode = (sectionId: string) => {
    setNodeForm({ title: '', type: 'lecture', section_id: sectionId, available_from: '' });
    setEditNodeId(null);
    setShowNodeModal(true);
  };

  const openEditNode = (n: CourseNode) => {
    setNodeForm({
      title: n.title,
      type: n.type,
      section_id: n.section_id,
      available_from: n.available_from ? n.available_from.slice(0, 16) : '',
    });
    setEditNodeId(n.id);
    setShowNodeModal(true);
  };

  const handleSaveNode = async () => {
    if (!nodeForm.title.trim()) return;
    setSaving(true);
    const sectionNodes = getNodesForSection(nodeForm.section_id);
    if (editNodeId) {
      await supabase.from('nodes').update({
        title: nodeForm.title.trim(),
        type: nodeForm.type,
        section_id: nodeForm.section_id,
        available_from: nodeForm.available_from || null,
      }).eq('id', editNodeId);
    } else {
      await supabase.from('nodes').insert({
        course_id: courseId,
        section_id: nodeForm.section_id,
        title: nodeForm.title.trim(),
        type: nodeForm.type,
        order_index: sectionNodes.length,
        is_published: false,
        available_from: nodeForm.available_from || null,
      });
    }
    setSaving(false);
    setShowNodeModal(false);
    fetchData();
  };

  const handleDeleteNode = async (id: string) => {
    if (!confirm('Delete this node and its content? This cannot be undone.')) return;
    await supabase.from('nodes').delete().eq('id', id);
    fetchData();
  };

  const handleTogglePublish = async (node: CourseNode) => {
    await supabase.from('nodes').update({ is_published: !node.is_published }).eq('id', node.id);
    fetchData();
  };

  // ─── Lecture Detail (Simplified) ──────────────────
  const openLectureDetail = async (nodeId: string) => {
    setLectureNodeId(nodeId);
    const { data } = await supabase.from('lectures').select('*').eq('node_id', nodeId).single();
    if (data) {
      // Reconstruct a single video_url from stored fields
      let videoUrl = '';
      if (data.youtube_url) {
        videoUrl = data.youtube_url;
      } else if (data.drive_url) {
        videoUrl = data.drive_url;
      } else if (data.drive_file_id) {
        videoUrl = `https://drive.google.com/file/d/${data.drive_file_id}/view`;
      }
      setLectureForm({
        video_url: videoUrl,
        start_timestamp_seconds: data.start_timestamp_seconds?.toString() || '',
        end_timestamp_seconds: data.end_timestamp_seconds?.toString() || '',
        description: data.description || '',
        primer_notes: data.primer_notes || '',
      });
    } else {
      setLectureForm({
        video_url: '', start_timestamp_seconds: '', end_timestamp_seconds: '',
        description: '', primer_notes: '',
      });
    }
    setShowLectureModal(true);
  };

  const handleSaveLecture = async () => {
    if (!lectureNodeId || !lectureForm.video_url.trim()) return;
    const detected = detectVideoSource(lectureForm.video_url.trim());
    if (!detected) {
      alert('Could not detect video source. Please paste a valid YouTube or Google Drive URL.');
      return;
    }
    setSaving(true);
    const payload: Record<string, unknown> = {
      node_id: lectureNodeId,
      description: lectureForm.description.trim(),
      primer_notes: lectureForm.primer_notes.trim() || null,
    };

    if (detected.type === 'youtube') {
      payload.youtube_url = lectureForm.video_url.trim();
      payload.drive_file_id = null;
      payload.drive_url = null;
      // YouTube doesn't support server-side segment timestamps
      payload.start_timestamp_seconds = null;
      payload.end_timestamp_seconds = null;
    } else {
      payload.youtube_url = null;
      payload.drive_file_id = detected.fileId;
      payload.drive_url = lectureForm.video_url.trim();
      payload.start_timestamp_seconds = lectureForm.start_timestamp_seconds ? parseInt(lectureForm.start_timestamp_seconds) : null;
      payload.end_timestamp_seconds = lectureForm.end_timestamp_seconds ? parseInt(lectureForm.end_timestamp_seconds) : null;
    }

    const { data: existing } = await supabase.from('lectures').select('id').eq('node_id', lectureNodeId).single();
    if (existing) {
      await supabase.from('lectures').update(payload).eq('node_id', lectureNodeId);
    } else {
      await supabase.from('lectures').insert(payload);
    }
    setSaving(false);
    setShowLectureModal(false);
  };

  // ─── Reading Detail ───────────────────────────────
  const openReadingDetail = async (nodeId: string) => {
    setReadingNodeId(nodeId);
    const { data } = await supabase.from('readings').select('*').eq('node_id', nodeId).single();
    if (data) {
      setReadingForm({
        source_type: data.source_type || 'fresh',
        drive_url: data.drive_url || '',
        file_type: data.file_type || 'pdf',
        resource_id: data.resource_id || '',
        page_start: data.page_start?.toString() || '',
        page_end: data.page_end?.toString() || '',
        title: data.title || '',
        description: data.description || '',
        estimated_minutes: data.estimated_minutes?.toString() || '',
      });
    } else {
      setReadingForm({
        source_type: 'fresh', drive_url: '', file_type: 'pdf',
        resource_id: '', page_start: '', page_end: '',
        title: '', description: '', estimated_minutes: '',
      });
    }
    setShowReadingModal(true);
  };

  const handleSaveReading = async () => {
    if (!readingNodeId || !readingForm.title.trim()) return;
    setSaving(true);
    const payload: Record<string, unknown> = {
      node_id: readingNodeId,
      source_type: readingForm.source_type,
      title: readingForm.title.trim(),
      description: readingForm.description.trim(),
      estimated_minutes: readingForm.estimated_minutes ? parseInt(readingForm.estimated_minutes) : null,
    };

    if (readingForm.source_type === 'fresh') {
      const detected = detectVideoSource(readingForm.drive_url.trim());
      payload.drive_file_id = detected?.type === 'drive' ? detected.fileId : null;
      payload.drive_url = readingForm.drive_url.trim() || null;
      payload.file_type = readingForm.file_type;
      payload.resource_id = null;
      payload.page_start = null;
      payload.page_end = null;
    } else {
      payload.drive_file_id = null;
      payload.drive_url = null;
      payload.file_type = null;
      payload.resource_id = readingForm.resource_id || null;
      payload.page_start = readingForm.page_start ? parseInt(readingForm.page_start) : null;
      payload.page_end = readingForm.page_end ? parseInt(readingForm.page_end) : null;
    }

    const { data: existing } = await supabase.from('readings').select('id').eq('node_id', readingNodeId).single();
    if (existing) {
      await supabase.from('readings').update(payload).eq('node_id', readingNodeId);
    } else {
      await supabase.from('readings').insert(payload);
    }
    setSaving(false);
    setShowReadingModal(false);
  };

  // ─── Practice / Quiz Detail ───────────────────────
  const countQuestionsFromContent = (content: any): number => {
    if (!content || !Array.isArray(content.content)) return 0;
    return content.content.filter((node: any) => {
      if (!node || !node.type) return false;
      const type = node.type;
      return (
        type.endsWith('Block') &&
        type !== 'codeBlock' &&
        type !== 'logicBlock' &&
        node.attrs?.id
      );
    }).length;
  };

  const fetchFieldtallyForms = useCallback(async () => {
    if (!fieldtallySupabase) return;
    setLoadingFieldtally(true);
    try {
      const { data: publishedForms, error: formsErr } = await fieldtallySupabase
        .from('forms')
        .select('id, status')
        .eq('status', 'published');
      
      if (formsErr) {
        console.error('Error fetching FieldTally forms:', formsErr);
        setLoadingFieldtally(false);
        return;
      }
      
      if (publishedForms && publishedForms.length > 0) {
        const publishedIds = publishedForms.map(f => f.id);
        const { data: versions, error: versionsErr } = await fieldtallySupabase
          .from('form_versions')
          .select('form_id, title, version, content')
          .in('form_id', publishedIds);
          
        if (versionsErr) {
          console.error('Error fetching FieldTally form versions:', versionsErr);
          setLoadingFieldtally(false);
          return;
        }

        if (versions) {
          const latestMap: Record<string, any> = {};
          versions.forEach((fv) => {
            const current = latestMap[fv.form_id];
            const fvVersion = Number(fv.version);
            if (!current || fvVersion > Number(current.version)) {
              latestMap[fv.form_id] = fv;
            }
          });

          const formsList = Object.keys(latestMap).map((formId) => ({
            id: formId,
            title: latestMap[formId].title || 'Untitled Form',
            version: latestMap[formId].version,
            content: latestMap[formId].content,
          }));

          setFieldtallyForms(formsList);
        }
      }
    } catch (err) {
      console.error('Failed to load FieldTally forms:', err);
    } finally {
      setLoadingFieldtally(false);
    }
  }, []);

  useEffect(() => {
    if (user && fieldtallySupabase) {
      fetchFieldtallyForms();
    }
  }, [user, fetchFieldtallyForms]);

  const handleSelectFieldtallyForm = (formId: string) => {
    if (!formId) {
      setPqForm(prev => ({
        ...prev,
        fieldtally_form_id: '',
      }));
      return;
    }
    const selected = fieldtallyForms.find(f => f.id === formId);
    if (selected) {
      const qCount = countQuestionsFromContent(selected.content);
      setPqForm(prev => ({
        ...prev,
        fieldtally_form_id: formId,
        title: prev.title.trim() === '' ? selected.title : prev.title,
        question_count: qCount,
      }));
    }
  };

  const openPQDetail = async (nodeId: string, type: 'practice' | 'quiz') => {
    setPqNodeId(nodeId);
    setPqType(type);
    const table = type === 'practice' ? 'practice_sets' : 'quizzes';
    const { data } = await supabase.from(table).select('*').eq('node_id', nodeId).single();
    if (data) {
      setPqForm({
        fieldtally_form_id: data.fieldtally_form_id || '',
        title: data.title || '',
        question_count: data.question_count || 0,
        time_limit_seconds: type === 'quiz' && data.time_limit_seconds ? data.time_limit_seconds.toString() : '',
      });
      const isMatched = fieldtallyForms.some(f => f.id === data.fieldtally_form_id);
      if (data.fieldtally_form_id && !isMatched && fieldtallySupabase) {
        setManualFormIdMode(true);
      } else {
        setManualFormIdMode(false);
      }
    } else {
      setPqForm({ fieldtally_form_id: '', title: '', question_count: 0, time_limit_seconds: '' });
      setManualFormIdMode(false);
    }
    setShowPQModal(true);
  };

  const handleSavePQ = async () => {
    if (!pqNodeId || !pqForm.fieldtally_form_id.trim()) return;
    setSaving(true);
    const table = pqType === 'practice' ? 'practice_sets' : 'quizzes';
    const payload: Record<string, unknown> = {
      node_id: pqNodeId,
      fieldtally_form_id: pqForm.fieldtally_form_id.trim(),
      title: pqForm.title.trim(),
      question_count: pqForm.question_count,
    };
    if (pqType === 'quiz') {
      payload.time_limit_seconds = pqForm.time_limit_seconds ? parseInt(pqForm.time_limit_seconds) : null;
    }
    const { data: existing } = await supabase.from(table).select('id').eq('node_id', pqNodeId).single();
    if (existing) {
      await supabase.from(table).update(payload).eq('node_id', pqNodeId);
    } else {
      await supabase.from(table).insert(payload);
    }
    setSaving(false);
    setShowPQModal(false);
  };

  // ─── Video detection badge helper ─────────────────
  const detectedVideo = lectureForm.video_url ? detectVideoSource(lectureForm.video_url) : null;

  // ─── Selected resource info (for reading reference mode) ─
  const selectedResource = readingForm.resource_id ? resources.find(r => r.id === readingForm.resource_id) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-[var(--accent-indigo)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="text-center py-20">
        <p className="text-[var(--text-secondary)]">Course not found.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => router.push('/dashboard/courses')} className="p-2 rounded-xl cursor-pointer" style={{ border: '1px solid var(--border-subtle)' }}>
          <ArrowLeft size={18} className="text-[var(--text-secondary)]" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 rounded-full" style={{ background: course.color_hex }} />
          </div>
          <h1 className="text-2xl font-bold">{course.title}</h1>
        </div>
        <button
          onClick={openCreateSection}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white cursor-pointer"
          style={{ background: 'linear-gradient(135deg, var(--accent-indigo), var(--accent-purple))' }}
        >
          <Plus size={16} /> Add Section
        </button>
      </div>

      {/* ─── Course Resources Panel ─── */}
      <div className="mb-6 rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
        <div
          className="flex items-center justify-between px-5 py-3.5 cursor-pointer"
          onClick={() => setShowResourcesPanel(!showResourcesPanel)}
        >
          <div className="flex items-center gap-3">
            {showResourcesPanel ? <ChevronUp size={16} className="text-[var(--text-muted)]" /> : <ChevronDown size={16} className="text-[var(--text-muted)]" />}
            <FolderOpen size={16} style={{ color: '#14b8a6' }} />
            <h3 className="font-semibold text-sm">Course Resources</h3>
            <span className="text-[10px] text-[var(--text-muted)] px-2 py-0.5 rounded-md" style={{ background: 'var(--bg-input)' }}>
              {resources.length} file{resources.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button onClick={openCreateResource} className="p-1.5 rounded-lg cursor-pointer" style={{ color: '#14b8a6' }} title="Add resource">
              <Plus size={15} />
            </button>
          </div>
        </div>

        {showResourcesPanel && (
          <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
            {resources.length === 0 ? (
              <div className="px-5 py-6 text-center text-xs text-[var(--text-muted)]">
                No resources yet. Upload PDFs/EPUBs that can be referenced by reading nodes.
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                {resources.map((r) => (
                  <div key={r.id} className="flex items-center justify-between px-5 py-3 group">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(20, 184, 166, 0.1)' }}>
                        <BookOpen size={14} style={{ color: '#14b8a6' }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{r.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded" style={{ background: r.file_type === 'pdf' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(168, 85, 247, 0.1)', color: r.file_type === 'pdf' ? '#ef4444' : '#a855f7' }}>
                            {r.file_type}
                          </span>
                          {r.page_count && (
                            <span className="text-[10px] text-[var(--text-muted)]">{r.page_count} pages</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEditResource(r)} className="p-1.5 rounded-lg cursor-pointer text-[var(--text-muted)]" title="Edit">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => handleDeleteResource(r.id)} className="p-1.5 rounded-lg cursor-pointer text-[var(--accent-rose)]" title="Delete">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sections + Nodes */}
      {sections.length === 0 ? (
        <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
          <GripVertical size={48} className="mx-auto text-[var(--text-muted)] mb-4" />
          <h3 className="text-lg font-semibold mb-2">No sections yet</h3>
          <p className="text-sm text-[var(--text-secondary)] mb-4">Add a section (chapter) to start building your course path.</p>
          <button onClick={openCreateSection} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white cursor-pointer" style={{ background: 'linear-gradient(135deg, var(--accent-indigo), var(--accent-purple))' }}>
            <Plus size={16} /> Add Section
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {sections.map((section) => {
            const sectionNodes = getNodesForSection(section.id);
            const isExpanded = expandedSections.has(section.id);
            return (
              <div key={section.id} className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
                {/* Section header */}
                <div className="flex items-center justify-between px-5 py-3.5 cursor-pointer" onClick={() => toggleSection(section.id)}>
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronUp size={16} className="text-[var(--text-muted)]" /> : <ChevronDown size={16} className="text-[var(--text-muted)]" />}
                    <h3 className="font-semibold text-sm">{section.title}</h3>
                    <span className="text-[10px] text-[var(--text-muted)] px-2 py-0.5 rounded-md" style={{ background: 'var(--bg-input)' }}>
                      {sectionNodes.length} node{sectionNodes.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => openEditSection(section)} className="p-1.5 rounded-lg cursor-pointer text-[var(--text-muted)]" title="Edit section">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => handleDeleteSection(section.id)} className="p-1.5 rounded-lg cursor-pointer text-[var(--accent-rose)]" title="Delete section">
                      <Trash2 size={13} />
                    </button>
                    <button onClick={() => openCreateNode(section.id)} className="p-1.5 rounded-lg cursor-pointer text-[var(--accent-indigo)]" title="Add node">
                      <Plus size={15} />
                    </button>
                  </div>
                </div>

                {/* Nodes list */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    {sectionNodes.length === 0 ? (
                      <div className="px-5 py-6 text-center text-xs text-[var(--text-muted)]">
                        No nodes in this section. Click + to add one.
                      </div>
                    ) : (
                      <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                        {sectionNodes.map((node) => {
                          const Icon = NODE_ICONS[node.type];
                          const color = NODE_COLORS[node.type];
                          return (
                            <div key={node.id} className="flex items-center justify-between px-5 py-3 group">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}15` }}>
                                  <Icon size={14} style={{ color }} />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{node.title}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color }}>{node.type}</span>
                                    {!node.is_published && (
                                      <span className="text-[10px] text-[var(--text-muted)] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-input)' }}>Draft</span>
                                    )}
                                    {node.available_from && (
                                      <span className="text-[10px] text-[var(--text-muted)]">
                                        📅 {new Date(node.available_from).toLocaleDateString()}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => {
                                    if (node.type === 'lecture') openLectureDetail(node.id);
                                    else if (node.type === 'reading') openReadingDetail(node.id);
                                    else openPQDetail(node.id, node.type as 'practice' | 'quiz');
                                  }}
                                  className="px-2 py-1 rounded-lg text-[10px] font-medium cursor-pointer"
                                  style={{ background: `${color}15`, color }}
                                >
                                  Configure
                                </button>
                                <button onClick={() => handleTogglePublish(node)} className="p-1.5 rounded-lg cursor-pointer" style={{ color: node.is_published ? 'var(--accent-emerald)' : 'var(--text-muted)' }} title={node.is_published ? 'Unpublish' : 'Publish'}>
                                  {node.is_published ? <Eye size={14} /> : <EyeOff size={14} />}
                                </button>
                                <button onClick={() => openEditNode(node)} className="p-1.5 rounded-lg cursor-pointer text-[var(--text-muted)]" title="Edit node">
                                  <Pencil size={13} />
                                </button>
                                <button onClick={() => handleDeleteNode(node.id)} className="p-1.5 rounded-lg cursor-pointer text-[var(--accent-rose)]" title="Delete node">
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Resource Modal ─── */}
      {showResourceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-md rounded-2xl p-6 animate-scale-in" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">{editResourceId ? 'Edit Resource' : 'Add Resource'}</h2>
              <button onClick={() => setShowResourceModal(false)} className="p-1 cursor-pointer text-[var(--text-muted)]"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Title</label>
                <input type="text" value={resourceForm.title} onChange={(e) => setResourceForm({ ...resourceForm, title: e.target.value })} placeholder="e.g. HC Verma Vol 1" className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">File Type</label>
                <div className="flex gap-2">
                  {(['pdf', 'epub'] as const).map((ft) => (
                    <button key={ft} onClick={() => setResourceForm({ ...resourceForm, file_type: ft })} className="flex-1 py-2.5 rounded-xl text-xs font-medium cursor-pointer transition-all" style={{ background: resourceForm.file_type === ft ? (ft === 'pdf' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(168, 85, 247, 0.1)') : 'var(--bg-input)', border: `1px solid ${resourceForm.file_type === ft ? (ft === 'pdf' ? '#ef4444' : '#a855f7') : 'var(--border-subtle)'}`, color: resourceForm.file_type === ft ? (ft === 'pdf' ? '#ef4444' : '#a855f7') : 'var(--text-secondary)' }}>
                      {ft.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Google Drive URL</label>
                <input type="text" value={resourceForm.drive_url} onChange={(e) => setResourceForm({ ...resourceForm, drive_url: e.target.value })} placeholder="Paste the Google Drive link" className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Total Pages (optional)</label>
                <input type="number" value={resourceForm.page_count} onChange={(e) => setResourceForm({ ...resourceForm, page_count: e.target.value })} placeholder="e.g. 450" className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowResourceModal(false)} className="flex-1 py-2.5 rounded-xl text-sm cursor-pointer" style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>Cancel</button>
              <button onClick={handleSaveResource} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-60" style={{ background: 'linear-gradient(135deg, #14b8a6, #0d9488)' }}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Section Modal ─── */}
      {showSectionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-md rounded-2xl p-6 animate-scale-in" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">{editSectionId ? 'Edit Section' : 'New Section'}</h2>
              <button onClick={() => setShowSectionModal(false)} className="p-1 cursor-pointer text-[var(--text-muted)]"><X size={20} /></button>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Section Title</label>
              <input type="text" value={sectionTitle} onChange={(e) => setSectionTitle(e.target.value)} placeholder="e.g. Chapter 1: Kinematics" className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowSectionModal(false)} className="flex-1 py-2.5 rounded-xl text-sm cursor-pointer" style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>Cancel</button>
              <button onClick={handleSaveSection} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-60" style={{ background: 'linear-gradient(135deg, var(--accent-indigo), var(--accent-purple))' }}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Node Modal ─── */}
      {showNodeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-md rounded-2xl p-6 animate-scale-in" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">{editNodeId ? 'Edit Node' : 'New Node'}</h2>
              <button onClick={() => setShowNodeModal(false)} className="p-1 cursor-pointer text-[var(--text-muted)]"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Title</label>
                <input type="text" value={nodeForm.title} onChange={(e) => setNodeForm({ ...nodeForm, title: e.target.value })} placeholder="e.g. Lesson 1.1: Introduction to Vectors" className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Type</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['lecture', 'practice', 'quiz', 'reading'] as const).map((t) => {
                    const Icon = NODE_ICONS[t];
                    const active = nodeForm.type === t;
                    return (
                      <button key={t} onClick={() => setNodeForm({ ...nodeForm, type: t })} className="flex flex-col items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-medium cursor-pointer transition-all" style={{ background: active ? `${NODE_COLORS[t]}15` : 'var(--bg-input)', border: `1px solid ${active ? NODE_COLORS[t] : 'var(--border-subtle)'}`, color: active ? NODE_COLORS[t] : 'var(--text-secondary)' }}>
                        <Icon size={14} /> {t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    );
                  })}
                </div>
              </div>
              {!editNodeId && sections.length > 1 && (
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Section</label>
                  <select value={nodeForm.section_id} onChange={(e) => setNodeForm({ ...nodeForm, section_id: e.target.value })} className="w-full px-4 py-2.5 rounded-xl text-sm outline-none cursor-pointer" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}>
                    {sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Schedule Availability (Optional)</label>
                <input type="datetime-local" value={nodeForm.available_from} onChange={(e) => setNodeForm({ ...nodeForm, available_from: e.target.value })} className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowNodeModal(false)} className="flex-1 py-2.5 rounded-xl text-sm cursor-pointer" style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>Cancel</button>
              <button onClick={handleSaveNode} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-60" style={{ background: 'linear-gradient(135deg, var(--accent-indigo), var(--accent-purple))' }}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Lecture Detail Modal (Simplified) ─── */}
      {showLectureModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-lg rounded-2xl p-6 animate-scale-in my-8" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">Lecture Configuration</h2>
              <button onClick={() => setShowLectureModal(false)} className="p-1 cursor-pointer text-[var(--text-muted)]"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              {/* Video URL with auto-detect badge */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Video URL</label>
                <input
                  type="text"
                  value={lectureForm.video_url}
                  onChange={(e) => setLectureForm({ ...lectureForm, video_url: e.target.value })}
                  placeholder="Paste a YouTube or Google Drive video link"
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                />
                {/* Auto-detect badge */}
                {detectedVideo && (
                  <div className="flex items-center gap-2 mt-2 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: detectedVideo.type === 'youtube' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(99, 102, 241, 0.08)' }}>
                    {detectedVideo.type === 'youtube' ? (
                      <>
                        <Video size={14} style={{ color: '#ef4444' }} />
                        <span style={{ color: '#ef4444' }}>YouTube: {detectedVideo.videoId}</span>
                      </>
                    ) : (
                      <>
                        <HardDrive size={14} style={{ color: '#6366f1' }} />
                        <span style={{ color: '#6366f1' }}>Drive: {detectedVideo.fileId.slice(0, 16)}...</span>
                      </>
                    )}
                  </div>
                )}
                {lectureForm.video_url && !detectedVideo && (
                  <p className="text-[10px] mt-1.5" style={{ color: 'var(--accent-rose)' }}>Could not detect video source. Paste a valid YouTube or Drive URL.</p>
                )}
              </div>

              {/* Segment timestamps — only for Drive */}
              {detectedVideo?.type === 'drive' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Start Segment (sec)</label>
                    <input type="text" value={lectureForm.start_timestamp_seconds} onChange={(e) => setLectureForm({ ...lectureForm, start_timestamp_seconds: e.target.value })} placeholder="0" className="w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">End Segment (sec)</label>
                    <input type="text" value={lectureForm.end_timestamp_seconds} onChange={(e) => setLectureForm({ ...lectureForm, end_timestamp_seconds: e.target.value })} placeholder="1800" className="w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Description</label>
                <textarea value={lectureForm.description} onChange={(e) => setLectureForm({ ...lectureForm, description: e.target.value })} rows={2} className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Primer Notes (shown before lecture)</label>
                <textarea value={lectureForm.primer_notes} onChange={(e) => setLectureForm({ ...lectureForm, primer_notes: e.target.value })} rows={3} placeholder="Key bullet points to review before watching..." className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowLectureModal(false)} className="flex-1 py-2.5 rounded-xl text-sm cursor-pointer" style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>Cancel</button>
              <button onClick={handleSaveLecture} disabled={saving || !detectedVideo} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-60" style={{ background: 'linear-gradient(135deg, var(--accent-indigo), var(--accent-purple))' }}>{saving ? 'Saving...' : 'Save Lecture'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Reading Detail Modal ─── */}
      {showReadingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-lg rounded-2xl p-6 animate-scale-in my-8" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">Reading Configuration</h2>
              <button onClick={() => setShowReadingModal(false)} className="p-1 cursor-pointer text-[var(--text-muted)]"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              {/* Source type toggle */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Source</label>
                <div className="flex gap-2">
                  {([['fresh', '📄 Fresh Upload'], ['reference', '📑 From Resources']] as const).map(([val, label]) => (
                    <button key={val} onClick={() => setReadingForm({ ...readingForm, source_type: val as 'fresh' | 'reference' })} className="flex-1 py-2.5 rounded-xl text-xs font-medium cursor-pointer transition-all" style={{ background: readingForm.source_type === val ? 'rgba(20, 184, 166, 0.1)' : 'var(--bg-input)', border: `1px solid ${readingForm.source_type === val ? '#14b8a6' : 'var(--border-subtle)'}`, color: readingForm.source_type === val ? '#14b8a6' : 'var(--text-secondary)' }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {readingForm.source_type === 'fresh' ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Google Drive URL</label>
                    <input type="text" value={readingForm.drive_url} onChange={(e) => setReadingForm({ ...readingForm, drive_url: e.target.value })} placeholder="Paste the Drive link to your PDF/EPUB" className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">File Type</label>
                    <div className="flex gap-2">
                      {(['pdf', 'epub'] as const).map((ft) => (
                        <button key={ft} onClick={() => setReadingForm({ ...readingForm, file_type: ft })} className="flex-1 py-2.5 rounded-xl text-xs font-medium cursor-pointer" style={{ background: readingForm.file_type === ft ? (ft === 'pdf' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(168, 85, 247, 0.1)') : 'var(--bg-input)', border: `1px solid ${readingForm.file_type === ft ? (ft === 'pdf' ? '#ef4444' : '#a855f7') : 'var(--border-subtle)'}`, color: readingForm.file_type === ft ? (ft === 'pdf' ? '#ef4444' : '#a855f7') : 'var(--text-secondary)' }}>
                          {ft.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Select Resource</label>
                    {resources.length === 0 ? (
                      <p className="text-xs text-[var(--text-muted)] py-2">No resources uploaded yet. Add resources in the panel above first.</p>
                    ) : (
                      <select value={readingForm.resource_id} onChange={(e) => setReadingForm({ ...readingForm, resource_id: e.target.value })} className="w-full px-4 py-2.5 rounded-xl text-sm outline-none cursor-pointer" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}>
                        <option value="">Select a resource...</option>
                        {resources.map((r) => (
                          <option key={r.id} value={r.id}>
                            [{r.file_type.toUpperCase()}] {r.title}{r.page_count ? ` (${r.page_count} pages)` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Page Start</label>
                      <input type="number" value={readingForm.page_start} onChange={(e) => setReadingForm({ ...readingForm, page_start: e.target.value })} placeholder="e.g. 45" className="w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Page End</label>
                      <input type="number" value={readingForm.page_end} onChange={(e) => setReadingForm({ ...readingForm, page_end: e.target.value })} placeholder="e.g. 78" className="w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
                    </div>
                  </div>
                  {selectedResource?.page_count && (
                    <p className="text-[10px] text-[var(--text-muted)]">
                      📖 {selectedResource.title} has {selectedResource.page_count} total pages
                    </p>
                  )}
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Title</label>
                <input type="text" value={readingForm.title} onChange={(e) => setReadingForm({ ...readingForm, title: e.target.value })} placeholder="Reading title" className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Description (optional)</label>
                <textarea value={readingForm.description} onChange={(e) => setReadingForm({ ...readingForm, description: e.target.value })} rows={2} className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Estimated Reading Time (minutes)</label>
                <input type="number" value={readingForm.estimated_minutes} onChange={(e) => setReadingForm({ ...readingForm, estimated_minutes: e.target.value })} placeholder="e.g. 20" className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowReadingModal(false)} className="flex-1 py-2.5 rounded-xl text-sm cursor-pointer" style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>Cancel</button>
              <button onClick={handleSaveReading} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-60" style={{ background: 'linear-gradient(135deg, #14b8a6, #0d9488)' }}>{saving ? 'Saving...' : 'Save Reading'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Practice/Quiz Detail Modal ─── */}
      {showPQModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-md rounded-2xl p-6 animate-scale-in" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">{pqType === 'practice' ? 'Practice Set' : 'Quiz'} Configuration</h2>
              <button onClick={() => setShowPQModal(false)} className="p-1 cursor-pointer text-[var(--text-muted)]"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              {fieldtallySupabase && !manualFormIdMode ? (
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-xs font-medium text-[var(--text-secondary)]">FieldTally Form</label>
                    <button
                      onClick={() => setManualFormIdMode(true)}
                      className="text-xs text-[var(--accent-indigo)] hover:underline cursor-pointer"
                    >
                      Enter ID manually
                    </button>
                  </div>
                  {loadingFieldtally ? (
                    <div className="text-xs text-[var(--text-secondary)] py-2">Loading forms...</div>
                  ) : (
                    <select
                      value={pqForm.fieldtally_form_id}
                      onChange={(e) => handleSelectFieldtallyForm(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl text-sm outline-none cursor-pointer"
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                    >
                      <option value="">Select a form...</option>
                      {fieldtallyForms.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.title} ({f.id.slice(0, 8)}...)
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ) : (
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-xs font-medium text-[var(--text-secondary)]">FieldTally Form ID</label>
                    {fieldtallySupabase && (
                      <button
                        onClick={() => setManualFormIdMode(false)}
                        className="text-xs text-[var(--accent-indigo)] hover:underline cursor-pointer"
                      >
                        Select from list
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={pqForm.fieldtally_form_id}
                    onChange={(e) => setPqForm({ ...pqForm, fieldtally_form_id: e.target.value })}
                    placeholder="e.g. form_abc123"
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Title</label>
                <input type="text" value={pqForm.title} onChange={(e) => setPqForm({ ...pqForm, title: e.target.value })} placeholder="Quiz title" className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Question Count</label>
                <input type="number" value={pqForm.question_count} onChange={(e) => setPqForm({ ...pqForm, question_count: parseInt(e.target.value) || 0 })} className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
              </div>
              {pqType === 'quiz' && (
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Time Limit (seconds, optional)</label>
                  <input type="text" value={pqForm.time_limit_seconds} onChange={(e) => setPqForm({ ...pqForm, time_limit_seconds: e.target.value })} placeholder="e.g. 1800 for 30 mins" className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowPQModal(false)} className="flex-1 py-2.5 rounded-xl text-sm cursor-pointer" style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>Cancel</button>
              <button onClick={handleSavePQ} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-60" style={{ background: 'linear-gradient(135deg, var(--accent-indigo), var(--accent-purple))' }}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
