import React, { useEffect, useRef, useState } from "react";

export default function Modal({ modal, onClose, t }) {
  const inputRef = useRef(null);
  const [value, setValue] = useState(modal?.defaultValue || "");

  useEffect(() => {
    setValue(modal?.defaultValue || "");
    if (modal?.type === "prompt") {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
  }, [modal]);

  if (!modal) return null;

  function submitPrompt() {
    const v = value.trim();
    onClose();
    if (v) modal.onConfirm(v);
  }

  return (
    <div
      className="gx-modal-overlay gx-modal-top"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="gx-modal-box">
        <p className="gx-modal-msg">{modal.message}</p>
        {modal.type === "prompt" && (
          <input
            ref={inputRef}
            className="gx-modal-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitPrompt();
              if (e.key === "Escape") onClose();
            }}
          />
        )}
        {modal.type === "choice" && (
          <div className="gx-modal-choices">
            {modal.options.map((opt) => (
              <button
                key={opt.value}
                className="pillBtn gx-modal-choiceBtn"
                onClick={() => { onClose(); modal.onConfirm(opt.value); }}
              >{opt.label}</button>
            ))}
          </div>
        )}
        <div className="gx-modal-actions">
          {modal.type !== "alert" && modal.type !== "choice" && (
            <button className="pillBtn" onClick={onClose}>{t("cancel")}</button>
          )}
          {modal.type === "choice" && (
            <button className="pillBtn" onClick={onClose}>{t("cancel")}</button>
          )}
          {modal.type !== "choice" && (
            <button
              className="primaryTop"
              onClick={() => {
                if (modal.type === "alert") onClose();
                else if (modal.type === "confirm") { onClose(); modal.onConfirm(); }
                else submitPrompt();
              }}
            >
              {modal.type === "alert" ? "OK" : modal.buttonLabel || t("confirm")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
