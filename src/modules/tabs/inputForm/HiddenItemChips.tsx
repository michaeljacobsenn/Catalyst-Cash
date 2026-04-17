import { useState } from "react";
import { T } from "../../constants.js";
import { Plus } from "../../icons";

interface HiddenItemChipsProps<T> {
  title: string;
  items: T[];
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  getColor: (item: T) => string;
  onSelect: (item: T) => void;
  collapseThreshold?: number;
  previewCount?: number;
}

export function HiddenItemChips<T>({
  title,
  items,
  getKey,
  getLabel,
  getColor,
  onSelect,
  collapseThreshold = 3,
  previewCount = 2,
}: HiddenItemChipsProps<T>) {
  const [showAll, setShowAll] = useState(false);

  if (!items.length) return null;

  const visibleItems =
    items.length > collapseThreshold && !showAll
      ? items.slice(0, previewCount)
      : items;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        flexWrap: "wrap",
        paddingTop: 10,
      }}
    >
      <span style={{ fontSize: 11, color: T.text.dim, fontWeight: 700 }}>{title}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {visibleItems.map((item) => {
          const color = getColor(item);
          return (
            <button
              key={getKey(item)}
              type="button"
              onClick={() => onSelect(item)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                minHeight: 32,
                padding: "0 12px",
                borderRadius: 999,
                border: `1px solid ${color}35`,
                background: `${color}12`,
                color,
                fontSize: 11,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              <Plus size={11} strokeWidth={2.6} />
              {getLabel(item)}
            </button>
          );
        })}
        {items.length > collapseThreshold && (
          <button
            type="button"
            onClick={() => setShowAll((prev) => !prev)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              minHeight: 32,
              padding: "0 12px",
              borderRadius: 999,
              border: `1px solid ${T.border.default}`,
              background: T.bg.elevated,
              color: T.text.secondary,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {showAll ? "Show less" : `+${items.length - previewCount} more`}
          </button>
        )}
      </div>
    </div>
  );
}
