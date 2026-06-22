-- Enable UUID generation extension
create extension if not exists "uuid-ossp";

-- 1. USERS TABLE
create table public.users (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  role text not null constraint check_role check (role in ('teacher', 'student')),
  name text not null default '',
  teacher_id uuid references public.users(id) on delete set null,
  invite_code text unique,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Helper function to get current student's teacher id (bypasses RLS recursion)
create or replace function public.get_my_teacher_id()
returns uuid as $$
  select teacher_id from public.users where id = auth.uid();
$$ language sql security definer;

-- Index for fast user/teacher lookups
create index users_teacher_id_idx on public.users(teacher_id);
create index users_invite_code_idx on public.users(invite_code);

-- Enable RLS on users
alter table public.users enable row level security;

-- RLS Policies for users
create policy "Users can read their own profile" 
  on public.users for select 
  using (auth.uid() = id);

create policy "Teachers can read profiles of their students" 
  on public.users for select 
  using (
    auth.uid() = id
    or teacher_id = auth.uid()
  );

create policy "Students can read their teacher's profile" 
  on public.users for select 
  using (
    id = public.get_my_teacher_id()
  );

create policy "Users can update their own profile fields" 
  on public.users for update 
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 2. COURSES TABLE
create table public.courses (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  subject text not null,
  description text not null default '',
  color_hex text not null default '#4F46E5',
  cover_image_url text,
  order_index integer not null default 0,
  teacher_id uuid references public.users(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index courses_teacher_id_idx on public.courses(teacher_id);

alter table public.courses enable row level security;

create policy "Teachers can CRUD their own courses" 
  on public.courses for all 
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

create policy "Students can read their teacher's courses" 
  on public.courses for select 
  using (
    teacher_id = public.get_my_teacher_id()
  );

-- 3. SECTIONS TABLE
create table public.sections (
  id uuid default gen_random_uuid() primary key,
  course_id uuid references public.courses(id) on delete cascade not null,
  title text not null,
  order_index integer not null default 0
);

create index sections_course_id_idx on public.sections(course_id);

alter table public.sections enable row level security;

create policy "Teachers can CRUD sections for their courses" 
  on public.sections for all 
  using (
    exists (
      select 1 from public.courses 
      where id = sections.course_id and teacher_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.courses 
      where id = sections.course_id and teacher_id = auth.uid()
    )
  );

create policy "Students can read sections in courses they access" 
  on public.sections for select 
  using (
    exists (
      select 1 from public.courses 
      where id = sections.course_id 
      and teacher_id = public.get_my_teacher_id()
    )
  );

-- 4. NODES TABLE (Duolingo-style path node)
create table public.nodes (
  id uuid default gen_random_uuid() primary key,
  section_id uuid references public.sections(id) on delete cascade not null,
  course_id uuid references public.courses(id) on delete cascade not null,
  title text not null,
  type text not null constraint check_node_type check (type in ('lecture', 'practice', 'quiz')),
  order_index integer not null default 0,
  is_published boolean not null default false,
  available_from timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index nodes_section_id_idx on public.nodes(section_id);
create index nodes_course_id_idx on public.nodes(course_id);

alter table public.nodes enable row level security;

create policy "Teachers can CRUD nodes for their courses" 
  on public.nodes for all 
  using (
    exists (
      select 1 from public.courses 
      where id = nodes.course_id and teacher_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.courses 
      where id = nodes.course_id and teacher_id = auth.uid()
    )
  );

create policy "Students can read published, available nodes in their courses" 
  on public.nodes for select 
  using (
    is_published = true 
    and (available_from is null or available_from <= now())
    and exists (
      select 1 from public.courses 
      where id = nodes.course_id 
      and teacher_id = public.get_my_teacher_id()
    )
  );

-- 5. LECTURES TABLE
create table public.lectures (
  id uuid default gen_random_uuid() primary key,
  node_id uuid references public.nodes(id) on delete cascade unique not null,
  drive_file_id text not null,
  drive_url text not null,
  duration_seconds integer not null default 0,
  start_timestamp_seconds integer,
  end_timestamp_seconds integer,
  thumbnail_url text,
  description text not null default '',
  primer_notes text
);

create index lectures_node_id_idx on public.lectures(node_id);

alter table public.lectures enable row level security;

create policy "Teachers can CRUD lectures on their nodes" 
  on public.lectures for all 
  using (
    exists (
      select 1 from public.nodes n
      join public.courses c on n.course_id = c.id
      where n.id = lectures.node_id and c.teacher_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.nodes n
      join public.courses c on n.course_id = c.id
      where n.id = lectures.node_id and c.teacher_id = auth.uid()
    )
  );

create policy "Students can view lectures for active nodes" 
  on public.lectures for select 
  using (
    exists (
      select 1 from public.nodes n
      where n.id = lectures.node_id
    )
  );

-- 6. PRACTICE SETS TABLE
create table public.practice_sets (
  id uuid default gen_random_uuid() primary key,
  node_id uuid references public.nodes(id) on delete cascade unique not null,
  fieldtally_form_id text not null,
  title text not null,
  question_count integer not null default 0
);

create index practice_sets_node_id_idx on public.practice_sets(node_id);

alter table public.practice_sets enable row level security;

create policy "Teachers can CRUD practice sets on their nodes" 
  on public.practice_sets for all 
  using (
    exists (
      select 1 from public.nodes n
      join public.courses c on n.course_id = c.id
      where n.id = practice_sets.node_id and c.teacher_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.nodes n
      join public.courses c on n.course_id = c.id
      where n.id = practice_sets.node_id and c.teacher_id = auth.uid()
    )
  );

create policy "Students can view practice sets for active nodes" 
  on public.practice_sets for select 
  using (
    exists (
      select 1 from public.nodes n
      where n.id = practice_sets.node_id
    )
  );

-- 7. QUIZZES TABLE
create table public.quizzes (
  id uuid default gen_random_uuid() primary key,
  node_id uuid references public.nodes(id) on delete cascade unique not null,
  fieldtally_form_id text not null,
  title text not null,
  time_limit_seconds integer,
  question_count integer not null default 0
);

create index quizzes_node_id_idx on public.quizzes(node_id);

alter table public.quizzes enable row level security;

create policy "Teachers can CRUD quizzes on their nodes" 
  on public.quizzes for all 
  using (
    exists (
      select 1 from public.nodes n
      join public.courses c on n.course_id = c.id
      where n.id = quizzes.node_id and c.teacher_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.nodes n
      join public.courses c on n.course_id = c.id
      where n.id = quizzes.node_id and c.teacher_id = auth.uid()
    )
  );

create policy "Students can view quizzes for active nodes" 
  on public.quizzes for select 
  using (
    exists (
      select 1 from public.nodes n
      where n.id = quizzes.node_id
    )
  );

-- 8. CONCEPT NOTES TABLE
create table public.concept_notes (
  id uuid default gen_random_uuid() primary key,
  node_id uuid references public.nodes(id) on delete set null,
  course_id uuid references public.courses(id) on delete cascade not null,
  teacher_id uuid references public.users(id) on delete cascade not null,
  title text not null,
  content_markdown text not null default '',
  attachment_drive_url text,
  order_index integer not null default 0
);

create index concept_notes_node_id_idx on public.concept_notes(node_id);
create index concept_notes_course_id_idx on public.concept_notes(course_id);
create index concept_notes_teacher_id_idx on public.concept_notes(teacher_id);

alter table public.concept_notes enable row level security;

create policy "Teachers can CRUD their own concept notes" 
  on public.concept_notes for all 
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

create policy "Students can read their teacher's concept notes" 
  on public.concept_notes for select 
  using (
    teacher_id = public.get_my_teacher_id()
  );

-- 9. TASKS TABLE (Daily tasks feed)
create table public.tasks (
  id uuid default gen_random_uuid() primary key,
  student_id uuid references public.users(id) on delete cascade not null,
  node_id uuid references public.nodes(id) on delete cascade not null,
  due_date date not null,
  assigned_at timestamp with time zone default timezone('utc'::text, now()) not null,
  status text not null default 'pending' constraint check_task_status check (status in ('pending', 'in_progress', 'completed')),
  completed_at timestamp with time zone
);

create index tasks_student_id_idx on public.tasks(student_id);
create index tasks_node_id_idx on public.tasks(node_id);
create index tasks_due_date_idx on public.tasks(due_date);

alter table public.tasks enable row level security;

create policy "Students can read/update their own tasks" 
  on public.tasks for all 
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

create policy "Teachers can CRUD tasks for their students" 
  on public.tasks for all 
  using (
    exists (
      select 1 from public.users student
      where student.id = tasks.student_id and student.teacher_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.users student
      where student.id = tasks.student_id and student.teacher_id = auth.uid()
    )
  );

-- 10. NODE COMPLETIONS TABLE
create table public.node_completions (
  id uuid default gen_random_uuid() primary key,
  student_id uuid references public.users(id) on delete cascade not null,
  node_id uuid references public.nodes(id) on delete cascade not null,
  completed_at timestamp with time zone default timezone('utc'::text, now()) not null,
  -- Lecture completion feedback
  understanding_rating integer constraint check_understanding check (understanding_rating between 1 and 5),
  enjoyment_rating integer constraint check_enjoyment check (enjoyment_rating between 1 and 5),
  reflection_text text,
  -- Quiz/Practice details
  score integer,
  max_score integer,
  time_spent_seconds integer,
  
  constraint unique_student_node_completion unique (student_id, node_id)
);

create index node_completions_student_id_idx on public.node_completions(student_id);
create index node_completions_node_id_idx on public.node_completions(node_id);

alter table public.node_completions enable row level security;

create policy "Students can CRUD their own completions" 
  on public.node_completions for all 
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

create policy "Teachers can view their students' completions" 
  on public.node_completions for select 
  using (
    exists (
      select 1 from public.users student
      where student.id = node_completions.student_id and student.teacher_id = auth.uid()
    )
  );

-- 11. SESSION LOGS TABLE (For granular time tracking)
create table public.session_logs (
  id uuid default gen_random_uuid() primary key,
  student_id uuid references public.users(id) on delete cascade not null,
  node_id uuid references public.nodes(id) on delete cascade not null,
  session_start timestamp with time zone not null,
  session_end timestamp with time zone not null,
  seconds_spent integer not null,
  event_type text not null constraint check_event_type check (event_type in ('lecture_watch', 'practice_attempt', 'quiz_attempt', 'note_read'))
);

create index session_logs_student_id_idx on public.session_logs(student_id);
create index session_logs_node_id_idx on public.session_logs(node_id);

alter table public.session_logs enable row level security;

create policy "Students can CRUD their own session logs" 
  on public.session_logs for all 
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

create policy "Teachers can view their students' session logs" 
  on public.session_logs for select 
  using (
    exists (
      select 1 from public.users student
      where student.id = session_logs.student_id and student.teacher_id = auth.uid()
    )
  );

-- 12. QUIZ RESPONSES TABLE
create table public.quiz_responses (
  id uuid default gen_random_uuid() primary key,
  student_id uuid references public.users(id) on delete cascade not null,
  quiz_id uuid not null, -- references quizzes(id) or practice_sets(id) depending on type
  fieldtally_submission_id text unique not null,
  submitted_at timestamp with time zone default timezone('utc'::text, now()) not null,
  score integer not null,
  max_score integer not null,
  answers jsonb not null default '{}'::jsonb,
  wrong_question_ids jsonb not null default '[]'::jsonb
);

create index quiz_responses_student_id_idx on public.quiz_responses(student_id);

alter table public.quiz_responses enable row level security;

create policy "Students can read their own quiz responses" 
  on public.quiz_responses for select 
  using (student_id = auth.uid());

create policy "Students can insert their own quiz responses" 
  on public.quiz_responses for insert 
  with check (student_id = auth.uid());

create policy "Teachers can view their students' quiz responses" 
  on public.quiz_responses for select 
  using (
    exists (
      select 1 from public.users student
      where student.id = quiz_responses.student_id and student.teacher_id = auth.uid()
    )
  );

-- 13. CONFUSION FLAGS TABLE
create table public.confusion_flags (
  id uuid default gen_random_uuid() primary key,
  student_id uuid references public.users(id) on delete cascade not null,
  node_id uuid references public.nodes(id) on delete cascade not null,
  flagged_at timestamp with time zone default timezone('utc'::text, now()) not null,
  description text not null,
  is_resolved boolean not null default false,
  resolved_at timestamp with time zone,
  admin_response text
);

create index confusion_flags_student_id_idx on public.confusion_flags(student_id);
create index confusion_flags_node_id_idx on public.confusion_flags(node_id);

alter table public.confusion_flags enable row level security;

create policy "Students can CRUD their own confusion flags" 
  on public.confusion_flags for all 
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

create policy "Teachers can view and update confusion flags for their students" 
  on public.confusion_flags for all 
  using (
    exists (
      select 1 from public.users student
      where student.id = confusion_flags.student_id and student.teacher_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.users student
      where student.id = confusion_flags.student_id and student.teacher_id = auth.uid()
    )
  );

-- 14. DOWNLOADS TABLE
create table public.downloads (
  id uuid default gen_random_uuid() primary key,
  student_id uuid references public.users(id) on delete cascade not null,
  node_id uuid references public.nodes(id) on delete cascade not null,
  drive_file_id text not null,
  asset_type text not null constraint check_asset_type check (asset_type in ('video', 'pdf', 'note')),
  asset_url text not null,
  local_path text,
  file_size_bytes bigint not null default 0,
  downloaded_bytes bigint not null default 0,
  status text not null default 'queued' constraint check_download_status check (status in ('queued', 'downloading', 'completed', 'failed')),
  started_at timestamp with time zone,
  completed_at timestamp with time zone
);

create index downloads_student_id_idx on public.downloads(student_id);
create index downloads_node_id_idx on public.downloads(node_id);
create index downloads_drive_file_id_idx on public.downloads(drive_file_id);

alter table public.downloads enable row level security;

create policy "Students can CRUD their own downloads" 
  on public.downloads for all 
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

create policy "Teachers can read downloads status of their students" 
  on public.downloads for select 
  using (
    exists (
      select 1 from public.users student
      where student.id = downloads.student_id and student.teacher_id = auth.uid()
    )
  );

-- 15. WEAK CONCEPTS TABLE
create table public.weak_concepts (
  id uuid default gen_random_uuid() primary key,
  student_id uuid references public.users(id) on delete cascade not null,
  node_id uuid references public.nodes(id) on delete cascade not null,
  reason text not null constraint check_weak_reason check (reason in ('low_quiz_score', 'confusion_flag', 'low_understanding_rating')),
  score_average double precision,
  attempts integer not null default 1,
  last_updated timestamp with time zone default timezone('utc'::text, now()) not null,
  
  constraint unique_student_node_weak unique (student_id, node_id)
);

create index weak_concepts_student_id_idx on public.weak_concepts(student_id);
create index weak_concepts_node_id_idx on public.weak_concepts(node_id);

alter table public.weak_concepts enable row level security;

create policy "Students can read their own weak concepts" 
  on public.weak_concepts for select 
  using (student_id = auth.uid());

create policy "Teachers can view their students' weak concepts" 
  on public.weak_concepts for select 
  using (
    exists (
      select 1 from public.users student
      where student.id = weak_concepts.student_id and student.teacher_id = auth.uid()
    )
  );

-- 16. STREAKS TABLE
create table public.streaks (
  id uuid default gen_random_uuid() primary key,
  student_id uuid references public.users(id) on delete cascade unique not null,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_active_date date
);

create index streaks_student_id_idx on public.streaks(student_id);

alter table public.streaks enable row level security;

create policy "Students can read their own streaks" 
  on public.streaks for select 
  using (student_id = auth.uid());

create policy "Teachers can view their students' streaks" 
  on public.streaks for select 
  using (
    exists (
      select 1 from public.users student
      where student.id = streaks.student_id and student.teacher_id = auth.uid()
    )
  );


-- ==========================================
-- AUTOMATION & SECURITY DEFINER FUNCTIONS
-- ==========================================

-- A. Auto-create user profile from Auth.users
create or replace function public.handle_new_user()
returns trigger as $$
declare
  default_role text;
  gen_invite_code text;
  code_exists boolean;
begin
  -- Extract role from user metadata, default to 'student'
  default_role := coalesce(new.raw_user_meta_data->>'role', 'student');
  
  if default_role = 'teacher' then
    -- Generate an uppercase unique alphanumeric invite code
    loop
      gen_invite_code := upper(substring(md5(random()::text) from 1 for 6));
      select exists(select 1 from public.users where invite_code = gen_invite_code) into code_exists;
      if not code_exists then
        exit;
      end if;
    end loop;
  else
    gen_invite_code := null;
  end if;

  insert into public.users (id, email, role, name, invite_code)
  values (
    new.id,
    new.email,
    default_role,
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', ''),
    gen_invite_code
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to execute profile creation on signup
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- B. Secure student linkage using invite code
create or replace function public.link_student_to_teacher(invite_code_input text)
returns json as $$
declare
  target_teacher_id uuid;
begin
  -- Find the teacher associated with the invite code
  select id into target_teacher_id
  from public.users
  where invite_code = upper(invite_code_input) and role = 'teacher';

  if target_teacher_id is null then
    return json_build_object('success', false, 'message', 'Invalid invite code.');
  end if;

  -- Link the student to this teacher and assign role = 'student'
  update public.users
  set teacher_id = target_teacher_id,
      role = 'student'
  where id = auth.uid();

  return json_build_object('success', true, 'teacher_id', target_teacher_id);
end;
$$ language plpgsql security definer;
