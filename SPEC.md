# Tutoring App — Full Build Specification
*For Vivek's sister | Class 11 | Built with React Native + Expo + Supabase + Next.js Admin*

---

## 0. Project Overview

A private mobile learning app for students, with a paired web-based admin panel for teachers. Each teacher creates their own courses and content, assigns tasks to their students, and monitors progress. Students link to a teacher via a short invite code on first launch. Multiple teachers can use the platform independently — each teacher's content and students are fully isolated from others.

**Two surfaces:**
- **Mobile app** (React Native + Expo) — student-facing
- **Admin panel** (Next.js web app) — teacher-facing, same Supabase backend

**Core philosophy:** Build the full backend, data model, and logic first. UI polish comes later. Every feature should be wired to real data from day one.

---

## 1. Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Mobile app | React Native + Expo (SDK 51+) | Offline support, background downloads, file system access |
| Admin panel | Next.js 14 (App Router) | Fast to build, same Supabase backend, deploy on Vercel |
| Backend / DB | Supabase | Auth, Postgres DB, file storage, row-level security |
| Offline storage | expo-sqlite + expo-file-system | SQLite for structured data, file system for videos/PDFs |
| Background downloads | expo-background-fetch + expo-file-system | Triggers downloads when app is closed |
| State management | Zustand | Lightweight, works cleanly with offline-first patterns |
| Video playback | expo-av | Native video player, supports partial file playback |
| Drive integration | Google Drive API (service account) | Authenticated video downloads, no user OAuth needed |

---

## 2. Database Schema (Supabase / Postgres)

### `users`
```
id uuid PK
email text
role text        -- 'teacher' | 'student'
name text
teacher_id uuid FK → users   -- null for teachers, set for students (links student to their teacher)
invite_code text             -- set on teacher's row only, e.g. "VIVEK42". Student enters this on first launch.
created_at timestamp
```

**Invite code flow:**
1. Teacher signs up via admin panel → a short unique invite code is auto-generated and shown in their settings (e.g. "VIVEK42")
2. Student opens the app for the first time → enters the invite code
3. App looks up the teacher by `invite_code`, sets `student.teacher_id = teacher.id`
4. All subsequent queries are scoped to that teacher's content via RLS

A student can only be linked to one teacher. Invite codes don't expire — the teacher can share their code freely with all their students.

### `courses`
```
id uuid PK
title text
subject text         -- e.g. 'Physics', 'Chemistry', 'Mathematics'
description text
color_hex text       -- for UI differentiation per course
cover_image_url text -- Drive link
order_index int      -- for display ordering
teacher_id uuid FK → users   -- the teacher who owns this course
created_at timestamp
```

### `sections`
```
id uuid PK
course_id uuid FK → courses
title text           -- chapter name, shown as section label on path
order_index int
```

### `nodes`  ← core content unit on the Duolingo-style path
```
id uuid PK
section_id uuid FK → sections
course_id uuid FK → courses
title text
type text            -- 'lecture' | 'practice' | 'quiz'
order_index int      -- position within section
is_published bool    -- false = invisible to student
available_from timestamp  -- content scheduling (null = available immediately)
created_at timestamp
```

### `lectures`
```
id uuid PK
node_id uuid FK → nodes
drive_file_id text             -- Google Drive file ID for video
drive_url text                 -- full Drive download URL
duration_seconds int           -- full video duration
start_timestamp_seconds int    -- null = start of video. Player seeks here on open.
end_timestamp_seconds int      -- null = end of video. Player stops and prompts completion here.
thumbnail_url text             -- Drive link to thumbnail image
description text
primer_notes text              -- pre-lecture bullet points written by teacher
```

**Timestamp / segment notes:**
- One Drive video can back multiple lecture nodes, each with different start/end timestamps
- The full video file downloads once to the device. Multiple nodes sharing the same `drive_file_id` all reference the same local file — deduplication happens by checking `drive_file_id` before queuing a new download
- The player's progress bar shows only the segment window (start → end), not the full video timeline
- `duration_seconds` reflects the full video; segment length = `end_timestamp_seconds - start_timestamp_seconds`

### `practice_sets`  ← imported from FieldTally
```
id uuid PK
node_id uuid FK → nodes
fieldtally_form_id text   -- reference to FieldTally project form
title text
question_count int
```

