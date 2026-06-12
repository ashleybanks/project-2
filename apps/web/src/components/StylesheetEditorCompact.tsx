import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { StylesheetDef, StyleKey, ParagraphStyle, TextStyle, TableCellStyle } from "@/lib/api";
import { FontField, ColourInput, PtInput } from "@/components/StylesheetEditor";

interface Props {
  value: StylesheetDef;
  onChange: (v: StylesheetDef) => void;
  visibleStyles?: StyleKey[];
  storageKey?: string;
}

type AccordionKey = "headings" | "text" | "tables";

const HEADING_KEYS: Extract<StyleKey, "h1"|"h2"|"h3"|"h4"|"h5"|"h6">[] =
  ["h1", "h2", "h3", "h4", "h5", "h6"];

const HEADING_LABEL: Record<string, string> = {
  h1: "H1", h2: "H2", h3: "H3", h4: "H4", h5: "H5", h6: "H6",
};

export default function StylesheetEditorCompact({ value, onChange, visibleStyles, storageKey }: Props) {
  const isVisible = (key: StyleKey) => !visibleStyles || visibleStyles.includes(key);
  const visibleHeadings = HEADING_KEYS.filter(k => isVisible(k));
  const showTables = isVisible("tableHeader") || isVisible("tableData");

  const [open, setOpen] = useState<Record<AccordionKey, boolean>>(() => {
    if (storageKey) {
      const raw = localStorage.getItem(`sse-${storageKey}`);
      if (raw) { try { return JSON.parse(raw); } catch {} }
    }
    return { headings: true, text: false, tables: false };
  });

  function toggleSection(key: AccordionKey) {
    const next = { ...open, [key]: !open[key] };
    setOpen(next);
    if (storageKey) localStorage.setItem(`sse-${storageKey}`, JSON.stringify(next));
  }

  function setGlobal<K extends keyof StylesheetDef>(key: K, val: StylesheetDef[K]) {
    onChange({ ...value, [key]: val || undefined });
  }

  function setStyleField(styleKey: StyleKey, field: string, val: number | string | undefined) {
    const current = (value[styleKey] as Record<string, unknown> | undefined) ?? {};
    const updated: Record<string, unknown> = { ...current, [field]: val };
    if (val === undefined || val === "") delete updated[field];
    const hasValues = Object.values(updated).some(v => v !== undefined && v !== "");
    onChange({ ...value, [styleKey]: hasValues ? updated as ParagraphStyle : undefined });
  }

  return (
    <div className="border-t border-border">
      {visibleHeadings.length > 0 && (
        <Section label="Heading styles" open={open.headings} onToggle={() => toggleSection("headings")}>
          <div className="space-y-3">
            <FontField labelClassName="text-xs" label="Heading font" value={value.headingFont} onChange={v => setGlobal("headingFont", v || undefined)} />
            <ColourInput labelClassName="text-xs" label="Heading colour" value={value.headingColour} onChange={v => setGlobal("headingColour", v)} />
            <div className="border-t border-border pt-2 space-y-3">
              {visibleHeadings.map(hk => (
                <CompactStyleEntry
                  key={hk}
                  label={HEADING_LABEL[hk]}
                  style={(value[hk] as ParagraphStyle | undefined) ?? {}}
                  extraFields={false}
                  onChange={(f, v) => setStyleField(hk, f, v)}
                />
              ))}
            </div>
          </div>
        </Section>
      )}

      <Section label="Text styles" open={open.text} onToggle={() => toggleSection("text")}>
        <div className="space-y-3">
          <FontField labelClassName="text-xs" label="Body font" value={value.bodyFont} onChange={v => setGlobal("bodyFont", v || undefined)} />
          <ColourInput labelClassName="text-xs" label="Body colour" value={value.bodyColour} onChange={v => setGlobal("bodyColour", v)} />
          <div className="border-t border-border pt-2">
            <CompactStyleEntry
              label="Normal"
              style={(value.normal as TextStyle | undefined) ?? {}}
              extraFields="indent"
              onChange={(f, v) => setStyleField("normal", f, v)}
            />
          </div>
        </div>
      </Section>

      {showTables && (
        <Section label="Table styles" open={open.tables} onToggle={() => toggleSection("tables")}>
          <div className="space-y-3">
            {isVisible("tableHeader") && (
              <CompactTableEntry
                label="Header cells"
                style={(value.tableHeader as TableCellStyle | undefined) ?? {}}
                onChange={(f, v) => setStyleField("tableHeader", f, v)}
              />
            )}
            {isVisible("tableData") && (
              <CompactTableEntry
                label="Data cells"
                style={(value.tableData as TableCellStyle | undefined) ?? {}}
                onChange={(f, v) => setStyleField("tableData", f, v)}
              />
            )}
          </div>
        </Section>
      )}
    </div>
  );
}

// ── Section accordion ──────────────────────────────────────────────────────────

function Section({ label, open, onToggle, children }: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>{label}</span>
        {open
          ? <ChevronDown className="w-3.5 h-3.5 shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

// ── Compact field rows ─────────────────────────────────────────────────────────

function CompactStyleEntry({ label, style, extraFields, onChange }: {
  label: string;
  style: ParagraphStyle & { indentSize?: number };
  extraFields: false | "indent";
  onChange: (field: string, val: number | undefined) => void;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-1.5">{label}</p>
      <div className="space-y-2">
        <PtInput labelClassName="text-xs" label="Font size" value={style.fontSize} onChange={v => onChange("fontSize", v)} />
        <div className="grid grid-cols-2 gap-2">
          <PtInput labelClassName="text-xs" label="Spacing before" value={style.spacingBefore} onChange={v => onChange("spacingBefore", v)} />
          <PtInput labelClassName="text-xs" label="Spacing after"  value={style.spacingAfter}  onChange={v => onChange("spacingAfter", v)} />
        </div>
        {extraFields === "indent" && (
          <PtInput labelClassName="text-xs" label="Indent" value={(style as TextStyle).indentSize} onChange={v => onChange("indentSize", v)} />
        )}
      </div>
    </div>
  );
}

function CompactTableEntry({ label, style, onChange }: {
  label: string;
  style: TableCellStyle;
  onChange: (field: string, val: number | string | undefined) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <PtInput labelClassName="text-xs" label="Font size" value={style.fontSize} onChange={v => onChange("fontSize", v)} />
      <div className="grid grid-cols-2 gap-2">
        <PtInput labelClassName="text-xs" label="Spacing before" value={style.spacingBefore} onChange={v => onChange("spacingBefore", v)} />
        <PtInput labelClassName="text-xs" label="Spacing after"  value={style.spacingAfter}  onChange={v => onChange("spacingAfter", v)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <PtInput labelClassName="text-xs" label="Line width" value={style.lineWidth} onChange={v => onChange("lineWidth", v)} />
        <ColourInput labelClassName="text-xs" label="Line colour" value={style.lineColour} onChange={v => onChange("lineColour", v)} />
      </div>
    </div>
  );
}
