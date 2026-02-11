import type { FC } from 'hono/jsx';

interface SettingsSectionProps {
  title: string;
  description?: string;
  children: any;
  footer?: any;
}

export const SettingsSection: FC<SettingsSectionProps> = ({
  title,
  description,
  children,
  footer,
}) => {
  return (
    <div class="settings-section">
      <div class="settings-section-header">
        <h3 class="settings-section-title">{title}</h3>
        {description && (
          <p class="settings-section-description">{description}</p>
        )}
      </div>
      <div class="settings-section-content">{children}</div>
      {footer && <div class="settings-section-footer">{footer}</div>}
    </div>
  );
};
