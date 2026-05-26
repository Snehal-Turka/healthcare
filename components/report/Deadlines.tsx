function fmt(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
}

export function Deadlines({
  freeVisitDeadline,
  medicineExpiryDate,
}: {
  freeVisitDeadline: string | null;
  medicineExpiryDate: string | null;
}) {
  return (
    <div className="deadline-grid">
      <div className="deadline-card visit">
        <p className="deadline-title">Free-visit deadline</p>
        <p>
          Revisit at no charge before <strong>{fmt(freeVisitDeadline)}</strong>.
        </p>
      </div>
      <div className="deadline-card medicine">
        <p className="deadline-title">Medicine expiry &amp; mandatory revisit</p>
        <p>
          Course ends around <strong>{fmt(medicineExpiryDate)}</strong>; an
          in-person revisit is required.
        </p>
      </div>
    </div>
  );
}
