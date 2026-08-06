import React, { useRef, useEffect } from "react";

export default function SummarySection({ value, onChange }) {
  const textareaRef = useRef(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [value]);

  return (
    <div className="section-block">
      <h3 className="section-heading">Summary of Inspection</h3>
      <textarea
        ref={textareaRef}
        rows={3}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Describe the overall condition of the roof..."
        style={{ overflowY: "hidden", resize: "none" }}
      />
    </div>
  );
}
