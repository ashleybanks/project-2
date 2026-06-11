import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardAction, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { StylesheetDef, StyleKey, ParagraphStyle, TextStyle, TableCellStyle } from "@/lib/api";
import { FONTS } from "@/lib/fonts";

interface Props {
  value: StylesheetDef;
  onChange: (v: StylesheetDef) => void;
  visibleStyles?: StyleKey[];
  storageKey?: string;
  compact?: boolean;
}

type AccordionKey = "headings" | "text" | "tables";

const HEADING_KEYS: Extract<StyleKey, "h1"|"h2"|"h3"|"h4"|"h5"|"h6">[] =
  ["h1", "h2", "h3", "h4", "h5", "h6"];

const HEADING_LABEL: Record<string, string> = {
  h1: "H1", h2: "H2", h3: "H3", h4: "H4", h5: "H5", h6: "H6",
};

export default function StylesheetEditor({ value, onChange, visibleStyles, storageKey, compact = false }: Props) {
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

  // In compact mode wrap sections in a top-bordered container; normal uses card spacing
  const wrapperCls = compact ? "border-t border-border" : "space-y-3";

  return (
    <div className={wrapperCls}>
      {/* Heading styles */}
      {visibleHeadings.length > 0 && (
        <Section label="Heading styles" open={open.headings} onToggle={() => toggleSection("headings")} compact={compact}>
          <div className="space-y-3">
            <FontColourRow
              fontLabel="Heading font" fontValue={value.headingFont}
              onFontChange={v => setGlobal("headingFont", v || undefined)}
              colourLabel="Heading colour" colourValue={value.headingColour}
              onColourChange={v => setGlobal("headingColour", v)}
              compact={compact}
            />
            <div className={cn("space-y-3", !compact && "border-t border-border pt-3")}>
              {visibleHeadings.map(hk => (
                <StyleEntry
                  key={hk}
                  label={HEADING_LABEL[hk]}
                  style={(value[hk] as ParagraphStyle | undefined) ?? {}}
                  extraFields={false}
                  compact={compact}
                  onChange={(f, v) => setStyleField(hk, f, v)}
                />
              ))}
            </div>
          </div>
        </Section>
      )}

      {/* Text styles */}
      <Section label="Text styles" open={open.text} onToggle={() => toggleSection("text")} compact={compact}>
        <div className="space-y-3">
          <FontColourRow
            fontLabel="Body font" fontValue={value.bodyFont}
            onFontChange={v => setGlobal("bodyFont", v || undefined)}
            colourLabel="Body colour" colourValue={value.bodyColour}
            onColourChange={v => setGlobal("bodyColour", v)}
            compact={compact}
          />
          <div className={cn(!compact && "border-t border-border pt-3")}>
            <StyleEntry
              label="Normal"
              style={(value.normal as TextStyle | undefined) ?? {}}
              extraFields="indent"
              compact={compact}
              onChange={(f, v) => setStyleField("normal", f, v)}
            />
          </div>
        </div>
      </Section>

      {/* Table styles */}
      {showTables && (
        <Section label="Table styles" open={open.tables} onToggle={() => toggleSection("tables")} compact={compact}>
          <div className="space-y-4">
            {isVisible("tableHeader") && (
              <TableStyleEntry
                label="Header cells"
                style={(value.tableHeader as TableCellStyle | undefined) ?? {}}
                compact={compact}
                onChange={(f, v) => setStyleField("tableHeader", f, v)}
              />
            )}
            {isVisible("tableData") && (
              <TableStyleEntry
                label="Data cells"
                style={(value.tableData as TableCellStyle | undefined) ?? {}}
                compact={compact}
                onChange={(f, v) => setStyleField("tableData", f, v)}
              />
            )}
          </div>
        </Section>
      )}
    </div>
  );
}

// ── Section — card on brand rules page, flat header in sidebar ─────────────

