/**
 * @file types.ts
 * @description Shared TypeScript type definitions and interfaces for the Stuarc tutoring system.
 * These types mirror the database schema and represent key models used across the Admin panel and Mobile app.
 */

export type UserRole = 'teacher' | 'student';

export interface User {
  id: string; // references auth.users.id
  email: string;
  role: UserRole;
  name: string;
  teacher_id: string | null; // null for teachers, set for students
  invite_code: string | null; // unique code on teacher's profile
  created_at: string;
}

export interface Course {
  id: string;
  title: string;
  subject: string;
  description: string;
  color_hex: string;
  cover_image_url: string | null;
  order_index: number;
  teacher_id: string;
  created_at: string;
}

export interface Section {
  id: string;
  course_id: string;
  title: string;
  order_index: number;
}

export type NodeType = 'lecture' | 'practice' | 'quiz';

export interface Node {
  id: string;
  section_id: string;
  course_id: string;
  title: string;
  type: NodeType;
  order_index: number;
  is_published: boolean;
  available_from: string | null;
  created_at: string;
}

export interface Lecture {
  id: string;
  node_id: string;
  drive_file_id: string;
  drive_url: string;
  duration_seconds: number;
  start_timestamp_seconds: number | null;
  end_timestamp_seconds: number | null;
  thumbnail_url: string | null;
  description: string;
  primer_notes: string | null;
}

export interface PracticeSet {
  id: string;
  node_id: string;
  fieldtally_form_id: string;
  title: string;
  question_count: number;
}

export interface Quiz {
  id: string;
  node_id: string;
  fieldtally_form_id: string;
  title: string;
  time_limit_seconds: number | null;
  question_count: number;
}

export interface ConceptNote {
  id: string;
  node_id: string | null;
  course_id: string;
  teacher_id: string;
  title: string;
  content_markdown: string;
  attachment_drive_url: string | null;
  order_index: number;
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed';

export interface Task {
  id: string;
  student_id: string;
  node_id: string;
  due_date: string; // ISO date string (YYYY-MM-DD)
  assigned_at: string;
  status: TaskStatus;
  completed_at: string | null;
}

export interface NodeCompletion {
  id: string;
  student_id: string;
  node_id: string;
  completed_at: string;
  // Lecture completions
  understanding_rating: number | null; // 1-5
  enjoyment_rating: number | null; // 1-5
  reflection_text: string | null;
  // Quiz/Practice completions
  score: number | null;
  max_score: number | null;
  time_spent_seconds: number | null;
}

export type SessionLogEventType = 'lecture_watch' | 'practice_attempt' | 'quiz_attempt' | 'note_read';

export interface SessionLog {
  id: string;
  student_id: string;
  node_id: string;
  session_start: string;
  session_end: string;
  seconds_spent: number;
  event_type: SessionLogEventType;
}

export interface QuizResponse {
  id: string;
  student_id: string;
  quiz_id: string;
  fieldtally_submission_id: string;
  submitted_at: string;
  score: number;
  max_score: number;
  answers: Record<string, unknown>;
  wrong_question_ids: string[];
}

export interface ConfusionFlag {
  id: string;
  student_id: string;
  node_id: string;
  flagged_at: string;
  description: string;
  is_resolved: boolean;
  resolved_at: string | null;
  admin_response: string | null;
}

export type DownloadAssetType = 'video' | 'pdf' | 'note';
export type DownloadStatus = 'queued' | 'downloading' | 'completed' | 'failed';

export interface Download {
  id: string;
  student_id: string;
  node_id: string;
  drive_file_id: string;
  asset_type: DownloadAssetType;
  asset_url: string;
  local_path: string | null;
  file_size_bytes: number;
  downloaded_bytes: number;
  status: DownloadStatus;
  started_at: string | null;
  completed_at: string | null;
}

export type WeakConceptReason = 'low_quiz_score' | 'confusion_flag' | 'low_understanding_rating';

export interface WeakConcept {
  id: string;
  student_id: string;
  node_id: string;
  reason: WeakConceptReason;
  score_average: number | null;
  attempts: number;
  last_updated: string;
}

export interface Streak {
  id: string;
  student_id: string;
  current_streak: number;
  longest_streak: number;
  last_active_date: string | null; // ISO date string (YYYY-MM-DD)
}
