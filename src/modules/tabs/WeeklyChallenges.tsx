// ═══════════════════════════════════════════════════════════════
// WEEKLY MICRO-CHALLENGES — Gamified spending challenges
// ═══════════════════════════════════════════════════════════════
  import { useEffect,useState } from "react";
  import { unlockBadge } from "../badges.js";
  import { T } from "../constants.js";
  import UiGlyph from "../UiGlyph.js";
  import { Card } from "../ui.js";
  import { db } from "../utils.js";

type ChallengeDifficulty = "easy" | "medium" | "hard";

interface ChallengeTemplate {
  id: string;
  emoji: string;
  title: string;
  desc: string;
  difficulty: ChallengeDifficulty;
  points: number;
}

interface WeeklyChallenge extends ChallengeTemplate {
  week: string;
  completed: boolean;
}

interface ChallengeStats {
  totalCompleted: number;
  streak: number;
  totalPoints: number;
  lastWeek: string;
}

// Challenge templates — personalized at runtime based on user data
const CHALLENGE_TEMPLATES: ChallengeTemplate[] = [
  {
    id: "no_impulse",
    emoji: "🛑",
    title: "Zero Impulse Buys",
    desc: "Go this week without any unplanned purchases over $15",
    difficulty: "medium",
    points: 50,
  },
  {
    id: "cook_all",
    emoji: "🍳",
    title: "Home Chef Week",
    desc: "Prepare all meals at home — zero dining out or delivery",
    difficulty: "hard",
    points: 75,
  },
  {
    id: "no_sub",
    emoji: "📵",
    title: "Subscription Audit",
    desc: "Cancel or pause one subscription you haven't used in 30 days",
    difficulty: "easy",
    points: 30,
  },
  {
    id: "save_extra",
    emoji: "💰",
    title: "Save $50 Extra",
    desc: "Transfer an extra $50 to your savings vault this week",
    difficulty: "medium",
    points: 50,
  },
  {
    id: "debt_boost",
    emoji: "💳",
    title: "Debt Killer Boost",
    desc: "Make an extra $25 payment toward your highest-APR card",
    difficulty: "medium",
    points: 50,
  },
  {
    id: "cash_only",
    emoji: "💵",
    title: "Cash Only Day",
    desc: "Spend one full day using only cash or debit — no credit cards",
    difficulty: "easy",
    points: 30,
  },
  {
    id: "price_check",
    emoji: "🔍",
    title: "Price Detective",
    desc: "Compare prices on your 3 most expensive recurring purchases",
    difficulty: "easy",
    points: 25,
  },
  {
    id: "no_coffee",
    emoji: "☕",
    title: "Skip the Shop",
    desc: "No coffee shop purchases this week — brew at home",
    difficulty: "medium",
    points: 40,
  },
  {
    id: "ten_pct",
    emoji: "📊",
    title: "10% Under Budget",
    desc: "End the week spending at least 10% under your allowance",
    difficulty: "hard",
    points: 75,
  },
  {
    id: "round_up",
    emoji: "🔄",
    title: "Round-Up Saver",
    desc: "Round up every purchase to the nearest $5 and save the difference",
    difficulty: "medium",
    points: 50,
  },
  {
    id: "no_amazon",
    emoji: "📦",
    title: "Amazon Freeze",
    desc: "No Amazon purchases for 7 days straight",
    difficulty: "hard",
    points: 60,
  },
  {
    id: "meal_prep",
    emoji: "🥘",
    title: "Meal Prep Master",
    desc: "Prep 5 meals on Sunday — save time and money all week",
    difficulty: "hard",
    points: 70,
  },
];

