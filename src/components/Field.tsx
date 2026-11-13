"use client";

export function fieldId(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function Field(props: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  inputMode?: "text" | "decimal" | "numeric";
  type?: "text" | "date";
  autoComplete?: string;
  id?: string;
}) {
  const id = props.id ?? fieldId(props.label);
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {props.label}
      </label>
      {props.multiline ? (
        <textarea
          id={id}
          rows={2}
          className="field-input"
          value={props.value}
          placeholder={props.placeholder}
          onChange={(e) => props.onChange(e.target.value)}
        />
      ) : (
        <input
          id={id}
          type={props.type ?? "text"}
          className="field-input"
          value={props.value}
          placeholder={props.placeholder}
          inputMode={props.inputMode}
          autoComplete={props.autoComplete ?? "off"}
          onChange={(e) => props.onChange(e.target.value)}
        />
      )}
      {props.hint && <p className="mt-1 text-xs text-ink-soft">{props.hint}</p>}
    </div>
  );
}
