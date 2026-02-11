import type { FC } from 'hono/jsx';

export const ClientHead: FC = () => {
  if (import.meta.env.PROD) {
    return <link rel="stylesheet" href="/assets/main.css" />;
  }
  return <script type="module" src="/src/client/main.ts"></script>;
};

export const ClientBody: FC = () => {
  if (import.meta.env.PROD) {
    return <script src="/assets/main.js" defer></script>;
  }
  return <></>;
};