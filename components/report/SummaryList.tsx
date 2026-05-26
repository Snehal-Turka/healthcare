"use client";

export function SummaryList({
  items,
  onChange,
}: {
  items: string[];
  onChange: (next: string[]) => void;
}) {
  const update = (i: number, v: string) =>
    onChange(items.map((it, idx) => (idx === i ? v : it)));
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const add = () => onChange([...items, ""]);

  return (
    <div className="summary-editor">
      {items.map((it, i) => (
        <div key={i} className="summary-row">
          <span className="summary-bullet" aria-hidden="true" />
          <textarea
            className="clinical-textarea"
            value={it}
            onChange={(e) => update(i, e.target.value)}
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="button-remove"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="button-subtle"
      >
        + Add point
      </button>
    </div>
  );
}
