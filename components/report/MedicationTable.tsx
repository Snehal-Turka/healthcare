"use client";
import type { Medication } from "@/lib/domain/report/schema";

const EMPTY: Medication = {
  medicine: "",
  dose: "",
  timing: { morning: false, afternoon: false, night: false },
  duration: "",
};

export function MedicationTable({
  rows,
  onChange,
}: {
  rows: Medication[];
  onChange: (next: Medication[]) => void;
}) {
  const set = (i: number, patch: Partial<Medication>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const toggle = (i: number, key: "morning" | "afternoon" | "night") =>
    set(i, { timing: { ...rows[i].timing, [key]: !rows[i].timing[key] } });

  return (
    <div>
      <div className="medication-table-wrap">
        <table className="medication-table">
          <thead>
            <tr>
              <th>Medicine</th>
              <th>Dose</th>
              <th>Morn</th>
              <th>Aft</th>
              <th>Night</th>
              <th>Duration</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <input
                    className="clinical-input"
                    value={r.medicine}
                    onChange={(e) => set(i, { medicine: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="clinical-input"
                    value={r.dose}
                    onChange={(e) => set(i, { dose: e.target.value })}
                  />
                </td>
                <td className="text-center">
                  <input
                    type="checkbox"
                    className="clinical-checkbox"
                    checked={r.timing.morning}
                    onChange={() => toggle(i, "morning")}
                  />
                </td>
                <td className="text-center">
                  <input
                    type="checkbox"
                    className="clinical-checkbox"
                    checked={r.timing.afternoon}
                    onChange={() => toggle(i, "afternoon")}
                  />
                </td>
                <td className="text-center">
                  <input
                    type="checkbox"
                    className="clinical-checkbox"
                    checked={r.timing.night}
                    onChange={() => toggle(i, "night")}
                  />
                </td>
                <td>
                  <input
                    className="clinical-input"
                    value={r.duration}
                    onChange={(e) => set(i, { duration: e.target.value })}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() =>
                      onChange(rows.filter((_, idx) => idx !== i))
                    }
                    className="button-remove"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={() => onChange([...rows, { ...EMPTY }])}
        className="button-subtle mt-3"
      >
        + Add medicine
      </button>
    </div>
  );
}
