import type { FC } from 'hono/jsx';

interface Step1ProjectProps {
  projectName?: string;
  projectDescription?: string;
  error?: string;
}

export const Step1Project: FC<Step1ProjectProps> = ({
  projectName = '',
  projectDescription = '',
  error,
}) => {
  return (
    <div>
      <h2 class="onboarding-heading">Name your project</h2>
      <p class="form-hint">This will be displayed on your public changelog.</p>

      {error && (
        <div class="alert alert-danger" role="alert">
          <span>{error}</span>
        </div>
      )}

      <form method="post" action="/admin/onboarding/1">
        <div class="form-group">
          <label for="project_name" class="form-label">
            Project Name
          </label>
          <input
            type="text"
            id="project_name"
            name="project_name"
            class="form-input"
            placeholder="My Project"
            value={projectName}
            required
          />
        </div>
        <div class="form-group">
          <label for="project_description" class="form-label">
            Project Description <span class="form-hint-inline">(optional)</span>
          </label>
          <textarea
            id="project_description"
            name="project_description"
            class="form-textarea"
            rows={3}
            placeholder="A brief description of your project..."
          >
            {projectDescription}
          </textarea>
        </div>
        <div class="onboarding-footer">
          <div></div>
          <button type="submit" class="btn btn-primary">
            Next
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 4px;">
              <path d="M6 3l5 5-5 5" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
};
