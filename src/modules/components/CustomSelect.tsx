import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { T } from "../constants.js";
import { haptic } from "../haptics.js";
import { Check, ChevronDown } from "../icons";

interface SelectOption {
  value: string;
  label: string;
  group?: string;
}

interface SelectGroup {
  label: string;
  options: SelectOption[];
}

type SelectOptionLike = SelectOption | SelectGroup;

interface CustomSelectProps {
  value: string | null | undefined;
  onChange: (value: string) => void;
  options: SelectOptionLike[];
  placeholder?: string;
  ariaLabel?: string;
  icon?: ReactNode;
}

interface OptionItemProps {
  option: SelectOption;
  isSelected: boolean;
  onSelect: () => void;
}

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder = "Select...",
  ariaLabel,
  icon,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0, flip: false });

  const calcPosition = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const optionCount = options.flatMap((group) => ("options" in group ? group.options : [group])).length;
    const estimatedHeight = Math.min(240, Math.max(160, optionCount * 40));
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const flip = spaceBelow < estimatedHeight + 8 && spaceAbove > spaceBelow;
    const viewportPadding = 12;
    const desiredWidth = Math.min(window.innerWidth - viewportPadding * 2, Math.max(rect.width, 240));
    const maxLeft = Math.max(viewportPadding, window.innerWidth - desiredWidth - viewportPadding);

    setDropPos({
      top: flip ? rect.top - 6 : rect.bottom + 6,
      left: Math.min(Math.max(rect.left, viewportPadding), maxLeft),
      width: desiredWidth,
      flip,
    });
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target;
      if (
        containerRef.current &&
        target instanceof Element &&
        !containerRef.current.contains(target) &&
        !target.closest("[data-custom-select-portal]")
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    calcPosition();

    const onScroll = () => calcPosition();
    const onResize = () => calcPosition();

    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [isOpen, options]);

  const selectedOption = options.flatMap((group) => ("options" in group ? group.options : [group])).find((option) => option.value === value);

  return (
    <div ref={containerRef} style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={() => {
          haptic.selection();
          setIsOpen((open) => !open);
        }}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "10px 12px",
          background: isOpen ? `linear-gradient(180deg, ${T.bg.surface}, ${T.bg.card})` : `linear-gradient(180deg, ${T.bg.elevated}, ${T.bg.card})`,
          color: selectedOption ? T.text.primary : T.text.muted,
          border: `1.5px solid ${isOpen ? T.accent.primary : T.border.default}`,
          borderRadius: T.radius.md,
          fontFamily: T.font.sans,
          fontSize: 12,
          fontWeight: selectedOption ? 600 : 400,
          cursor: "pointer",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          transition: "all .2s ease",
          boxShadow: isOpen ? `0 0 0 3px ${T.accent.primaryDim}, 0 8px 18px rgba(0,0,0,0.18)` : `inset 0 1px 0 rgba(255,255,255,0.03)`,
          transform: "translateZ(0)",
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
          {icon && <span style={{ color: T.accent.primary, display: "flex", flexShrink: 0 }}>{icon}</span>}
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              color: "inherit",
              WebkitTextFillColor: "currentColor",
              transform: "translateZ(0)",
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
            }}
          >
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>
        <ChevronDown
          size={14}
          color={isOpen ? T.accent.primary : T.text.dim}
          style={{
            flexShrink: 0,
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform .3s var(--spring-stiff)",
          }}
        />
      </button>

      {isOpen &&
        createPortal(
          <div
            role="listbox"
            data-custom-select-portal
            className="slide-up"
            style={{
              position: "fixed",
              ...(dropPos.flip
                ? { bottom: window.innerHeight - dropPos.top, left: dropPos.left }
                : { top: dropPos.top, left: dropPos.left }),
              width: dropPos.width,
              zIndex: 99999,
              background: `linear-gradient(180deg, ${T.bg.card}, ${T.bg.elevated})`,
              border: `1px solid ${T.border.default}`,
              borderRadius: T.radius.md,
              boxShadow: `0 18px 40px rgba(0,0,0,0.34), 0 0 0 1px ${T.accent.primary}18`,
              maxHeight: 240,
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              padding: 4,
            }}
          >
            {options.map((groupOrOption, index) => {
              if ("options" in groupOrOption) {
                return (
                  <div key={groupOrOption.label || index} style={{ marginBottom: 4 }}>
                    <div
                      style={{
                        padding: "6px 12px 2px",
                        fontSize: 10,
                        fontWeight: 800,
                        color: T.text.dim,
                        fontFamily: T.font.mono,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {groupOrOption.label}
                    </div>
                    {groupOrOption.options.map((option) => (
                      <OptionItem
                        key={option.value}
                        option={option}
                        isSelected={value === option.value}
                        onSelect={() => {
                          haptic.selection();
                          onChange(option.value);
                          setIsOpen(false);
                        }}
                      />
                    ))}
                  </div>
                );
              }

              return (
                <OptionItem
                  key={groupOrOption.value}
                  option={groupOrOption}
                  isSelected={value === groupOrOption.value}
                  onSelect={() => {
                    haptic.selection();
                    onChange(groupOrOption.value);
                    setIsOpen(false);
                  }}
                />
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}

function OptionItem({ option, isSelected, onSelect }: OptionItemProps) {
  return (
    <button
      role="option"
      aria-selected={isSelected}
      onClick={onSelect}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 12px",
        fontSize: 12,
        fontWeight: isSelected ? 800 : 500,
        color: isSelected ? T.accent.primary : T.text.primary,
        background: isSelected ? `${T.accent.primary}14` : "transparent",
        border: "none",
        borderRadius: T.radius.sm,
        cursor: "pointer",
        textAlign: "left",
        transition: "background .15s ease",
      }}
      onMouseEnter={(event: ReactMouseEvent<HTMLButtonElement>) => {
        if (!isSelected) event.currentTarget.style.background = T.bg.elevated;
      }}
      onMouseLeave={(event: ReactMouseEvent<HTMLButtonElement>) => {
        if (!isSelected) event.currentTarget.style.background = "transparent";
      }}
    >
      <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {option.label}
      </span>
      {isSelected && <Check size={14} strokeWidth={3} />}
    </button>
  );
}
