import type { FC } from 'hono/jsx';
import { ClientHead, ClientBody } from '../components/client-assets';
import { DEFAULT_FAVICON } from '../components/default-favicon';

interface OnboardingLayoutProps {
  children: any;
  currentStep: number;
  title?: string;
}

const steps = [
  { number: 1, label: 'Project' },
  { number: 2, label: 'Branding' },
  { number: 3, label: 'GitHub' },
  { number: 4, label: 'Distribution' },
];

export const OnboardingLayout: FC<OnboardingLayoutProps> = ({
  children,
  currentStep,
  title,
}) => {
  const pageTitle = title ? `${title} - Herald Setup` : 'Herald Setup';

  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{pageTitle}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossorigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href={DEFAULT_FAVICON} />
        <ClientHead />
      </head>
      <body class="onboarding-body">
        <div class="onboarding-wrapper">
          <div class="onboarding-topbar">
            <span class="onboarding-brand">Herald</span>
          </div>
          <div class="onboarding-steps">
            {steps.map((step, i) => (
              <div
                class={`onboarding-step${step.number === currentStep ? ' active' : ''}${step.number < currentStep ? ' completed' : ''}`}
              >
                <div class="onboarding-step-circle">
                  {step.number < currentStep ? (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M3 8.5l3.5 3.5L13 4" />
                    </svg>
                  ) : (
                    step.number
                  )}
                </div>
                <span class="onboarding-step-label">{step.label}</span>
                {i < steps.length - 1 && <div class="onboarding-step-connector" />}
              </div>
            ))}
          </div>
          <div class="onboarding-card">
            {children}
          </div>
        </div>
        <ClientBody />
      </body>
    </html>
  );
};
