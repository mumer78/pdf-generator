import React, { useRef, useEffect } from "react";

export default function SummarySection({ value, onChange }) {
  const textareaRef = useRef(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [value]);

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedText = (e.clipboardData || window.clipboardData).getData("text");
    // Standardize line endings
    let clean = pastedText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    // Preserve paragraph breaks (double newlines or more)
    clean = clean.replace(/\n\n+/g, "___PARAGRAPH_BREAK___");
    // Replace single newlines with space
    clean = clean.replace(/\n/g, " ");
    // Restore paragraph breaks
    clean = clean.replace(/___PARAGRAPH_BREAK___/g, "\n\n");
    // Remove extra spaces
    clean = clean.replace(/ {2,}/g, " ");

    const target = e.target;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const currentValue = target.value;
    const newValue = currentValue.substring(0, start) + clean + currentValue.substring(end);

    onChange(newValue);

    setTimeout(() => {
      if (target) {
        target.selectionStart = target.selectionEnd = start + clean.length;
      }
    }, 0);
  };

  return (
    <div className="section-block">
      <h3 className="section-heading">Summary of Inspection</h3>
      <textarea
        ref={textareaRef}
        rows={3}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        onPaste={handlePaste}
        placeholder="Describe the overall condition of the roof..."
        style={{ overflowY: "hidden", resize: "none" }}
      />
    </div>
  );
}
