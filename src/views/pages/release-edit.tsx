import type { FC } from 'hono/jsx';
import type { Release, EntryWithSection, Category } from '../../db/schema';
import { CATEGORIES } from '../../db/schema';
import { CategoryBadge } from '../components/category-badge';

interface ReleaseEditProps {
  release?: Release & { entries: EntryWithSection[] };
  availableEntries?: EntryWithSection[];
}

export const ReleaseEdit: FC<ReleaseEditProps> = ({ release, availableEntries = [] }) => {
  const isEditing = !!release;
  const pageTitle = isEditing ? 'Edit Release' : 'New Release';
  const action = isEditing ? `/admin/releases/${release!.id}` : '/admin/releases';

  // Get the IDs of entries already in this release
  const releaseEntryIds = new Set(release?.entries?.map((e) => e.id) || []);

  // Combine release entries and available entries, deduplicating
  const allEntries = [...(release?.entries || [])];
  for (const entry of availableEntries) {
    if (!releaseEntryIds.has(entry.id)) {
      allEntries.push(entry);
    }
  }

  // Group entries by section, then by category within each section
  const hasSections = allEntries.some((e) => e.section_name);

  interface SectionGroup {
    sectionName: string | null;
    entriesByCategory: Record<string, EntryWithSection[]>;
  }

  const sectionGroups: SectionGroup[] = [];

  if (hasSections) {
    const sectionMap = new Map<string | null, EntryWithSection[]>();
    for (const entry of allEntries) {
      const key = entry.section_name || null;
      if (!sectionMap.has(key)) sectionMap.set(key, []);
      sectionMap.get(key)!.push(entry);
    }
    // Named sections first, then ungrouped
    for (const [sectionName, entries] of sectionMap) {
      if (sectionName === null) continue;
      const byCategory: Record<string, EntryWithSection[]> = {};
      for (const cat of CATEGORIES) {
        const catEntries = entries.filter((e) => e.category === cat);
        if (catEntries.length > 0) byCategory[cat] = catEntries;
      }
      sectionGroups.push({ sectionName, entriesByCategory: byCategory });
    }
    const ungrouped = sectionMap.get(null);
    if (ungrouped) {
      const byCategory: Record<string, EntryWithSection[]> = {};
      for (const cat of CATEGORIES) {
        const catEntries = ungrouped.filter((e) => e.category === cat);
        if (catEntries.length > 0) byCategory[cat] = catEntries;
      }
      sectionGroups.push({ sectionName: null, entriesByCategory: byCategory });
    }
  } else {
    // No sections — just group by category (legacy behavior)
    const byCategory: Record<string, EntryWithSection[]> = {};
    for (const cat of CATEGORIES) {
      const catEntries = allEntries.filter((e) => e.category === cat);
      if (catEntries.length > 0) byCategory[cat] = catEntries;
    }
    sectionGroups.push({ sectionName: null, entriesByCategory: byCategory });
  }

  // Build ordered list of currently selected entry IDs for sort
  const selectedEntryIds = release?.entries?.map((e) => e.id) || [];

  return (
    <div>
      <nav class="breadcrumb">
        <a href="/admin/releases">Releases</a>
        <span class="breadcrumb-sep">/</span>
        <span>{pageTitle}</span>
      </nav>

      <div class="page-header">
        <h1>{pageTitle}</h1>
        {isEditing && release!.status === 'draft' && (
          <form method="post" action={`/admin/releases/${release!.id}/publish`} style="margin: 0;">
            <button type="submit" class="btn btn-primary btn-sm">
              Publish
            </button>
          </form>
        )}
      </div>

      <form method="post" action={action} class="release-form" id="release-form">
        <div class="form-row">
          <div class="form-group form-group-half">
            <label for="version" class="form-label">
              Version <span class="text-danger">*</span>
            </label>
            <input
              type="text"
              id="version"
              name="version"
              class="form-input"
              required
              placeholder="e.g. 1.0.0, v2.3.1"
              value={release?.version ?? ''}
            />
          </div>
          <div class="form-group form-group-half">
            <label for="title" class="form-label">
              Title
            </label>
            <input
              type="text"
              id="title"
              name="title"
              class="form-input"
              placeholder="Release title (optional)"
              value={release?.title ?? ''}
            />
          </div>
        </div>

        <div class="form-group">
          <label for="summary-editor" class="form-label">
            Summary
          </label>
          <textarea
            id="summary-editor"
            name="summary_raw"
            class="form-textarea"
            rows={6}
            placeholder="Describe this release... (Markdown supported)"
          >
            {release?.summary ?? ''}
          </textarea>
          <input type="hidden" id="summary-hidden" name="summary" value={release?.summary ?? ''} />
        </div>

        <div class="form-group">
          <label class="form-label">Entries in this Release</label>
          <p class="form-hint">Select entries to include. Checked entries will be part of this release.</p>

          {sectionGroups.some((g) => Object.keys(g.entriesByCategory).length > 0) ? (
            <div class="entry-selector" id="entry-selector">
              {sectionGroups.map((group) => (
                <div class={group.sectionName ? 'entry-selector-section' : ''}>
                  {group.sectionName && (
                    <div class="entry-selector-section-header">
                      <strong>{group.sectionName}</strong>
                    </div>
                  )}
                  {!group.sectionName && hasSections && (
                    <div class="entry-selector-section-header">
                      <strong class="text-muted">Ungrouped</strong>
                    </div>
                  )}
                  {Object.entries(group.entriesByCategory).map(([category, entries]) => (
                    <div class="entry-selector-group">
                      <div class="entry-selector-group-header">
                        <CategoryBadge category={category as Category} />
                        <span class="text-sm text-muted">({entries.length})</span>
                      </div>
                      <div class="entry-selector-items">
                        {entries.map((entry) => (
                          <label class="entry-selector-item" data-entry-id={entry.id}>
                            <input
                              type="checkbox"
                              name="entry_ids"
                              value={String(entry.id)}
                              checked={releaseEntryIds.has(entry.id)}
                            />
                            <span class="entry-selector-title">{entry.title}</span>
                            <CategoryBadge category={entry.category} />
                            {entry.section_name && (
                              <span class="text-sm text-muted">({entry.section_name})</span>
                            )}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div class="empty-state" style="padding: var(--space-8) var(--space-4);">
              <p style="margin-bottom: 0;">No entries available. Create some entries first.</p>
            </div>
          )}
        </div>

        {selectedEntryIds.length > 0 && (
          <div class="form-group">
            <label class="form-label">Entry Order</label>
            <p class="form-hint">Drag or use buttons to reorder entries within the release.</p>
            <div class="entry-sort-list" id="entry-sort-list">
              {release!.entries.map((entry, index) => (
                <div class="entry-sort-item" data-entry-id={entry.id}>
                  <span class="entry-sort-handle">&#9776;</span>
                  <span class="entry-sort-title">{entry.title}</span>
                  <CategoryBadge category={entry.category} />
                  <div class="entry-sort-controls">
                    <button type="button" class="btn btn-ghost btn-sm entry-sort-up" disabled={index === 0}>
                      &#9650;
                    </button>
                    <button type="button" class="btn btn-ghost btn-sm entry-sort-down" disabled={index === selectedEntryIds.length - 1}>
                      &#9660;
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <input type="hidden" id="entry-order" name="entry_order" value={selectedEntryIds.join(',')} />

        <div class="form-actions">
          <div class="form-actions-left">
            {isEditing && (
              <button
                type="button"
                class="btn btn-danger"
                data-delete-url={`/admin/releases/${release!.id}/delete`}
                id="delete-btn"
              >
                Delete
              </button>
            )}
          </div>
          <div class="form-actions-right">
            <a href="/admin/releases" class="btn btn-secondary">Cancel</a>
            <button type="submit" name="status" value="draft" class="btn btn-secondary">
              Save Draft
            </button>
            <button type="submit" name="status" value="published" class="btn btn-primary">
              Publish
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