### `quizzes`        ← imported from FieldTally
```
id uuid PK
node_id uuid FK → nodes
fieldtally_form_id text
title text
time_limit_seconds int  -- null = untimed
question_count int
```
- FieldTally's API gives you the question data (JSON format) — you fetch the form structure and render it natively in the app
- Each question gets its own full screen, with Next / Previous buttons and a progress indicator at the top (e.g. "3 / 10")
- On the last question, "Next" becomes "Submit"
- Answers are stored locally as the student moves through, submitted all at once at the end
- For timed quizzes, the countdown lives at the top of the screen across all questions

### `concept_notes`
```
id uuid PK
node_id uuid FK → nodes  -- null if standalone
course_id uuid FK → courses
teacher_id uuid FK → users
title text
content_markdown text
attachment_drive_url text  -- optional Drive link to a PDF attachment
order_index int
```

### `tasks`          ← daily task feed
```
id uuid PK
student_id uuid FK → users
node_id uuid FK → nodes
due_date date
assigned_at timestamp
status text          -- 'pending' | 'in_progress' | 'completed'
completed_at timestamp
```

### `node_completions`
```
id uuid PK
student_id uuid FK → users
node_id uuid FK → nodes
completed_at timestamp
-- For lectures:
understanding_rating int   -- 1-5
enjoyment_rating int       -- 1-5
reflection_text text       -- post-lecture one-line reflection
-- For quizzes/practice:
score int
max_score int
time_spent_seconds int
```

### `session_logs`   ← granular time tracking
```
id uuid PK
student_id uuid FK → users
node_id uuid FK → nodes
session_start timestamp
session_end timestamp
seconds_spent int
event_type text    -- 'lecture_watch' | 'practice_attempt' | 'quiz_attempt' | 'note_read'
```

### `quiz_responses`
```
id uuid PK
student_id uuid FK → users
quiz_id uuid FK → quizzes / practice_sets
fieldtally_submission_id text
submitted_at timestamp
score int
max_score int
answers jsonb        -- raw answer data from FieldTally
wrong_question_ids jsonb  -- array of question IDs answered incorrectly
```

### `confusion_flags`
```
id uuid PK
student_id uuid FK → users
node_id uuid FK → nodes
flagged_at timestamp
description text     -- her short description of what's confusing
is_resolved bool
resolved_at timestamp
admin_response text
```

### `downloads`      ← tracks offline download state
```
id uuid PK
student_id uuid FK → users
node_id uuid FK → nodes
drive_file_id text   -- used for deduplication: if another node shares this file ID, reuse the local file
asset_type text      -- 'video' | 'pdf' | 'note'
asset_url text       -- Drive download URL
local_path text      -- path on device file system
file_size_bytes bigint
downloaded_bytes bigint
status text          -- 'queued' | 'downloading' | 'completed' | 'failed'
started_at timestamp
completed_at timestamp
```

### `weak_concepts`  ← derived / maintained by app logic
```
id uuid PK
student_id uuid FK → users
node_id uuid FK → nodes
reason text          -- 'low_quiz_score' | 'confusion_flag' | 'low_understanding_rating'
score_average float
attempts int
last_updated timestamp
```

### `streaks`
```
id uuid PK
student_id uuid FK → users
current_streak int
longest_streak int
last_active_date date
```

---

## 3. Google Drive Integration (Service Account)

### Setup (one-time)
1. Create a Google Cloud project
2. Enable Google Drive API
3. Create a Service Account, download the JSON key
4. Store the key securely in Supabase secrets or your admin panel env
5. For every video Vivek uploads to Drive: share the file with the service account email (e.g. `tutor-app@your-project.iam.gserviceaccount.com`)

### Download URL pattern
For files under ~100MB:
```
https://drive.google.com/uc?export=download&id=FILE_ID
```

For files over 100MB (most lecture videos), use the Drive API with service account auth:
```
GET https://www.googleapis.com/drive/v3/files/{fileId}?alt=media
Authorization: Bearer {service_account_access_token}
```

The mobile app hits a Supabase Edge Function that generates a short-lived signed download URL using the service account. The app then downloads from that URL directly. This keeps the service account credentials off the device.

