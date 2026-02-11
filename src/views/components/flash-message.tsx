import type { FC } from 'hono/jsx';

interface FlashMessageBannerProps {
  type: 'success' | 'error' | 'warning';
  message: string;
}

const TYPE_CLASSES: Record<string, string> = {
  success: 'flash-success',
  error: 'flash-error',
  warning: 'flash-warning',
};

export const FlashMessageBanner: FC<FlashMessageBannerProps> = ({
  type,
  message,
}) => {
  const typeClass = TYPE_CLASSES[type] || TYPE_CLASSES.success;

  return (
    <div class={`flash-message ${typeClass}`} role="alert" data-flash>
      <span class="flash-message-text">{message}</span>
      <button
        type="button"
        class="flash-message-close"
        aria-label="Close"
        data-flash-close
      >
        &times;
      </button>
    </div>
  );
};
