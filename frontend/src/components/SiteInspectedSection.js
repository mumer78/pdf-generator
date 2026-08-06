import React from "react";

export default function SiteInspectedSection({ data, onChange }) {
  const set = (field) => (e) => onChange({ ...data, [field]: e.target.value });

  return (
    <div className="section-block">
      <h3 className="section-heading">Site Inspected</h3>
      <div className="field-grid">
        <label>Address</label>
        <input value={data.address || ""} onChange={set("address")} placeholder="e.g. 1249 Lamont Cres" />

        <label>Reason for Inspection</label>
        <input
          value={data.reason_for_inspection || ""}
          onChange={set("reason_for_inspection")}
          placeholder="e.g. Wind Storm Damage"
        />

        <label>Inspector</label>
        <input value={data.inspector || ""} onChange={set("inspector")} placeholder="e.g. Chris M." />

        <label>Date of Inspection</label>
        <input
          value={data.date_of_inspection || ""}
          onChange={set("date_of_inspection")}
          placeholder="e.g. 26/7/2026"
        />
      </div>
    </div>
  );
}
