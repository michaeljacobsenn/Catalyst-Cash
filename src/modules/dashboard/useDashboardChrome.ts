import { useEffect, useRef, useState } from "react";

import { db } from "../utils.js";

export function useDashboardChrome({ current, streak, autoBackupInterval, appPasscode, onNativeBackup }) {
  const [runConfetti, setRunConfetti] = useState(false);
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [showBackupNudge, setShowBackupNudge] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const prevCurrentTs = useRef(current?.ts);
  const streakMilestoneChecked = useRef(false);

  useEffect(() => {
    const handleResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (current?.ts !== prevCurrentTs.current) {
      prevCurrentTs.current = current?.ts;
      const latestScore = current?.parsed?.healthScore?.score;
      if ((latestScore ?? 0) >= 95 && !current?.isTest) {
        setRunConfetti(true);
        setTimeout(() => setRunConfetti(false), 8000);
      }
    }
  }, [current]);

  useEffect(() => {
    if (streakMilestoneChecked.current || !streak) return;
    streakMilestoneChecked.current = true;
    const milestones = {
      4: { emoji: "🔥", label: "1 Month Strong!" },
      8: { emoji: "💪", label: "2 Months of Consistency!" },
      12: { emoji: "🏆", label: "Quarter Master!" },
      26: { emoji: "⚡", label: "Half-Year Hero!" },
      52: { emoji: "👑", label: "Full Year. Legend." },
    };
    const milestone = milestones[streak];
    if (!milestone) return;
    void (async () => {
      const key = `streak-milestone-${streak}`;
      const seen = await db.get(key);
      if (!seen) {
        await db.set(key, true);
        setRunConfetti(true);
        setTimeout(() => setRunConfetti(false), 6000);
        window.toast?.success?.(`${milestone.emoji} W${streak}: ${milestone.label}`);
      }
    })();
  }, [streak]);

  useEffect(() => {
    if (autoBackupInterval && autoBackupInterval !== "off") return;
    void (async () => {
      const dismissed = (await db.get("backup-nudge-dismissed")) as number | null;
      if (dismissed && Date.now() - dismissed < 7 * 86400000) return;
      const lastTs = (await db.get("last-backup-ts")) as number | null;
      if (!lastTs || Date.now() - lastTs > 7 * 86400000) {
        setShowBackupNudge(true);
      }
    })();
  }, [autoBackupInterval]);

  const dismissBackupNudge = async () => {
    await db.set("backup-nudge-dismissed", Date.now());
    setShowBackupNudge(false);
  };

  const handleBackupNow = async () => {
    setBackingUp(true);
    try {
      await onNativeBackup(appPasscode || null);
      await db.set("last-backup-ts", Date.now());
      setShowBackupNudge(false);
      window.toast?.success?.("✅ Backup saved to iCloud Drive");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      window.toast?.error?.("Backup failed: " + message);
    }
    setBackingUp(false);
  };

  const greeting = (() => {
    const hour = new Date().getHours();
    const timeGreet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    if (current?.date) {
      const daysSince = Math.floor((Date.now() - new Date(current.date).getTime()) / 86400000);
      if (daysSince >= 7) return `Welcome back! It's been ${daysSince} days — let's catch up.`;
    }
    if (streak > 1) return `${timeGreet}. W${streak} streak going strong 🔥`;
    return `${timeGreet}. Let's check your numbers.`;
  })();

  return {
    greeting,
    runConfetti,
    windowSize,
    showBackupNudge,
    backingUp,
    handleBackupNow,
    dismissBackupNudge,
  };
}