### Supabase Edge Function: `get-drive-download-url`
- Input: `{ file_id: string, node_id: string }`
- Authenticates with service account
- Returns a short-lived signed URL (or streams the download URL)
- Mobile app uses this URL with expo-file-system to download

---

## 4. Background Download System

### How it works
1. App boots or receives a push notification (new content available)
2. App fetches newly published/available nodes from Supabase
3. For each node with downloadable assets (video, PDF), creates a `downloads` row with status `queued`
4. `expo-background-fetch` runs every 15 minutes (minimum interval iOS/Android allow), picks up queued downloads, and starts them
5. `expo-file-system.createDownloadResumable` handles the actual download with progress callbacks
6. Progress is written to the `downloads` table in real-time (or cached locally and synced)
7. App UI reads download status from the local SQLite mirror of the `downloads` table

### Download quality
All videos downloaded at 720p. When uploading to Drive, Vivek saves the 720p export. No in-app quality switching needed.

### Student-facing download UI
- On each node card: show a download indicator
  - `[↓ Queue]` — not yet downloaded
  - `[↓ 47%]` — currently downloading (progress bar)
  - `[✓ Offline]` — fully downloaded
- Tapping a lecture during download streams it from partial file via `expo-av` (works natively)
- In Settings: "Storage" screen shows list of downloaded files with sizes and a delete button per file, plus total storage used

### Manual delete
- Long-press on node card → "Delete download" option
- Settings → Storage → list of all downloads → swipe to delete or tap trash icon

### Auto-trigger on new content
When Vivek publishes a new node from the admin panel, a Supabase database trigger fires a webhook → Expo push notification to student's device → app wakes up and queues the new download.

---

## 5. Mobile App — 4 Tabs

### Tab 1: Home (Today's Tasks)

**Purpose:** A clear daily checklist. No decision fatigue — she sees exactly what to do today.

**Layout:**
- Top: greeting + current streak badge ("🔥 12 days")
- Date header (e.g. "Today, Tuesday 3 June")
- Scrollable list of today's tasks, each showing:
  - Node type icon (lecture / practice / quiz)
  - Title
  - Course tag (color-coded)
  - Status pill (Pending / In Progress / Done)
  - Download indicator for lectures
- Bottom: "Upcoming" collapsed section showing next 2-3 days' tasks

**Task completion flows:**

*Lecture task:*
1. Student taps → opens lecture player
2. Status auto-changes to "In Progress"
3. On closing player, if she's watched >80% → prompt: "Mark as complete?"
4. Completion modal: two sliders (1-5) for Understanding and Enjoyment + one text input: "What's one thing you learned?" (optional but encouraged)
5. On confirm → status = completed, ratings + reflection saved to `node_completions`

*Practice/Quiz task:*
1. Student taps → opens FieldTally form embed
2. On form submission webhook received → status = completed, score saved to `quiz_responses` + `node_completions`

**Weekly view toggle:**
A small "Week" button at top-right toggles to a 7-day calendar strip showing days with tasks and completion color (gray = nothing, amber = pending, green = done).

---

### Tab 2: Course Paths

**Purpose:** Visual representation of the full syllabus per course, as a Duolingo-style vertical path.

**Layout:**
- Top: horizontal scrollable course selector buttons (Physics | Chemistry | Maths | ...)
- Below: vertical scrollable path for the selected course

**Path structure:**
- Nodes are arranged vertically, connected by a thread/line
- Nodes alternate left-center-right slightly to give a winding path feel (like Duolingo)
- Sections (chapters) are shown as section header labels between groups of nodes
- Each node is a circle/pill showing:
  - Icon for type (play = lecture, pencil = practice, trophy = quiz)
  - Title on hover/tap
  - State: locked (gray), available (colored), completed (filled/checkmark), in-progress
- Tapping a node that's available opens the content directly
- Locked nodes show a lock icon and are grayed out (future scheduled content)

**Node states:**
- `locked` — `available_from` is in the future or `is_published = false`
- `available` — published, past available_from, not yet started
- `in_progress` — has an open session log
- `completed` — has a `node_completions` record

**Section labels:**
Displayed as a banner/divider between groups of nodes showing the chapter name (from `sections.title`).

---

### Tab 3: Gym (Weak Concepts)

**Purpose:** A dedicated space for revisiting areas where she's struggling. Surfaces automatically based on data.

