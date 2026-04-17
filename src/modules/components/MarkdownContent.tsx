import { T } from "../constants.js";

interface MdProps {
  text?: string | null;
}

export default function MarkdownContent({ text }: MdProps) {
  if (!text) return null;

  return (
    <div
      style={{
        fontSize: 13,
        lineHeight: 1.75,
        color: T.text.secondary,
        overflowWrap: "anywhere",
        wordBreak: "break-word",
      }}
    >
      {text.split("\n").map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={index} style={{ height: 6 }} />;
        if (/^---+$/.test(trimmed)) return <Divider key={index} />;

        if (line.startsWith("### ")) {
          return (
            <h4
              key={index}
              style={{
                color: T.text.primary,
                fontSize: "clamp(15px, 4vw, 17px)",
                fontWeight: 600,
                letterSpacing: "-0.02em",
                margin: "14px 0 6px",
                fontFamily: T.font.mono,
                lineHeight: 1.3,
              }}
            >
              {line.slice(4).replace(/\*\*/g, "").trim()}
            </h4>
          );
        }

        if (line.startsWith("## ")) {
          return (
            <h3
              key={index}
              style={{
                color: T.text.primary,
                fontSize: "clamp(18px, 5vw, 22px)",
                fontWeight: 700,
                letterSpacing: "-0.01em",
                margin: "18px 0 8px",
                lineHeight: 1.2,
              }}
            >
              {line.slice(3).replace(/\*\*/g, "").trim()}
            </h3>
          );
        }

        if (/^\*\*[A-Z\s]+CARD\*\*$/.test(trimmed)) {
          return (
            <h3
              key={index}
              style={{ color: T.text.primary, fontSize: "clamp(15px, 4vw, 17px)", fontWeight: 600, margin: "14px 0 6px", lineHeight: 1.3 }}
            >
              {trimmed.replace(/\*\*/g, "").trim()}
            </h3>
          );
        }

        if (/^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
          const numbered = trimmed.match(/^(\d+\.)\s+(.*)$/);
          const bulletText = (numbered?.[2] ?? trimmed.replace(/^[-*]\s+/, "")).trim();
          const marker = numbered ? numbered[1] : "•";
          const parts = bulletText.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);

          return (
            <div key={index} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
              <span
                aria-hidden="true"
                style={{
                  flexShrink: 0,
                  width: 18,
                  marginTop: 2,
                  color: T.accent.primary,
                  fontSize: 12,
                  fontWeight: 800,
                  fontFamily: numbered ? T.font.mono : T.font.sans,
                }}
              >
                {marker}
              </span>
              <p style={{ margin: 0, fontSize: "clamp(14px, 3.7vw, 15px)", lineHeight: 1.6, overflowWrap: "anywhere" }}>
                {parts.map((part, partIndex) => renderInlinePart(part, partIndex))}
              </p>
            </div>
          );
        }

        if (line.startsWith("|")) {
          const cells = line
            .split("|")
            .filter((cell) => cell.trim())
            .map((cell) => cell.trim());
          if (cells.every((cell) => /^[-:]+$/.test(cell))) return null;

          return (
            <div
              key={index}
              style={{
                display: "flex",
                gap: 2,
                fontSize: 13,
                fontFamily: T.font.mono,
                padding: "6px 0",
                borderBottom: `1px solid ${T.border.subtle}`,
              }}
            >
              {cells.map((cell, cellIndex) => (
                <span key={cellIndex} style={{ flex: 1, padding: "2px 4px", color: T.text.secondary, overflowWrap: "anywhere" }}>
                  {cell.replace(/\*\*/g, "")}
                </span>
              ))}
            </div>
          );
        }

        const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
        return (
          <p key={index} style={{ marginBottom: 6, fontSize: "clamp(14px, 3.7vw, 15px)", lineHeight: 1.62, overflowWrap: "anywhere" }}>
            {parts.map((part, partIndex) => renderInlinePart(part, partIndex))}
          </p>
        );
      })}
    </div>
  );
}

function Divider() {
  return (
    <div
      style={{
        height: 1,
        background: `linear-gradient(90deg,transparent,${T.border.default},transparent)`,
        margin: "14px 0",
      }}
    />
  );
}

function renderInlinePart(part: string, key: number) {
  if (part.startsWith("**") && part.endsWith("**")) {
    return (
      <strong key={key} style={{ color: T.text.primary, fontWeight: 700 }}>
        {part.slice(2, -2)}
      </strong>
    );
  }

  if (part.startsWith("`") && part.endsWith("`")) {
    return (
      <code
        key={key}
        style={{
          fontFamily: T.font.mono,
          fontSize: 13,
          color: T.accent.primary,
          background: T.accent.primaryDim,
          padding: "2px 6px",
          borderRadius: 4,
          whiteSpace: "break-spaces",
          overflowWrap: "anywhere",
        }}
      >
        {part.slice(1, -1)}
      </code>
    );
  }

  return <span key={key}>{part}</span>;
}