function Section({
  label, open, onToggle, compact, children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  compact: boolean;
  children: React.ReactNode;
}) {
  if (compact) {
    return (
      <div className="border-b border-border">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold text-zinc-600 hover:text-foreground transition-colors"
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

  return (
    <Card size="sm">
      <CardHeader
        className={cn("cursor-pointer select-none", open && "border-b border-border")}
        onClick={onToggle}
      >
        <CardTitle>{label}</CardTitle>
        <CardAction>
          {open
            ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
            : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </CardAction>
      </CardHeader>
      {open && <CardContent>{children}</CardContent>}
    </Card>
  );
}

// ── Font + colour — side by side (normal) or stacked (compact) ─────────────

function FontColourRow({
  fontLabel, fontValue, onFontChange,
  colourLabel, colourValue, onColourChange,
  compact,
}: {
  fontLabel: string; fontValue?: string; onFontChange: (v: string) => void;
  colourLabel: string; colourValue?: string; onColourChange: (v: string | undefined) => void;
  compact: boolean;
}) {
  if (compact) {
    return (
      <div className="space-y-2.5">
        <FontField label={fontLabel} value={fontValue} onChange={onFontChange} />
        <ColourInput label={colourLabel} value={colourValue} onChange={onColourChange} />
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-4">
      <FontField label={fontLabel} value={fontValue} onChange={onFontChange} />
      <ColourInput label={colourLabel} value={colourValue} onChange={onColourChange} />
    </div>
  );
}

// ── Style entry rows ──────────────────────────────────────────────────────────

function StyleEntry({
  label, style, extraFields, compact, onChange,
}: {
  label: string;
  style: ParagraphStyle & { indentSize?: number };
  extraFields: false | "indent";
  compact: boolean;
  onChange: (field: string, val: number | undefined) => void;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-foreground/70 mb-1.5">{label}</p>
      {compact ? (
        <div className="space-y-2">
          <PtInput label="Font size" value={style.fontSize} onChange={v => onChange("fontSize", v)} />
          <div className="grid grid-cols-2 gap-2">
            <PtInput label="Spacing before" value={style.spacingBefore} onChange={v => onChange("spacingBefore", v)} />
            <PtInput label="Spacing after"  value={style.spacingAfter}  onChange={v => onChange("spacingAfter", v)} />
          </div>
          {extraFields === "indent" && (
            <PtInput label="Indent" value={(style as TextStyle).indentSize} onChange={v => onChange("indentSize", v)} />
          )}
        </div>
      ) : (
        <div className={`grid ${extraFields === "indent" ? "grid-cols-4" : "grid-cols-3"} gap-4 w-1/2`}>
          <PtInput label="Font size"      value={style.fontSize}      onChange={v => onChange("fontSize", v)} />
          <PtInput label="Spacing before" value={style.spacingBefore} onChange={v => onChange("spacingBefore", v)} />
          <PtInput label="Spacing after"  value={style.spacingAfter}  onChange={v => onChange("spacingAfter", v)} />
          {extraFields === "indent" && (
            <PtInput label="Indent" value={(style as TextStyle).indentSize} onChange={v => onChange("indentSize", v)} />
          )}
        </div>
      )}
    </div>
  );
}

function TableStyleEntry({
  label, style, compact, onChange,
}: {
  label: string;
  style: TableCellStyle;
  compact: boolean;
  onChange: (field: string, val: number | string | undefined) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-foreground/70">{label}</p>
      {compact ? (
        <>
          <PtInput label="Font size" value={style.fontSize} onChange={v => onChange("fontSize", v)} />
          <div className="grid grid-cols-2 gap-2">
            <PtInput label="Spacing before" value={style.spacingBefore} onChange={v => onChange("spacingBefore", v)} />
            <PtInput label="Spacing after"  value={style.spacingAfter}  onChange={v => onChange("spacingAfter", v)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <PtInput label="Line width" value={style.lineWidth} onChange={v => onChange("lineWidth", v)} />
            <ColourInput label="Line colour" value={style.lineColour} onChange={v => onChange("lineColour", v)} />
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 w-1/2">
            <PtInput label="Font size"      value={style.fontSize}      onChange={v => onChange("fontSize", v)} />
            <PtInput label="Spacing before" value={style.spacingBefore} onChange={v => onChange("spacingBefore", v)} />
            <PtInput label="Spacing after"  value={style.spacingAfter}  onChange={v => onChange("spacingAfter", v)} />
          </div>
          <div className="grid grid-cols-2 gap-2 items-end">
            <PtInput label="Line width" value={style.lineWidth} onChange={v => onChange("lineWidth", v)} />
            <ColourInput label="Line colour" value={style.lineColour} onChange={v => onChange("lineColour", v)} />
          </div>
        </>
      )}
    </div>
  );
}

// ── Field components ──────────────────────────────────────────────────────────

function FontField({
  label, value, onChange,
}: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
}) {
  const groups = [
    { group: "Sans-serif", fonts: FONTS.filter(f => f.group === "Sans-serif") },
    { group: "Serif",      fonts: FONTS.filter(f => f.group === "Serif") },
    { group: "Special",    fonts: FONTS.filter(f => f.group === "Special") },
  ];

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <select
        className="w-full h-8 text-sm rounded-md border border-input bg-background px-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        value={value || ""}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">— None —</option>
        {groups.map(({ group, fonts }) => (
          <optgroup key={group} label={group}>
            {fonts.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

function ColourInput({
  label, value, onChange,
}: {
  label: string;
  value?: string;
  onChange: (v: string | undefined) => void;
}) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const [hex, setHex] = useState(value?.replace("#", "") ?? "");

  useEffect(() => {
    setHex(value?.replace("#", "") ?? "");
  }, [value]);

  const swatchColour = value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#e5e7eb";

  function handleText(raw: string) {
    const clean = raw.replace(/[^0-9a-fA-F]/gi, "").slice(0, 6).toUpperCase();
    setHex(clean);
    if (clean.length === 6) onChange("#" + clean);
    else if (clean.length === 0) onChange(undefined);
  }

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex h-8 rounded-md border border-input overflow-hidden bg-background">
        <button
          type="button"
          className="w-8 shrink-0 border-r border-input hover:opacity-90 transition-opacity"
          style={{ backgroundColor: swatchColour }}
          onClick={() => pickerRef.current?.click()}
          title="Pick colour"
        />
        <input ref={pickerRef} type="color" className="sr-only"
          value={swatchColour}
          onChange={e => { onChange(e.target.value); }}
        />
        <input
          type="text"
          className="flex-1 h-full px-2 text-xs bg-transparent focus:outline-none font-mono uppercase tracking-wider"
          placeholder="—"
          value={hex}
          onChange={e => handleText(e.target.value)}
        />
      </div>
    </div>
  );
}

function PtInput({
  label, value, onChange,
}: {
  label: string;
  value?: number;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <div>
      <span className="text-[10px] text-muted-foreground block mb-0.5">{label} (pt)</span>
      <input
        type="number"
        min={0}
        step={0.5}
        className="w-full h-7 text-xs px-1.5 rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        value={value ?? ""}
        onChange={e => onChange(e.target.value ? Number(e.target.value) : undefined)}
      />
    </div>
  );
}