function getWeekKey() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  const wn = 1 + Math.round(((d.getTime() - w1.getTime()) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(wn).padStart(2, "0")}`;
}

// Deterministic shuffle with seed
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    const tmp = a[i] as T;
    a[i] = a[j] as T;
    a[j] = tmp;
  }
  return a;
}

export default function WeeklyChallenges() {
  const [challenge, setChallenge] = useState<WeeklyChallenge | null>(null);
  const [completed, setCompleted] = useState(false);
  const [stats, setStats] = useState<ChallengeStats>({ totalCompleted: 0, streak: 0, totalPoints: 0, lastWeek: "" });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const weekKey = getWeekKey();
      const savedChallenge = (await db.get("weekly-challenge")) as WeeklyChallenge | null;
      const savedStats = ((await db.get("challenge-stats")) as ChallengeStats | null) || {
        totalCompleted: 0,
        streak: 0,
        totalPoints: 0,
        lastWeek: "",
      };

      if (savedChallenge && savedChallenge.week === weekKey) {
        setChallenge(savedChallenge);
        setCompleted(savedChallenge.completed || false);
      } else {
        // Generate new challenge for this week
        const seed = weekKey.split("-").reduce((s, p) => s + (parseInt(p.replace("W", ""), 10) || 0), 0);
        const shuffled = seededShuffle(CHALLENGE_TEMPLATES, seed);
        const picked = shuffled[0] ?? CHALLENGE_TEMPLATES[0];
        if (!picked) return;
        const newChallenge = { ...picked, week: weekKey, completed: false };
        setChallenge(newChallenge);
        await db.set("weekly-challenge", newChallenge);

        // Check if the user missed last week
        if (savedStats.lastWeek && savedStats.lastWeek !== weekKey) {
          const [lastYear, lastWPart] = savedStats.lastWeek.split("-W");
          const [thisYear, thisWPart] = weekKey.split("-W");
          const lastNum = parseInt(lastWPart || "0");
          const thisNum = parseInt(thisWPart || "0");
          const sameYear = lastYear === thisYear;
          // Consecutive = same year & gap of 1, OR year-end wrap (W52/W53 → W01)
          const isConsecutive = (sameYear && thisNum - lastNum === 1) || (!sameYear && thisNum === 1 && lastNum >= 52);
          if (!isConsecutive) {
            savedStats.streak = 0; // Reset streak on missed week
          }
        }
      }
      setStats(savedStats);
      setLoaded(true);
    })();
  }, []);

  const handleComplete = async () => {
    if (!challenge || completed) return;
    const updatedChallenge = { ...challenge, completed: true };
    setChallenge(updatedChallenge);
    setCompleted(true);
    await db.set("weekly-challenge", updatedChallenge);

    const newStats = {
      ...stats,
      totalCompleted: stats.totalCompleted + 1,
      streak: stats.streak + 1,
      totalPoints: stats.totalPoints + (challenge.points || 0),
      lastWeek: challenge.week,
    };
    setStats(newStats);
    await db.set("challenge-stats", newStats);

    // Unlock badges
    await unlockBadge("challenge_complete");
    if (newStats.streak >= 4) await unlockBadge("challenge_streak_4");
  };

  if (!loaded || !challenge) return null;

  const diffColor =
    challenge.difficulty === "hard"
      ? T.status.red
      : challenge.difficulty === "medium"
        ? T.status.amber
        : T.status.green;

  return (
    <Card animate delay={450}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <UiGlyph glyph="⚡" size={16} color={T.accent.primary} />
          <span style={{ fontSize: 13, fontWeight: 700 }}>Weekly Challenge</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {stats.streak > 0 && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: "#FF8C00",
                fontFamily: T.font.mono,
                display: "flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              <UiGlyph glyph="🔥" size={10} color="#FF8C00" /> {stats.streak}
            </span>
          )}
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              padding: "2px 6px",
              borderRadius: 10,
              background: `${diffColor}15`,
              color: diffColor,
              textTransform: "uppercase",
              fontFamily: T.font.mono,
            }}
          >
            {challenge.difficulty}
          </span>
        </div>
      </div>

      <div
        style={{
          padding: "14px 16px",
          borderRadius: T.radius.md,
          background: completed ? `${T.status.green}08` : T.bg.elevated,
          border: `1px solid ${completed ? T.status.green + "30" : T.border.default}`,
          marginBottom: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <UiGlyph glyph={challenge.emoji} size={28} color={completed ? T.status.green : T.accent.primary} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                marginBottom: 3,
                color: completed ? T.status.green : T.text.primary,
                textDecoration: completed ? "line-through" : "none",
              }}
            >
              {challenge.title}
            </div>
            <p style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.5, margin: 0 }}>{challenge.desc}</p>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: T.accent.primary, fontFamily: T.font.mono }}>
              +{challenge.points}
            </div>
            <div style={{ fontSize: 8, color: T.text.muted, fontFamily: T.font.mono }}>PTS</div>
          </div>
        </div>
      </div>

      {!completed ? (
        <button
          onClick={handleComplete}
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: T.radius.md,
            border: "none",
            background: `linear-gradient(135deg, ${T.accent.primary}, #6C60FF)`,
            color: "#fff",
            fontSize: 13,
            fontWeight: 800,
            cursor: "pointer",
            boxShadow: `0 4px 16px ${T.accent.primary}40`,
          }}
        >
          Mark Complete
        </button>
      ) : (
        <div style={{ textAlign: "center", padding: "8px 0" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: T.status.green, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <UiGlyph glyph="✅" size={12} color={T.status.green} />
            Completed this week!
          </span>
        </div>
      )}

      {/* Stats footer */}
      {stats.totalCompleted > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-around",
            marginTop: 10,
            padding: "8px 0",
            borderTop: `1px solid ${T.border.default}`,
          }}
        >
          {[
            { label: "Completed", value: stats.totalCompleted },
            { label: "Streak", value: `${stats.streak}w` },
            { label: "Points", value: stats.totalPoints },
          ].map(s => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: T.accent.primary, fontFamily: T.font.mono }}>
                {s.value}
              </div>
              <div style={{ fontSize: 9, color: T.text.muted }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
