"use client";
import type { NextMeeting as NextMeetingType } from "@/lib/domain/report/schema";

export function NextMeeting({
  value,
  onChange,
}: {
  value: NextMeetingType;
  onChange: (v: NextMeetingType) => void;
}) {
  if (value === null) {
    return (
      <button
        type="button"
        onClick={() => onChange({ agenda: "", suggestedAt: null })}
        className="button-subtle"
      >
        + Add next meeting
      </button>
    );
  }
  const localValue = value.suggestedAt ? value.suggestedAt.slice(0, 16) : "";
  return (
    <div className="clinical-flow">
      <textarea
        className="clinical-textarea w-full"
        placeholder="Agenda"
        value={value.agenda}
        onChange={(e) => onChange({ ...value, agenda: e.target.value })}
      />
      <input
        type="datetime-local"
        className="clinical-input w-fit"
        value={localValue}
        onChange={(e) =>
          onChange({
            ...value,
            suggestedAt: e.target.value
              ? new Date(e.target.value).toISOString()
              : null,
          })
        }
      />
      <button
        type="button"
        onClick={() => onChange(null)}
        className="button-remove w-fit"
      >
        Remove
      </button>
    </div>
  );
}
