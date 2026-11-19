// Pick a visually distinctive icon for a course from its title, so every card
// in a school doesn't share one generic emoji (every Science course showing the
// same microscope, etc.). Keyword-matched, most specific first; falls back to
// the school-level icon the catalog already passes. Purely presentational.

type Rule = { re: RegExp; icon: string };

// Order matters: earlier rules win. Keep compound subjects (e.g. "earth
// science") above the plain keyword they contain.
const RULES: Rule[] = [
  // Science
  { re: /anatomy|physiolog|human body/, icon: "🫀" },
  { re: /\bbiolog|life science|cell|genetic|dna|microbiolog/, icon: "🧬" },
  { re: /chemistr|\bchem\b|molecul|organic|reaction/, icon: "⚗️" },
  { re: /physics|mechanic|thermodynam|quantum|relativity/, icon: "⚛️" },
  { re: /astronom|cosmolog|space|planet|solar system|universe/, icon: "🔭" },
  { re: /geolog|earth science|rock|volcan|plate tecton/, icon: "🌋" },
  { re: /environment|ecolog|climate|sustainab|earth/, icon: "🌱" },
  { re: /neuroscience|brain|cognit/, icon: "🧠" },
  { re: /psycholog/, icon: "🧠" },
  { re: /sociolog|society|social/, icon: "👥" },
  { re: /nutrition|health|medic|nursing|disease/, icon: "🩺" },
  { re: /weather|meteorolog|atmospher/, icon: "⛅" },
  { re: /ocean|marine|water/, icon: "🌊" },

  // Mathematics
  { re: /statistic|probabilit|data analysis/, icon: "📊" },
  { re: /calculus|derivative|integral/, icon: "📐" },
  { re: /geometr|trigonometr/, icon: "📐" },
  { re: /algebra|equation|linear/, icon: "➗" },
  { re: /arithmetic|number|pre-?math|counting/, icon: "🔢" },
  { re: /\bmath|quantitative/, icon: "🧮" },

  // Technology / coding
  { re: /python/, icon: "🐍" },
  { re: /javascript|typescript|web dev|frontend|react/, icon: "🟨" },
  { re: /\bsql\b|database|data model/, icon: "🗄️" },
  { re: /data science|machine learning|\bai\b|artificial intel|deep learning/, icon: "🤖" },
  { re: /security|cyber|crypto|network/, icon: "🔐" },
  { re: /comput|programming|software|code|algorithm/, icon: "💻" },

  // Business
  { re: /account|bookkeep|ledger/, icon: "🧾" },
  { re: /financ|invest|stock|bank/, icon: "💰" },
  { re: /market|advertis|brand|growth/, icon: "📣" },
  { re: /econom/, icon: "📈" },
  { re: /management|leadership|strateg|operations/, icon: "📋" },
  { re: /entrepreneur|startup|venture/, icon: "🚀" },

  // Humanities
  { re: /histor|civilization|ancient|war|revolution/, icon: "📜" },
  { re: /philosoph|ethic|logic|reason/, icon: "🤔" },
  { re: /literat|poetry|writing|essay|rhetoric/, icon: "📖" },
  { re: /latin|greek|classic|mytholog/, icon: "🏛️" },
  { re: /geograph|map|world cultures/, icon: "🗺️" },
  { re: /politic|government|law|constitution/, icon: "⚖️" },
  { re: /relig|theolog/, icon: "🕊️" },

  // Arts
  { re: /music|melody|harmony|instrument/, icon: "🎵" },
  { re: /theat|drama|acting|play/, icon: "🎭" },
  { re: /film|cinema|movie|video/, icon: "🎬" },
  { re: /paint|draw|visual art|design|sketch/, icon: "🎨" },
  { re: /architect|building/, icon: "🏗️" },
  { re: /dance|choreograph|ballet/, icon: "💃" },
  { re: /photograph/, icon: "📷" },
];

export function courseIcon(title: string | null | undefined, fallback: string): string {
  const t = (title ?? "").toLowerCase();
  if (!t) return fallback;
  for (const r of RULES) if (r.re.test(t)) return r.icon;
  return fallback;
}
