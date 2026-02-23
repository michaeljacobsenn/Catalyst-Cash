import { useState, useRef, useCallback } from "react";
import { Share } from "@capacitor/share";
import { T } from "../constants.js";
import { Share2 } from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// SHARE CARD — Canvas-based visual score card for social sharing
// Renders a 1200×628 (social aspect ratio) branded card
// ═══════════════════════════════════════════════════════════════

function drawScoreCard(canvas, data) {
    const ctx = canvas.getContext("2d");
    const W = 1200, H = 628;
    canvas.width = W;
    canvas.height = H;

    // Background gradient
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#07090F");
    bg.addColorStop(1, "#0D1220");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Subtle grid pattern
    ctx.strokeStyle = "rgba(123,94,167,0.04)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    // Top bar accent
    const topGrad = ctx.createLinearGradient(0, 0, W, 0);
    topGrad.addColorStop(0, "#7B5EA7");
    topGrad.addColorStop(1, "#2ECC71");
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, W, 4);

    // Score circle
    const cx = 200, cy = 300, r = 100;
    // Background circle
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(123,94,167,0.1)";
    ctx.fill();
    // Arc
    const score = data.score || 0;
    const pct = Math.min(score / 100, 1);
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
    ctx.strokeStyle = score >= 80 ? "#2ECC71" : score >= 60 ? "#E0A84D" : "#E85C6A";
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.stroke();
    // Score number
    ctx.fillStyle = "#E4E6F0";
    ctx.font = "bold 56px Inter, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(score), cx, cy + 12);
    // Grade
    ctx.fillStyle = "rgba(136,144,166,0.8)";
    ctx.font = "bold 18px Inter, -apple-system, sans-serif";
    ctx.fillText(data.grade || "—", cx, cy + 42);

    // Right side content
    const rightX = 380;

    // App name
    ctx.fillStyle = "#7B5EA7";
    ctx.font = "bold 14px 'JetBrains Mono', monospace";
    ctx.textAlign = "left";
    ctx.fillText("CATALYST CASH", rightX, 60);

    // Title
    ctx.fillStyle = "#E4E6F0";
    ctx.font = "bold 32px Inter, -apple-system, sans-serif";
    ctx.fillText("Weekly Financial Score", rightX, 110);

    // Date
    ctx.fillStyle = "#4A5068";
    ctx.font = "600 16px 'JetBrains Mono', monospace";
    ctx.fillText(data.date || new Date().toISOString().split("T")[0], rightX, 145);

    // Trend
    const trend = data.trend || "flat";
    const trendLabel = trend === "up" ? "📈 Trending Up" : trend === "down" ? "📉 Trending Down" : "➡️ Holding Steady";
    ctx.fillStyle = trend === "up" ? "#2ECC71" : trend === "down" ? "#E85C6A" : "#8890A6";
    ctx.font = "bold 20px Inter, -apple-system, sans-serif";
    ctx.fillText(trendLabel, rightX, 200);

    // Summary
    if (data.summary) {
        ctx.fillStyle = "#8890A6";
        ctx.font = "500 16px Inter, -apple-system, sans-serif";
        const words = data.summary.split(" ");
        let line = "", lineY = 250;
        for (const word of words) {
            const test = line + word + " ";
            if (ctx.measureText(test).width > 750) {
                ctx.fillText(line.trim(), rightX, lineY);
                line = word + " ";
                lineY += 26;
                if (lineY > 340) break;
            } else {
                line = test;
            }
        }
        if (line.trim()) ctx.fillText(line.trim(), rightX, lineY);
    }

    // Streak badge
    if (data.streak && data.streak > 1) {
        ctx.fillStyle = "rgba(46,204,113,0.12)";
        const badgeW = 180, badgeH = 44, badgeX = rightX, badgeY = 380;
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 12);
        ctx.fill();
        ctx.fillStyle = "#2ECC71";
        ctx.font = "bold 18px Inter, -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`🔥 ${data.streak}-Week Streak`, badgeX + badgeW / 2, badgeY + 28);
        ctx.textAlign = "left";
    }

    // Stats row at bottom
    const statsY = 500;
    const stats = [
        { label: "CHECKING", value: data.checking || "—" },
        { label: "VAULT", value: data.vault || "—" },
        { label: "TOTAL DEBT", value: data.totalDebt || "—" },
    ];
    stats.forEach((s, i) => {
        const sx = rightX + i * 240;
        ctx.fillStyle = "#4A5068";
        ctx.font = "bold 11px 'JetBrains Mono', monospace";
        ctx.fillText(s.label, sx, statsY);
        ctx.fillStyle = "#E4E6F0";
        ctx.font = "bold 22px Inter, -apple-system, sans-serif";
        ctx.fillText(s.value, sx, statsY + 30);
    });

    // Footer branding
    ctx.fillStyle = "#2E3248";
    ctx.font = "600 12px 'JetBrains Mono', monospace";
    ctx.textAlign = "right";
    ctx.fillText("catalystcash.app", W - 40, H - 24);
}

export default function ShareCard({ current, streak = 0 }) {
    const canvasRef = useRef(null);
    const [sharing, setSharing] = useState(false);

    const handleShare = useCallback(async () => {
        if (!current?.parsed || !canvasRef.current) return;
        setSharing(true);
        try {
            const hs = current.parsed.healthScore || {};
            const form = current.form || {};
            const debts = (form.debts || []).reduce((s, d) => s + (parseFloat(d.balance) || 0), 0);

            drawScoreCard(canvasRef.current, {
                score: hs.score || 0,
                grade: hs.grade || "—",
                trend: hs.trend || "flat",
                summary: hs.summary || "",
                date: current.date || new Date().toISOString().split("T")[0],
                streak,
                checking: form.checking ? `$${Number(form.checking).toLocaleString()}` : "—",
                vault: form.ally ? `$${Number(form.ally).toLocaleString()}` : "—",
                totalDebt: debts ? `$${debts.toLocaleString()}` : "$0",
            });

            // Convert canvas to blob
            const blob = await new Promise(resolve => canvasRef.current.toBlob(resolve, "image/png"));
            if (!blob) throw new Error("Failed to render card");

            // Convert to data URL for sharing
            const reader = new FileReader();
            const dataUrl = await new Promise((resolve) => {
                reader.onload = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });

            // Use Capacitor Share
            await Share.share({
                title: "My Catalyst Cash Score",
                text: `Financial Health Score: ${hs.score}/100 (${hs.grade}) 📊`,
                url: "https://catalystcash.app",
                dialogTitle: "Share Your Score",
            });

        } catch (err) {
            console.warn("[ShareCard] share failed:", err);
        } finally {
            setSharing(false);
        }
    }, [current, streak]);

    if (!current?.parsed) return null;

    return (
        <>
            <canvas ref={canvasRef} style={{ display: "none" }} />
            <button onClick={handleShare} disabled={sharing} style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "10px 20px", borderRadius: T.radius.md,
                border: `1px solid ${T.accent.emerald}40`,
                background: `${T.accent.emerald}10`,
                color: T.accent.emerald, fontSize: 12, fontWeight: 700,
                cursor: sharing ? "wait" : "pointer",
                opacity: sharing ? 0.6 : 1,
                transition: "all 0.2s",
                width: "100%",
            }}>
                <Share2 size={14} />
                {sharing ? "Sharing..." : "Share Score Card"}
            </button>
        </>
    );
}
