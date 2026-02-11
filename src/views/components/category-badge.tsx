import type { FC } from 'hono/jsx';
import type { Category } from '../../db/schema';

interface CategoryBadgeProps {
  category: Category;
}

const BADGE_COLORS: Record<Category, { bg: string; text: string }> = {
  added: { bg: '#10B981', text: '#FFFFFF' },
  changed: { bg: '#3B82F6', text: '#FFFFFF' },
  fixed: { bg: '#8B5CF6', text: '#FFFFFF' },
  removed: { bg: '#EF4444', text: '#FFFFFF' },
  deprecated: { bg: '#F59E0B', text: '#FFFFFF' },
  security: { bg: '#F97316', text: '#FFFFFF' },
};

export const CategoryBadge: FC<CategoryBadgeProps> = ({ category }) => {
  const colors = BADGE_COLORS[category] || BADGE_COLORS.added;

  return (
    <span
      class="badge category-badge"
      style={`background-color: ${colors.bg}; color: ${colors.text};`}
    >
      {category}
    </span>
  );
};
