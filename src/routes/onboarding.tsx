import { Hono } from 'hono';
import type { Bindings } from '../bindings';
import { getSetting, setSetting, getAllSettings } from '../services/settings';
import { OnboardingLayout } from '../views/layouts/onboarding-layout';
import { Step1Project } from '../views/pages/onboarding/step1-project';
import { Step2Branding } from '../views/pages/onboarding/step2-branding';
import { Step3GitHub } from '../views/pages/onboarding/step3-github';
import { Step4Distribution } from '../views/pages/onboarding/step4-distribution';

const onboarding = new Hono<{
  Bindings: Bindings;
  Variables: { githubUser: string };
}>();

// ─── Step 1: Project Name ───────────────────────────────

onboarding.get('/', async (c) => {
  const completed = await getSetting(c.env.DB, 'onboarding_completed');
  if (completed === 'true') {
    return c.redirect('/admin');
  }

  const settings = await getAllSettings(c.env.DB);

  return c.html(
    <OnboardingLayout currentStep={1} title="Project">
      <Step1Project
        projectName={settings['project_name'] || ''}
        projectDescription={settings['project_description'] || ''}
      />
    </OnboardingLayout>,
  );
});

onboarding.post('/1', async (c) => {
  const body = await c.req.parseBody();
  const projectName = (body['project_name'] as string || '').trim();
  const projectDescription = (body['project_description'] as string) || '';

  if (!projectName) {
    return c.html(
      <OnboardingLayout currentStep={1} title="Project">
        <Step1Project
          projectName={''}
          projectDescription={projectDescription}
          error="Project name is required."
        />
      </OnboardingLayout>,
    );
  }

  await setSetting(c.env.DB, 'project_name', projectName);
  await setSetting(c.env.DB, 'project_description', projectDescription);
  return c.redirect('/admin/onboarding/2');
});

// ─── Step 2: Branding ───────────────────────────────────

onboarding.get('/2', async (c) => {
  const completed = await getSetting(c.env.DB, 'onboarding_completed');
  if (completed === 'true') {
    return c.redirect('/admin');
  }

  const settings = await getAllSettings(c.env.DB);
  const logoKey = settings['logo_image_key'] || '';
  const faviconKey = settings['favicon_image_key'] || '';

  return c.html(
    <OnboardingLayout currentStep={2} title="Branding">
      <Step2Branding
        logoUrl={logoKey ? `/images/${logoKey}` : null}
        faviconUrl={faviconKey ? `/images/${faviconKey}` : null}
      />
    </OnboardingLayout>,
  );
});

// ─── Step 3: GitHub ─────────────────────────────────────

onboarding.get('/3', async (c) => {
  const completed = await getSetting(c.env.DB, 'onboarding_completed');
  if (completed === 'true') {
    return c.redirect('/admin');
  }

  return c.html(
    <OnboardingLayout currentStep={3} title="GitHub">
      <Step3GitHub repoName={c.env.GITHUB_ALLOWED_REPO} />
    </OnboardingLayout>,
  );
});

// ─── Step 4: Distribution ───────────────────────────────

onboarding.get('/4', async (c) => {
  const completed = await getSetting(c.env.DB, 'onboarding_completed');
  if (completed === 'true') {
    return c.redirect('/admin');
  }

  const url = new URL(c.req.url);
  const baseUrl = c.env.BASE_URL || `${url.protocol}//${url.host}`;

  return c.html(
    <OnboardingLayout currentStep={4} title="Distribution">
      <Step4Distribution baseUrl={baseUrl} />
    </OnboardingLayout>,
  );
});

// ─── Complete Onboarding ────────────────────────────────

onboarding.post('/complete', async (c) => {
  await setSetting(c.env.DB, 'onboarding_completed', 'true');
  return c.redirect('/admin');
});

export default onboarding;
