// Brightspace-style grade calculation. Pure and testable: no network, no DB.
// Supports a points system (final = earned / possible) and a weighted system
// (categories carry a percent of the final grade; items within a category are
// averaged by points, optionally with per-item weights and drop-lowest).

export type SchemeBand = { min: number; symbol: string; gpa?: number };

export type GradeCategory = {
  id: string;
  name: string;
  weight: number; // percent of final grade (weighted mode)
  drop_lowest?: number;
  position?: number;
};

export type GradeItem = {
  id: string;
  category_id: string | null;
  name: string;
  max_points: number;
  weight?: number; // within-category weight (weighted mode); 0 = equal by points
  position?: number;
  published?: boolean;
};

export type GradeEntry = {
  grade_item_id: string;
  points: number | null; // null = not graded yet
  exempt?: boolean;
};

export type ItemResult = {
  item: GradeItem;
  points: number | null;
  percent: number | null; // 0..100 for this item
  graded: boolean;
  exempt: boolean;
};

export type FinalGrade = {
  percent: number | null; // 0..100, null if nothing graded
  pointsEarned: number;
  pointsPossible: number;
  letter: string | null;
  gpa: number | null;
};

export const DEFAULT_SCHEME: SchemeBand[] = [
  { min: 93, symbol: "A", gpa: 4.0 }, { min: 90, symbol: "A-", gpa: 3.7 },
  { min: 87, symbol: "B+", gpa: 3.3 }, { min: 83, symbol: "B", gpa: 3.0 },
  { min: 80, symbol: "B-", gpa: 2.7 }, { min: 77, symbol: "C+", gpa: 2.3 },
  { min: 73, symbol: "C", gpa: 2.0 }, { min: 70, symbol: "C-", gpa: 1.7 },
  { min: 67, symbol: "D+", gpa: 1.3 }, { min: 63, symbol: "D", gpa: 1.0 },
  { min: 60, symbol: "D-", gpa: 0.7 }, { min: 0, symbol: "F", gpa: 0.0 },
];

export function letterFor(
  percent: number | null,
  scheme: SchemeBand[] = DEFAULT_SCHEME,
): { symbol: string; gpa: number | null } | null {
  if (percent == null) return null;
  const bands = [...scheme].sort((a, b) => b.min - a.min);
  for (const b of bands) {
    if (percent >= b.min) return { symbol: b.symbol, gpa: b.gpa ?? null };
  }
  const last = bands[bands.length - 1];
  return last ? { symbol: last.symbol, gpa: last.gpa ?? null } : null;
}

function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

// Per-item result (used for both the teacher grid and the student view).
export function itemResults(items: GradeItem[], entries: GradeEntry[]): ItemResult[] {
  const byItem = new Map(entries.map((e) => [e.grade_item_id, e]));
  return items.map((item) => {
    const e = byItem.get(item.id);
    const exempt = !!e?.exempt;
    const graded = !!e && e.points != null && !exempt;
    const points = graded ? (e!.points as number) : null;
    const percent =
      graded && item.max_points > 0 ? round(((points as number) / item.max_points) * 100) : null;
    return { item, points, percent, graded, exempt };
  });
}

// Compute a category's percentage from its graded items (0..100), applying
// per-item weights when present and dropping the N lowest if configured.
function categoryPercent(
  catItems: ItemResult[],
  dropLowest: number,
): { percent: number | null; earned: number; possible: number } {
  let graded = catItems.filter((r) => r.graded);
  if (graded.length === 0) return { percent: null, earned: 0, possible: 0 };

  // Drop the N lowest by item percentage.
  if (dropLowest > 0 && graded.length > dropLowest) {
    graded = [...graded].sort((a, b) => (a.percent ?? 0) - (b.percent ?? 0)).slice(dropLowest);
  }

  const anyWeight = graded.some((r) => (r.item.weight ?? 0) > 0);
  if (anyWeight) {
    let wsum = 0;
    let acc = 0;
    for (const r of graded) {
      const w = r.item.weight ?? 0;
      if (w <= 0) continue;
      wsum += w;
      acc += w * (r.percent ?? 0);
    }
    const earned = graded.reduce((s, r) => s + (r.points ?? 0), 0);
    const possible = graded.reduce((s, r) => s + r.item.max_points, 0);
    return { percent: wsum > 0 ? round(acc / wsum) : null, earned, possible };
  }

  // Equal-by-points: sum points / sum max over graded items.
  const earned = graded.reduce((s, r) => s + (r.points ?? 0), 0);
  const possible = graded.reduce((s, r) => s + r.item.max_points, 0);
  return { percent: possible > 0 ? round((earned / possible) * 100) : null, earned, possible };
}

export function computeFinalGrade(opts: {
  mode: "points" | "weighted";
  categories: GradeCategory[];
  items: GradeItem[];
  entries: GradeEntry[];
  scheme?: SchemeBand[];
}): FinalGrade {
  const scheme = opts.scheme ?? DEFAULT_SCHEME;
  const results = itemResults(opts.items, opts.entries);
  const graded = results.filter((r) => r.graded);

  if (opts.mode === "weighted") {
    // Group results by category; ungrouped items form an implicit category of
    // their own only if there are no real categories.
    const byCat = new Map<string, ItemResult[]>();
    for (const r of results) {
      const key = r.item.category_id ?? "__uncat__";
      if (!byCat.has(key)) byCat.set(key, []);
      byCat.get(key)!.push(r);
    }
    let weightSum = 0;
    let acc = 0;
    let earned = 0;
    let possible = 0;
    for (const cat of opts.categories) {
      const catRes = byCat.get(cat.id) ?? [];
      const { percent, earned: e, possible: p } = categoryPercent(catRes, cat.drop_lowest ?? 0);
      if (percent == null) continue; // category has no graded items -> excluded
      weightSum += cat.weight;
      acc += cat.weight * percent;
      earned += e;
      possible += p;
    }
    if (weightSum === 0) return { percent: null, pointsEarned: 0, pointsPossible: 0, letter: null, gpa: null };
    const percent = round(acc / weightSum);
    const l = letterFor(percent, scheme);
    return { percent, pointsEarned: round(earned), pointsPossible: round(possible), letter: l?.symbol ?? null, gpa: l?.gpa ?? null };
  }

  // Points mode.
  if (graded.length === 0) return { percent: null, pointsEarned: 0, pointsPossible: 0, letter: null, gpa: null };
  const earned = graded.reduce((s, r) => s + (r.points ?? 0), 0);
  const possible = graded.reduce((s, r) => s + r.item.max_points, 0);
  const percent = possible > 0 ? round((earned / possible) * 100) : null;
  const l = letterFor(percent, scheme);
  return {
    percent,
    pointsEarned: round(earned),
    pointsPossible: round(possible),
    letter: l?.symbol ?? null,
    gpa: l?.gpa ?? null,
  };
}

// Filter only the roster: every item still contributes to the final grade.
export function filterGradebookStudents<T extends { id: string; name: string }>(
  students: T[], items: Pick<GradeItem, "id">[], points: Record<string, string>,
  query: string, ungradedOnly: boolean,
): T[] {
  const needle = query.trim().toLocaleLowerCase();
  return students.filter((student) =>
    student.name.toLocaleLowerCase().includes(needle) &&
    (!ungradedOnly || items.some((item) => !points[`${student.id}:${item.id}`]?.trim()))
  );
}
