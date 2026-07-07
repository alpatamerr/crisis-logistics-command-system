import { type ReactNode, useState, useRef, useEffect } from "react";
import { Icon, Tag, Intent } from "@blueprintjs/core";

interface ActiveFilter {
  key: string;
  label: string;
  intent?: Intent;
  onRemove: () => void;
}

interface FilterBarProps {
  /** Search input config */
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  };
  /** Active filter chips displayed inline */
  activeFilters?: ActiveFilter[];
  /** Callback to clear all filters */
  onClearAll?: () => void;
  /** Content rendered inside the popover */
  children: ReactNode;
  /** Extra elements on the right (e.g. Export button) */
  extra?: ReactNode;
}

export default function FilterBar({
  search,
  activeFilters = [],
  onClearAll,
  children,
  extra,
}: FilterBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!isOpen) { return; }
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  return (
    <div className="filter-bar">
      <div className="filter-bar-left">
        {/* Search */}
        {search && (
          <div className="filter-bar-search">
            <Icon icon="search" size={14} className="filter-bar-search-icon" />
            <input
              type="text"
              className="filter-bar-search-input"
              placeholder={search.placeholder ?? "Search..."}
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
            />
            {search.value && (
              <button
                className="filter-bar-search-clear"
                onClick={() => search.onChange("")}
              >
                <Icon icon="small-cross" size={14} />
              </button>
            )}
          </div>
        )}

        {/* Add Filters Button */}
        <div style={{ position: "relative" }}>
          <button
            ref={triggerRef}
            className={`filter-bar-add-btn ${isOpen ? "active" : ""} ${activeFilters.length > 0 ? "has-filters" : ""}`}
            onClick={() => setIsOpen(!isOpen)}
          >
            <Icon icon="filter-list" size={14} />
            <span>Add filters</span>
            {activeFilters.length > 0 && (
              <span className="filter-bar-badge">{activeFilters.length}</span>
            )}
            <Icon icon={isOpen ? "chevron-up" : "chevron-down"} size={10} />
          </button>

          {/* Popover */}
          {isOpen && (
            <div ref={popoverRef} className="filter-popover">
              <div className="filter-popover-content">
                {children}
              </div>
            </div>
          )}
        </div>

        {/* Active Filter Chips */}
        {activeFilters.length > 0 && (
          <div className="filter-bar-chips">
            {activeFilters.map((f) => (
              <Tag
                key={f.key}
                minimal
                intent={f.intent ?? Intent.PRIMARY}
                onRemove={f.onRemove}
                style={{ fontSize: 11 }}
              >
                {f.label}
              </Tag>
            ))}
            {activeFilters.length > 1 && onClearAll && (
              <button className="filter-bar-clear" onClick={onClearAll}>
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      {/* Right: Extra controls */}
      {extra && <div className="filter-bar-right">{extra}</div>}
    </div>
  );
}

/** Reusable filter section inside the popover */
export function FilterSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="filter-section">
      <div className="filter-section-title">{title}</div>
      <div className="filter-section-options">{children}</div>
    </div>
  );
}

/** Clickable filter option */
export function FilterOption({
  label,
  selected,
  onClick,
  intent,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  intent?: Intent;
}) {
  return (
    <button
      className={`filter-option ${selected ? "selected" : ""}`}
      onClick={onClick}
      data-intent={selected ? (intent ?? "primary") : undefined}
    >
      <span className="filter-option-check">
        {selected && <Icon icon="small-tick" size={14} />}
      </span>
      <span>{label}</span>
    </button>
  );
}

/** Toggle switch option for the popover */
export function FilterToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      className={`filter-option ${checked ? "selected" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="filter-option-check">
        {checked && <Icon icon="small-tick" size={14} />}
      </span>
      <span>{label}</span>
    </button>
  );
}