**What populates the Gym:**
- Nodes where quiz/practice score average < 60%
- Nodes she has flagged with the "I'm confused" button
- Lectures she rated Understanding < 3
- Nodes where she has multiple wrong answers on the same questions

**Layout:**
- Three sections:
  1. **Revisit lectures** — lecture nodes she should rewatch, sorted by how recently flagged
  2. **Retry practice** — practice/quiz nodes with low scores, showing her last score and attempt count
  3. **Flagged confusions** — her open confusion flags with the description she wrote, and Vivek's response if any

**Gym logic (background job):**
After every quiz submission and every lecture completion:
- Recalculate `weak_concepts` for affected nodes
- Insert/update/remove records accordingly
- If a concept has been retried with score > 80% twice, remove from Gym

---

### Tab 4: Analytics

**Purpose:** Her progress at a glance. Motivating, not overwhelming.

**Sections:**

1. **Streak block** — current streak, longest streak, last 7 days activity dots (green = studied, gray = missed)

2. **Course progress** — per course: progress bar showing % of nodes completed, e.g. "Physics: 14/42 nodes"

3. **Score trends** — per course: a small line chart of her last 5-10 quiz scores, so she can see improvement

4. **Weekly summary** — "This week: X lectures watched, Y quizzes taken, Z hours studied"

5. **Error log** — collapsible section: questions she got wrong most frequently, grouped by concept/node

---

## 6. Lecture Player

Built with `expo-av`. Opens as a full-screen modal over the tab navigation.

**Features:**
- If video is fully downloaded: plays from local file
- If video is being downloaded: plays from partial file (progressive) + shows "Downloading..." banner
- If video is not downloaded + offline: shows "Not available offline" message
- If video is not downloaded + online: streams directly from Drive URL (fallback)
- Resume from last position: `session_logs` stores timestamp; player resumes from there on reopen
- Bookmarks: long-press anywhere on progress bar → adds a bookmark with an optional short text note
- "I'm confused" button (? icon in top corner): opens a small text input → saves to `confusion_flags`
- Pre-lecture primer: shown as a bottom sheet before video starts if `lectures.primer_notes` is set. She can dismiss it.
- Session logging: every 30 seconds, update `session_logs` with current watch position

---

## 7. FieldTally Integration

### How it works
- Vivek creates a FieldTally project specifically for this tutoring setup
- Under that project, he creates forms (quizzes / practice sets)
- In the admin panel, when creating a node, he can link a FieldTally form ID to that node
- The mobile app loads the FieldTally form in a WebView

### Submission handling
- FieldTally sends a webhook on form submission
- Supabase Edge Function `fieldtally-webhook` receives this
- Parses the submission: extracts score, answer data, wrong question IDs
- Writes to `quiz_responses` and `node_completions`
- Updates `weak_concepts` if score is below threshold
- Sends Expo push notification to student: "Quiz submitted! Score: 7/10"

### Timed quiz mode
Before opening the FieldTally WebView:
- If `quizzes.time_limit_seconds` is set, show a fullscreen countdown overlay
- When timer hits 0: auto-submit the form (inject JS into WebView to trigger submit)
- Untimed mode: no countdown, she submits when ready

---

## 8. Admin Panel (Next.js)

### Authentication
- Supabase Auth, teacher role only for admin panel
- Simple email/password login
- Row-level security on all tables:
  - Teachers can read/write all records where `teacher_id = auth.uid()`
  - Students can only read content where the owning teacher matches their `teacher_id`, and read/write only their own progress records
  - No student can ever see another teacher's content or another student's data

### Section: Courses
- Create / edit / delete courses
- Set title, subject, color, cover image

### Section: Course Builder
- Visual list of sections and nodes within a course
- Drag to reorder nodes and sections
- For each node: set type, title, publish status, available_from date
- For lecture nodes: paste Drive file ID/URL, set duration, write primer notes
- For practice/quiz nodes: paste FieldTally form ID, set time limit
- For concept notes: markdown editor (use a simple editor like `react-simplemde-editor`)
- Preview mode: see how the path will look for the student

### Section: Task Scheduler
- Calendar view showing all assigned tasks by date, filterable by student
- Assign a node to a date: select target students (all students, or pick specific ones) → creates `tasks` records for each
- Bulk assign: select multiple nodes, pick a date range, distribute evenly
- Can also remove or reschedule tasks per student or across all students

