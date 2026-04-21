import { useMemo, useState, type ReactNode } from "react";

import { CustomSelect as UICustomSelect } from "../../components.js";
import { T } from "../../constants.js";
import { Plus } from "../../icons";

export interface SectionAddOption {
  id: string;
  label: string;
  detail?: string;
}

interface SelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string | null | undefined;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  ariaLabel?: string;
}

interface SectionAddControlProps {
  accent: string;
  buttonAriaLabel: string;
  options: SectionAddOption[];
  pickerLabel: string;
  placeholder: string;
  onSelect: (id: string) => void;
}

const CustomSelect = UICustomSelect as unknown as (props: CustomSelectProps) => ReactNode;

export function SectionAddControl({
  accent,
  buttonAriaLabel,
  options,
  pickerLabel,
  placeholder,
  onSelect,
}: SectionAddControlProps) {
  const [showPicker, setShowPicker] = useState(false);
  const selectOptions = useMemo<SelectOption[]>(
    () => options.map((option) => ({ value: option.id, label: option.label })),
    [options]
  );

  if (!options.length) return null;

  const handleAddPress = () => {
    const firstOption = options[0];
    if (options.length === 1 && firstOption) {
      onSelect(firstOption.id);
      return;
    }
    setShowPicker((current) => !current);
  };

  const handleSelect = (id: string) => {
    setShowPicker(false);
    onSelect(id);
  };

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button type="button"
        aria-label={buttonAriaLabel}
        className="hover-btn"
        onClick={handleAddPress}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          minWidth: 68,
          minHeight: 32,
          padding: "0 12px",
          borderRadius: 999,
          border: `1px solid ${accent}40`,
          background: `${accent}12`,
          color: accent,
          fontSize: 10,
          fontWeight: 800,
          fontFamily: T.font.mono,
          letterSpacing: "0.04em",
          justifyContent: "center",
          boxShadow: "none",
          transition: "transform .2s ease, opacity .2s ease, background-color .2s ease, border-color .2s ease, color .2s ease, box-shadow .2s ease",
        }}
      >
        <Plus size={11} strokeWidth={2.8} />
        ADD
      </button>

      {showPicker && options.length > 1 ? (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: "min(280px, calc(100vw - 48px))",
            padding: "10px 12px",
            borderRadius: T.radius.md,
            border: `1px solid ${T.border.subtle}`,
            background: T.bg.card,
            display: "grid",
            gap: 6,
            boxShadow: T.shadow.elevated,
            zIndex: 30,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: T.text.dim,
              fontFamily: T.font.mono,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            {pickerLabel}
          </div>
          <CustomSelect
            ariaLabel={buttonAriaLabel}
            value=""
            onChange={handleSelect}
            options={selectOptions}
            placeholder={placeholder}
          />
        </div>
      ) : null}
    </div>
  );
}
