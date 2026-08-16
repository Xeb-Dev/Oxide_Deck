import React from "react";

interface SettingCardProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  danger?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export default function SettingCard({
  title,
  description,
  icon,
  headerAction,
  children,
  danger = false,
  className = "",
  style
}: SettingCardProps) {
  return (
    <div
      className={`settings-card ${danger ? 'settings-card-danger' : ''} ${className}`}
      style={style}
    >
      {(title || headerAction) && (
        <div className="settings-card-header">
          <div className="settings-card-title-group">
            {icon && <span className="settings-card-icon">{icon}</span>}
            <div>
              {title && <h3 className="settings-card-title">{title}</h3>}
              {description && <p className="settings-card-description">{description}</p>}
            </div>
          </div>
          {headerAction && <div className="settings-card-action">{headerAction}</div>}
        </div>
      )}
      <div className="settings-card-body">
        {children}
      </div>
    </div>
  );
}
