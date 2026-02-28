import type { FC } from 'hono/jsx';

interface Step2BrandingProps {
  logoUrl?: string | null;
  faviconUrl?: string | null;
}

const UploadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="brand-dropzone-icon">
    <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
  </svg>
);

export const Step2Branding: FC<Step2BrandingProps> = ({
  logoUrl,
  faviconUrl,
}) => {
  return (
    <div>
      <h2 class="onboarding-heading">Add your branding</h2>
      <p class="form-hint">Upload a logo and favicon for your public changelog. You can always change these later.</p>

      <div class="form-group">
        <label class="form-label">Logo</label>
        <p class="form-hint">Displayed in the header of your public changelog. Recommended: wide format, max 2MB.</p>
        <div class="brand-dropzone" data-upload-url="/admin/images/upload/logo" data-accept="image/*">
          {logoUrl ? (
            <div class="brand-dropzone-preview">
              <img src={logoUrl} alt="Current logo" class="brand-preview-image" />
            </div>
          ) : (
            <div class="brand-dropzone-empty">
              <UploadIcon />
              <span class="brand-dropzone-text">Click or drag image to upload</span>
            </div>
          )}
          <div class="brand-dropzone-progress">
            <div class="brand-dropzone-progress-fill"></div>
          </div>
          <input type="file" accept="image/*" />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Favicon</label>
        <p class="form-hint">Browser tab icon. Recommended: 32x32px .ico or .png, max 1MB.</p>
        <div class="brand-dropzone" data-upload-url="/admin/images/upload/favicon" data-accept="image/*,.ico">
          {faviconUrl ? (
            <div class="brand-dropzone-preview">
              <img src={faviconUrl} alt="Current favicon" class="brand-preview-favicon" />
            </div>
          ) : (
            <div class="brand-dropzone-empty">
              <UploadIcon />
              <span class="brand-dropzone-text">Click or drag image to upload</span>
            </div>
          )}
          <div class="brand-dropzone-progress">
            <div class="brand-dropzone-progress-fill"></div>
          </div>
          <input type="file" accept="image/*,.ico" />
        </div>
      </div>

      <div class="onboarding-footer">
        <a href="/admin/onboarding" class="btn btn-secondary">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;">
            <path d="M10 3l-5 5 5 5" />
          </svg>
          Back
        </a>
        <a href="/admin/onboarding/3" class="btn btn-primary">
          Next
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 4px;">
            <path d="M6 3l5 5-5 5" />
          </svg>
        </a>
      </div>
    </div>
  );
};