### Section: Student Dashboard
- Student selector at top: dropdown of all students linked to this teacher
- Per student: today's task completion status, current streak, last active
- Time tracking: per-node time spent, filterable by date range (bar chart)
- Quiz performance: per-node score history, error log (which questions they get wrong repeatedly)
- Confusion flags: list of open flags with their description, input to write a response (saved to `confusion_flags.admin_response`, triggers push notification to student)
- Lecture completions: per lecture — understanding rating, enjoyment rating, reflection text
- Storage: which files are downloaded on their device, total size

### Section: Content Library
- List of all concept notes, lectures, practice sets, quizzes
- Reusable: a concept note can be attached to multiple nodes

---

## 9. Offline-First Data Sync Strategy

### What lives locally (SQLite via expo-sqlite)
- All `tasks` for the student
- All `nodes`, `sections`, `courses` metadata
- All `concept_notes` content
- All `downloads` status
- Session logs (queued for sync)
- Completion records (queued for sync)

### Sync strategy
- On app open: full sync of tasks + node metadata from Supabase
- Every 5 minutes while app is open: sync any queued session logs and completions
- On completing a quiz/lecture: immediate sync attempt, fallback to queue if offline
- Zustand store mirrors SQLite, updates optimistically on user action

### Conflict resolution
Last-write-wins for most fields. Session logs are append-only (no conflict possible). Completion records: if completed_at exists locally and remotely, keep earliest (whichever happened first).

---

## 10. Weak Concepts / Gym Logic

**Triggers that update `weak_concepts`:**
1. Quiz/practice submission with score < 60%
2. Lecture completion with understanding_rating ≤ 2
3. Confusion flag created

**Removal from Gym:**
- Quiz/practice: retried twice with score ≥ 80% → remove
- Lecture: rewatched and rated understanding ≥ 4 → remove
- Confusion flag: resolved by Vivek (`is_resolved = true`) → remove from Gym

**Weekly review surface:**
Every Sunday, app generates a "Weekly Review" task in today's feed — a curated list of the top 5 weak concepts from that week. Vivek doesn't have to do anything; it's derived from data.

---

## 11. Streak Logic

- A day counts toward the streak if `session_logs` has at least one entry for that calendar date
- Minimum threshold: 10 minutes of total session time for a day to count (configurable)
- Streak calculated fresh on each app open from `session_logs`
- Stored in `streaks` table and updated nightly via Supabase scheduled function
- If she misses a day: streak resets to 0

---

## 12. Push Notifications

Using Expo Push Notifications + Supabase Edge Functions.

**Events that trigger notifications:**
- New content available (new tasks assigned)
- New content downloaded and ready to watch
- Vivek responded to a confusion flag
- Quiz submitted successfully (confirmation + score)
- Daily reminder at a configured time if no session yet that day
- Weekly review session ready (Sundays)

---

## 13. Gamification — Celebrations and Feedback

Light gamification focused on positive reinforcement. No points, no badges, no leaderboards — just satisfying completion moments and motivating feedback. The goal is to make studying feel rewarding, not transactional.

### Completion Animations

Use `react-native-reanimated` + `react-native-confetti-cannon` (or a lightweight confetti library) for all celebration moments.

**Lecture completed:**
- A gentle burst of confetti (not overwhelming) plays as the completion modal appears
- The node on the Course Path animates: scales up briefly, then settles into its "completed" filled state with a checkmark
- The task on the Home tab animates to "Done" with a smooth color transition and a soft ✓ checkmark pop

**Quiz / Practice completed:**
- Full-screen score card slides up as a modal
- Score displayed large and bold (e.g. "8 / 10")
- Animated score fill — a circular progress ring draws itself from 0 to the score percentage
- Confetti fires if score ≥ 70%, more confetti if score = 100%
- A motivating line displayed below the score (see copy below)
- "See mistakes" button if any wrong answers, "Back to tasks" button

**Streak milestone:**
- On hitting a streak that's a multiple of 7 (7, 14, 21 days...): full-screen celebration overlay with a fire emoji animation and "X day streak! 🔥" — dismisses after 2 seconds

