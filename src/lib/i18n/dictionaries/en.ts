// English is the source dictionary. Its shape (`Dictionary`) is the contract
// every other locale must satisfy — keep keys identical across files.

// NOTE: intentionally no `as const` — leaf types must widen to `string` so
// other locales (with different text) are assignable to `Dictionary`.
const en = {
  nav: {
    how: "How it works",
    pricing: "Pricing",
    signIn: "Sign in",
    language: "Language",
  },
  hero: {
    eyebrow: "Languages · Coding · Math · Science · Business · Humanities · Arts",
    titleLine1: "Learn anything.",
    titleLine2: "Actually master it.",
    subtitle:
      "The learning app that proves you really learned it. Adaptive lessons, a coach that guides you to the answer instead of handing it over, hands-on practice, and credentials you can share — across languages, coding, math, science, business, and the humanities. 170+ courses, one path that adapts to you.",
    ctaPrimary: "Start learning free",
    ctaSecondary: "How it works",
    pills: ["Languages", "Coding", "Math", "Science", "Business", "Humanities", "Arts"],
  },
  stats: {
    courses: "170+",
    coursesLabel: "courses",
    languages: "7",
    languagesLabel: "subject areas",
    schools: "6",
    schoolsLabel: "world languages",
  },
  how: {
    title: "How Noelia works",
    step1Title: "Start where you are",
    step1Body:
      "Pick from 170+ courses across languages, coding, math, science, business, and the humanities. A short diagnostic places you, and your path adapts as you go.",
    step2Title: "Learn by doing",
    step2Body:
      "Every lesson is active — speak it aloud, solve the problem, write real code, answer the quiz — with a coach that guides you to the answer instead of handing it over, and spaced review right before you'd forget.",
    step3Title: "Master it — and prove it",
    step3Body:
      "Noelia measures real mastery, not minutes, and brings skills back until they stick. Earn verifiable certificates and badges you can share — or go deeper with a live instructor.",
  },
  schools: {
    title: "Seven subjects, one platform",
    subtitle: "Start anywhere. Everything runs on the same active, mastery-driven method.",
    languagesTitle: "Languages",
    languagesBody: "Spanish, French, Italian, Portuguese, English & German — A1 to C1, plus business tracks.",
    mathTitle: "Mathematics",
    mathBody: "Arithmetic through Calculus, Linear Algebra, and Differential Equations.",
    scienceTitle: "Science",
    scienceBody: "Biology, Chemistry, Physics, Psychology, and dozens more.",
    technologyTitle: "Technology",
    technologyBody: "Coding you run in the browser — Python, SQL, JavaScript, data & more.",
    businessTitle: "Business",
    businessBody: "Finance, marketing, management, law, and product.",
    humanitiesTitle: "Humanities",
    humanitiesBody: "History, world cultures, philosophy, religion, literature, Latin & linguistics.",
    artsTitle: "Arts",
    artsBody: "Music, theater, film, visual art, architecture & dance.",
  },
  features: {
    title: "Everything in one app",
    selfStudy: "Self-study",
    selfStudyBody: "Adaptive lessons + spaced repetition.",
    speak: "Speak from day one",
    speakBody: "Pronunciation scored word-by-word.",
    academic: "Academic depth",
    academicBody: "Math, science, tech & business.",
    instructor: "Live instructor",
    instructorBody: "Per-minute, instant connect.",
    translate: "Real-time translate",
    translateBody: "Voice, text, and on the go.",
  },
  audience: {
    title: "Made for how you learn",
    selfTitle: "Self-learners",
    selfBody: "Ten minutes a day. Your queue always knows what's next.",
    classTitle: "Classrooms",
    classBody: "Teachers assign, the system grades in seconds, teachers review.",
    familyTitle: "Families",
    familyBody: "Parents follow progress, grades, and attendance — no nagging.",
  },
  cta: {
    title: "Your first lesson is 30 seconds away.",
    subtitle: "Free to start. No credit card. Works on any phone.",
    button: "Start learning free",
    pricing: "Pricing",
    privacy: "Privacy",
    terms: "Terms",
    deleteAccount: "Delete account",
  },
  trust: {
    free: "Free to start",
    noCard: "No credit card",
    anyPhone: "Works on any phone",
  },
  marquee: {
    eyebrow: "A few of the 170+ courses",
  },
  sources: {
    title: "Built on world-class open courseware",
    adaptedLabel: "Course structure adapted from",
    alignedLabel: "Aligned to recognized standards",
    note: "Every course credits its source. Structure is adapted from openly-licensed academic materials — never copied.",
  },
  // Signed-in app shell (sidebar + mobile nav). Keep labels short.
  app: {
    nav: {
      home: "Home",
      myLearning: "My Learning",
      grades: "Grades",
      calendar: "Calendar",
      messages: "Messages",
      progress: "Progress",
      community: "Community",
      library: "Library",
      shortcuts: "Shortcuts",
      notes: "Notes",
      flashcards: "Flashcards",
      practice: "Practice",
      tutor: "Tutor",
      workspaces: "Workspaces",
      teach: "Teach",
      school: "School",
      family: "Family",
      settings: "Settings",
      viewProfile: "View profile",
      inbox: "Inbox",
      discover: "Discover",
      coach: "Coach",
      profile: "Profile",
    },
  },
};

export type Dictionary = typeof en;
export default en;
