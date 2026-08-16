import React from "react";

interface SettingRowProps {
  label: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  vertical?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export default function SettingRow({
  label,
  description,
  children,
  vertical = false,
  className = "",
  style
}: SettingRowProps) {
  return (
    <div
      className={`settings-row ${vertical ? 'settings-row-vertical' : ''} ${className}`}
      style={style}
    >
      <div className="settings-row-info">
        <label className="settings-row-label">{label}</label>
        {description && <div className="settings-row-description">{description}</div>}
      </div>
      <div className="settings-row-control">
        {children}
      </div>
    </div>
  );
}