**All tasks completed for the day:**
- When the last task of the day is marked done, a small celebration banner drops down from the top: "All done for today! 🎉" with a gentle animation

### Score Result Screen — Motivating Copy

The message shown after a quiz or practice submission should vary based on score. Write these into the app as a curated string pool, picked randomly within each tier.

**Score 90–100%:**
- "Absolutely nailed it. You're on fire. 🔥"
- "Perfect! This chapter doesn't stand a chance against you."
- "100%?! Screenshot this. Frame it."

**Score 70–89%:**
- "Solid work. You clearly know your stuff."
- "Really strong! A couple more passes and this is yours completely."
- "That's what consistent studying looks like. Well done."

**Score 50–69%:**
- "Good effort — the hard questions are how you grow."
- "Halfway there. Check the ones you missed and retry — you'll crack it."
- "Not bad at all. The Gym has the questions to help you level up."

**Score below 50%:**
- "Tough one, but that's okay. Every miss is a map to what to study next."
- "This one's going to the Gym. You'll look back at this score and laugh."
- "Hard doesn't mean impossible. Go again when you're ready."

### Implementation Notes

- Use `react-native-reanimated` for all spring/scale animations (node completion, task checkmark)
- Use a lightweight confetti library — `react-native-confetti-cannon` is well-maintained and Expo-compatible
- All animations must respect `AccessibilityInfo.isReduceMotionEnabled()` — if the user has reduce motion on, skip confetti and use a simple fade instead
- Score screen is a bottom sheet modal (using `@gorhom/bottom-sheet`) that slides up over the current screen
- Motivating copy lives in a local constants file, not fetched from backend — no network dependency for celebrations

---

## 14. Build Order (Recommended)

Build in this sequence so she has something usable as fast as possible:

### Phase 1 — Core Infrastructure (get to "usable" fast)
1. Supabase project setup: schema, RLS policies, auth
2. Admin panel: auth + course/section/node CRUD
3. Mobile app: auth + tab shell + course path rendering (static, no downloads yet)
4. Task assignment (admin) + Today's tasks tab (student)
5. Lecture player (streaming from Drive URL, no offline yet)
6. Lecture completion flow (ratings + reflection)

*At this point she can use the app for lectures and see her daily tasks.*

### Phase 2 — Tests, Offline, and Celebrations
7. FieldTally webhook integration + quiz/practice completion flow
8. Score result screen with motivating copy
9. Completion animations (confetti, node path animation, task checkmark)
10. Background download system (Drive service account + expo-file-system)
11. Download progress UI on node cards
12. Offline playback from local file
13. SQLite offline sync for tasks and completions

*At this point quizzes work, downloads happen automatically, and every completion feels rewarding.*

### Phase 3 — Intelligence and Monitoring
14. Session logging (time tracking per node)
15. weak_concepts logic + Gym tab
16. Analytics tab (streak, course progress, score trends)
17. Confusion flag button + admin response flow
18. Admin dashboard (time tracking, quiz performance, confusion flags)

### Phase 4 — Polish
19. Weekly review auto-task (Sundays)
20. Pre-lecture primer bottom sheet
21. Timed quiz mode
22. Bookmarks in lecture player
23. Storage settings screen (manual delete)
24. Push notifications
25. Streak milestone celebrations
26. UI polish, final animation tuning

---

## 15. Key Design Decisions (pass to coding agent)

- **No voice/video submissions** — all long-form answers are text only
- **No auto-delete of downloads** — students manage their own storage manually
- **720p only** — all videos uploaded at 720p by the teacher, no in-app quality switching
- **Multi-teacher, multi-student** — each teacher is fully isolated; students link via invite code on first launch
- **One teacher per student** — a student can only be linked to one teacher at a time
- **FieldTally handles all quiz/practice question design** — the app only embeds and receives webhooks
- **Content scheduling is strict** — locked nodes are invisible or grayed out, not accessible early
- **Admin panel is web-only** — teachers manage everything from a browser, not the mobile app
- **Drive is the only file storage** — all videos, PDFs, thumbnails, and attachments are Drive links. Supabase storage is not used at all.
- **Video deduplication by drive_file_id** — multiple lecture nodes can share one Drive video file. The device downloads it once; each node just seeks to its timestamp window.
- **Row-level security from day one** — students can never access another teacher's content or another student's data
