/**
 * @file constants.ts
 * @description Centralized constants, configurations, and copy for the Stuarc project.
 * Adheres to the rule of 'No hardcoded strings' by housing all application copy.
 */

export const SUBJECTS = [
  'Physics',
  'Chemistry',
  'Mathematics',
  'Biology',
] as const;

export type SubjectType = typeof SUBJECTS[number];

export const COURSE_COLORS = [
  '#4F46E5', // Indigo
  '#06B6D4', // Cyan
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#8B5CF6', // Purple
  '#EF4444', // Rose Red
  '#3B82F6', // Blue
] as const;

export const APP_COPY = {
  auth: {
    signInTitle: 'Welcome Back',
    signInSubtitle: 'Sign in to access your dashboard',
    signUpTitle: 'Create Account',
    signUpSubtitle: 'Get started with Stuarc',
    emailLabel: 'Email Address',
    passwordLabel: 'Password',
    nameLabel: 'Full Name',
    roleLabel: 'I am a...',
    roleTeacher: 'Teacher / Instructor',
    roleStudent: 'Student',
    signInButton: 'Sign In',
    signUpButton: 'Sign Up',
    googleSignInButton: 'Continue with Google',
    alreadyHaveAccount: 'Already have an account? Sign In',
    dontHaveAccount: "Don't have an account? Sign Up",
    signingIn: 'Signing in...',
    signingUp: 'Creating account...',
    inviteCodeTitle: 'Enter Invite Code',
    inviteCodeSubtitle: 'Enter the code provided by your teacher to link your account.',
    inviteCodePlaceholder: 'e.g. VIVEK42',
    inviteCodeButton: 'Verify & Link',
    inviteCodeVerifying: 'Verifying code...',
    inviteCodeSuccess: 'Successfully linked to your teacher!',
    inviteCodeError: 'Invalid invite code. Please try again.',
  },
  admin: {
    dashboardTitle: 'Teacher Dashboard',
    coursesTitle: 'Courses',
    courseBuilderTitle: 'Course Builder',
    taskSchedulerTitle: 'Task Scheduler',
    studentsTitle: 'Students',
    noCourses: 'No courses created yet. Create your first course to begin!',
    createCourseButton: 'Create Course',
    editCourseButton: 'Edit Course',
    deleteCourseButton: 'Delete Course',
    courseNamePlaceholder: 'e.g. Class 11 Physics',
    courseSubjectPlaceholder: 'Select Subject',
    courseDescPlaceholder: 'Course description...',
    saveButton: 'Save Changes',
    cancelButton: 'Cancel',
    addSectionButton: 'Add Section / Chapter',
    sectionTitlePlaceholder: 'e.g. Chapter 1: Kinematics',
    addNodeButton: 'Add Path Node',
    nodeTitlePlaceholder: 'e.g. Lesson 1.1: Introduction to Vectors',
    nodeTypeLecture: 'Lecture Video',
    nodeTypePractice: 'Practice Set',
    nodeTypeQuiz: 'Quiz',
    publishButton: 'Publish',
    unpublishButton: 'Unpublish',
    availableFromLabel: 'Schedule Availability (Optional)',
    lectureDetailsTitle: 'Lecture Configuration',
    driveFileIdLabel: 'Google Drive File ID',
    driveUrlLabel: 'Google Drive Download URL',
    durationLabel: 'Duration (seconds)',
    startSecLabel: 'Start Segment (seconds - optional)',
    endSecLabel: 'End Segment (seconds - optional)',
    thumbnailUrlLabel: 'Thumbnail Drive URL (optional)',
    descriptionLabel: 'Description',
    primerNotesLabel: 'Pre-lecture Primer Notes',
    practiceDetailsTitle: 'Practice Set Configuration',
    quizDetailsTitle: 'Quiz Configuration',
    fieldtallyIdLabel: 'FieldTally Form ID',
    timeLimitLabel: 'Time Limit (seconds - optional)',
    questionCountLabel: 'Question Count',
    taskSchedulerHeader: 'Assign Daily Tasks',
    assignTaskButton: 'Assign Task',
    selectStudentPlaceholder: 'Select Student',
    selectDateLabel: 'Due Date',
    bulkAssignTitle: 'Bulk Assign Tasks',
  },
  mobile: {
    homeTabTitle: 'Today',
    coursesTabTitle: 'Paths',
    gymTabTitle: 'Gym',
    analyticsTabTitle: 'Analytics',
    streakBadge: 'Streak',
    todayTasksHeader: "Today's Checklist",
    upcomingTasksHeader: 'Upcoming Tasks',
    noTasksToday: "You're all clear for today! Great job! 🎉",
    noTasksUpcoming: 'No upcoming tasks scheduled.',
    taskCompleted: 'Completed',
    taskPending: 'Pending',
    taskInProgress: 'In Progress',
    lecturePlayerTitle: 'Lecture Video',
    markCompleteButton: 'Mark as Complete',
    completePromptTitle: 'Class Dismissed!',
    completePromptSubtitle: 'How was your learning experience?',
    understandingRatingLabel: 'How well did you understand this lecture?',
    enjoymentRatingLabel: 'How much did you enjoy this lecture?',
    reflectionPlaceholder: "What's one thing you learned? (optional)",
    submitFeedbackButton: 'Submit Feedback',
    confusedButton: "I'm Confused",
    confusionModalTitle: 'Report Confusion',
    confusionModalSubtitle: 'Write a brief description of what is confusing. Your teacher will respond to help you out.',
    confusionPlaceholder: 'I did not understand the transition at 4:15 when you derived...',
    confusionSubmitButton: 'Submit to Teacher',
    confusionSuccess: 'Confusion flagged. Your teacher has been notified!',
    offlineMessage: 'This video is not downloaded and you are currently offline.',
    downloadingBanner: 'Downloading video for offline use...',
    downloadOffline: 'Offline',
    downloadQueued: 'Queue',
    downloadFailed: 'Failed',
  },
  motivationalCopy: {
    tier90: [
      "Absolutely nailed it. You're on fire. 🔥",
      'Perfect! This chapter doesn\'t stand a chance against you.',
      '100%?! Screenshot this. Frame it.',
    ],
    tier70: [
      'Solid work. You clearly know your stuff.',
      'Really strong! A couple more passes and this is yours completely.',
      "That's what consistent studying looks like. Well done.",
    ],
    tier50: [
      'Good effort — the hard questions are how you grow.',
      'Halfway there. Check the ones you missed and retry — you\'ll crack it.',
      'Not bad at all. The Gym has the questions to help you level up.',
    ],
    tierBelow50: [
      'Tough one, but that\'s okay. Every miss is a map to what to study next.',
      'This one\'s going to the Gym. You\'ll look back at this score and laugh.',
      'Hard doesn\'t mean impossible. Go again when you\'re ready.',
    ],
  },
};
