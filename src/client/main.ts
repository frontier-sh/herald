// Herald client-side JavaScript
// EasyMDE initialization, form handlers, flash messages, delete confirmation

import './styles/main.css';

document.addEventListener('DOMContentLoaded', () => {
  initEasyMDE();
  initSummaryEasyMDE();
  initFlashMessages();
  initDeleteConfirmation();
  initFormSync();
  initReleaseFormSync();
  initEntrySortControls();
  initCategoryFilters();
  initCopyButtons();
  initToggleSwitches();
  initAiTestButton();
  initDeleteKeyButtons();
  initCustomiseTabs();
  initBrandUploaders();
});

/**
 * Upload an image to the server for use in markdown editors.
 */
function uploadImageHandler(
  file: File,
  onSuccess: (url: string) => void,
  onError: (error: string) => void,
): void {
  const formData = new FormData();
  formData.append('file', file);

  fetch('/admin/images/upload', {
    method: 'POST',
    body: formData,
  })
    .then((res) => {
      if (!res.ok) {
        return res.json().then((data: any) => {
          throw new Error(data.error || 'Upload failed');
        });
      }
      return res.json();
    })
    .then((data: any) => {
      onSuccess(data.url);
    })
    .catch((err) => {
      onError(err.message || 'Image upload failed');
    });
}

/**
 * Initialize EasyMDE on the content editor textarea if present.
 */
function initEasyMDE(): void {
  const textarea = document.getElementById('content-editor') as HTMLTextAreaElement | null;
  if (!textarea) return;

  // EasyMDE is loaded from CDN as a global
  const EasyMDE = (window as any).EasyMDE;
  if (!EasyMDE) return;

  const editor = new EasyMDE({
    element: textarea,
    spellChecker: false,
    autosave: {
      enabled: false,
    },
    status: ['lines', 'words'],
    placeholder: 'Describe the change in detail... (Markdown supported)',
    uploadImage: true,
    imageMaxSize: 5 * 1024 * 1024,
    imageAccept: 'image/png, image/jpeg, image/gif, image/webp',
    imageUploadFunction: uploadImageHandler,
    toolbar: [
      'bold',
      'italic',
      'heading',
      '|',
      'unordered-list',
      'ordered-list',
      '|',
      'link',
      'image',
      'upload-image',
      'code',
      'quote',
      '|',
      'preview',
      'guide',
    ],
  });

  // Store editor reference on window for form sync
  (window as any).__heraldEditor = editor;
}

/**
 * Initialize EasyMDE on the summary editor textarea if present (for releases).
 */
function initSummaryEasyMDE(): void {
  const textarea = document.getElementById('summary-editor') as HTMLTextAreaElement | null;
  if (!textarea) return;

  const EasyMDE = (window as any).EasyMDE;
  if (!EasyMDE) return;

  const editor = new EasyMDE({
    element: textarea,
    spellChecker: false,
    autosave: {
      enabled: false,
    },
    status: ['lines', 'words'],
    placeholder: 'Describe this release... (Markdown supported)',
    uploadImage: true,
    imageMaxSize: 5 * 1024 * 1024,
    imageAccept: 'image/png, image/jpeg, image/gif, image/webp',
    imageUploadFunction: uploadImageHandler,
    toolbar: [
      'bold',
      'italic',
      'heading',
      '|',
      'unordered-list',
      'ordered-list',
      '|',
      'link',
      'image',
      'upload-image',
      'code',
      'quote',
      '|',
      'preview',
      'guide',
    ],
  });

  // Store summary editor reference
  (window as any).__heraldSummaryEditor = editor;
}

/**
 * Sync EasyMDE content to the hidden form field before submit.
 */
function initFormSync(): void {
  const form = document.getElementById('entry-form') as HTMLFormElement | null;
  if (!form) return;

  form.addEventListener('submit', () => {
    const editor = (window as any).__heraldEditor;
    const hiddenInput = document.getElementById('content-hidden') as HTMLInputElement | null;

    if (editor && hiddenInput) {
      hiddenInput.value = editor.value();
    }
  });
}

/**
 * Sync release form: summary EasyMDE content and entry order to hidden fields.
 */
function initReleaseFormSync(): void {
  const form = document.getElementById('release-form') as HTMLFormElement | null;
  if (!form) return;

  form.addEventListener('submit', () => {
    // Sync summary editor
    const summaryEditor = (window as any).__heraldSummaryEditor;
    const summaryHidden = document.getElementById('summary-hidden') as HTMLInputElement | null;
    if (summaryEditor && summaryHidden) {
      summaryHidden.value = summaryEditor.value();
    }

    // Sync entry order from sort list
    const sortList = document.getElementById('entry-sort-list');
    const entryOrder = document.getElementById('entry-order') as HTMLInputElement | null;
    if (sortList && entryOrder) {
      const items = sortList.querySelectorAll('.entry-sort-item');
      const ids: string[] = [];
      items.forEach((item) => {
        const id = (item as HTMLElement).getAttribute('data-entry-id');
        if (id) ids.push(id);
      });
      entryOrder.value = ids.join(',');
    }

    // If no sort list, collect from checkboxes
    if (!sortList && entryOrder) {
      const checkboxes = form.querySelectorAll('input[name="entry_ids"]:checked');
      const ids: string[] = [];
      checkboxes.forEach((cb) => {
        ids.push((cb as HTMLInputElement).value);
      });
      entryOrder.value = ids.join(',');
    }
  });
}

/**
 * Entry sort controls: move entries up/down in the release order.
 */
function initEntrySortControls(): void {
  const sortList = document.getElementById('entry-sort-list');
  if (!sortList) return;

  sortList.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const button = target.closest('.entry-sort-up, .entry-sort-down') as HTMLButtonElement | null;
    if (!button) return;

    const item = button.closest('.entry-sort-item') as HTMLElement | null;
    if (!item) return;

    const isUp = button.classList.contains('entry-sort-up');

    if (isUp) {
      const prev = item.previousElementSibling;
      if (prev) {
        sortList.insertBefore(item, prev);
      }
    } else {
      const next = item.nextElementSibling;
      if (next) {
        sortList.insertBefore(next, item);
      }
    }

    // Update button disabled states
    updateSortButtons(sortList);
  });
}

function updateSortButtons(sortList: HTMLElement): void {
  const items = sortList.querySelectorAll('.entry-sort-item');
  items.forEach((item, index) => {
    const upBtn = item.querySelector('.entry-sort-up') as HTMLButtonElement | null;
    const downBtn = item.querySelector('.entry-sort-down') as HTMLButtonElement | null;
    if (upBtn) upBtn.disabled = index === 0;
    if (downBtn) downBtn.disabled = index === items.length - 1;
  });
}

/**
 * Category filter pills on the public changelog page.
 * Shows/hides entry groups based on the selected category.
 */
function initCategoryFilters(): void {
  const filtersContainer = document.getElementById('category-filters');
  if (!filtersContainer) return;

  const pills = filtersContainer.querySelectorAll('.category-pill');
  const entryGroups = document.querySelectorAll('.entry-group');

  pills.forEach((pill) => {
    pill.addEventListener('click', () => {
      const category = (pill as HTMLElement).getAttribute('data-category');

      // Update active state
      pills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');

      // Show/hide entry groups
      entryGroups.forEach((group) => {
        const groupCategory = (group as HTMLElement).getAttribute('data-category');
        if (category === 'all' || groupCategory === category) {
          (group as HTMLElement).style.display = '';
        } else {
          (group as HTMLElement).style.display = 'none';
        }
      });
    });
  });
}

/**
 * Flash message auto-dismiss after 5 seconds and close button handler.
 */
function initFlashMessages(): void {
  const flashMessages = document.querySelectorAll('[data-flash]');

  flashMessages.forEach((flash) => {
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      (flash as HTMLElement).style.opacity = '0';
      setTimeout(() => {
        (flash as HTMLElement).remove();
      }, 300);
    }, 5000);

    // Close button
    const closeBtn = flash.querySelector('[data-flash-close]');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        (flash as HTMLElement).style.opacity = '0';
        setTimeout(() => {
          (flash as HTMLElement).remove();
        }, 300);
      });
    }
  });
}

/**
 * Delete confirmation dialog for entry/release deletion.
 */
function initDeleteConfirmation(): void {
  const deleteBtn = document.getElementById('delete-btn');
  if (!deleteBtn) return;

  deleteBtn.addEventListener('click', () => {
    const deleteUrl = deleteBtn.getAttribute('data-delete-url');
    if (!deleteUrl) return;

    const confirmed = window.confirm(
      'Are you sure you want to delete this? This action cannot be undone.',
    );

    if (confirmed) {
      // Create and submit a hidden form to POST to the delete URL
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = deleteUrl;
      document.body.appendChild(form);
      form.submit();
    }
  });
}

/**
 * Copy-to-clipboard for API keys and other copyable content.
 */
function initCopyButtons(): void {
  const copyButtons = document.querySelectorAll<HTMLButtonElement>('[data-copy-target]');

  copyButtons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const targetId = btn.getAttribute('data-copy-target');
      if (!targetId) return;

      const targetEl = document.getElementById(targetId);
      if (!targetEl) return;

      const text = targetEl.textContent || '';

      try {
        await navigator.clipboard.writeText(text);
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        btn.classList.add('btn-copy-success');
        setTimeout(() => {
          btn.textContent = originalText;
          btn.classList.remove('btn-copy-success');
        }, 2000);
      } catch {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);

        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        btn.classList.add('btn-copy-success');
        setTimeout(() => {
          btn.textContent = originalText;
          btn.classList.remove('btn-copy-success');
        }, 2000);
      }
    });
  });
}

/**
 * Toggle switches that auto-submit their parent form on change.
 */
function initToggleSwitches(): void {
  const toggleInputs = document.querySelectorAll<HTMLInputElement>('[data-toggle-submit]');

  toggleInputs.forEach((input) => {
    input.addEventListener('change', () => {
      const form = input.closest('form');
      if (form) {
        form.submit();
      }
    });
  });
}

/**
 * AI test button: sends a test request and displays the result.
 */
function initAiTestButton(): void {
  const testBtn = document.getElementById('ai-test-btn');
  if (!testBtn) return;

  testBtn.addEventListener('click', async () => {
    const resultContainer = document.getElementById('ai-test-result');
    const resultOutput = document.getElementById('ai-test-output');
    if (!resultContainer || !resultOutput) return;

    // Show loading state
    testBtn.setAttribute('disabled', 'true');
    testBtn.textContent = 'Testing...';
    resultContainer.style.display = 'block';
    resultOutput.textContent = 'Running AI test...';

    try {
      const response = await fetch('/admin/settings/ai/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json() as { success: boolean; result?: string; error?: string };

      if (data.success) {
        resultOutput.textContent = data.result || 'No response received.';
        resultContainer.classList.remove('ai-test-error');
        resultContainer.classList.add('ai-test-success');
      } else {
        resultOutput.textContent = data.error || 'AI test failed.';
        resultContainer.classList.remove('ai-test-success');
        resultContainer.classList.add('ai-test-error');
      }
    } catch (err) {
      resultOutput.textContent = 'Failed to connect to AI test endpoint.';
      resultContainer.classList.remove('ai-test-success');
      resultContainer.classList.add('ai-test-error');
    } finally {
      testBtn.removeAttribute('disabled');
      testBtn.textContent = 'Test AI';
    }
  });
}

/**
 * Delete confirmation for API keys.
 */
function initDeleteKeyButtons(): void {
  const deleteButtons = document.querySelectorAll<HTMLButtonElement>('[data-delete-key-url]');

  deleteButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const deleteUrl = btn.getAttribute('data-delete-key-url');
      const keyName = btn.getAttribute('data-delete-key-name') || 'this key';
      if (!deleteUrl) return;

      const confirmed = window.confirm(
        `Are you sure you want to delete the API key "${keyName}"? This cannot be undone and will immediately revoke access.`,
      );

      if (confirmed) {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = deleteUrl;
        document.body.appendChild(form);
        form.submit();
      }
    });
  });
}

/**
 * Tab switching for the Customise page distribution section.
 */
function initCustomiseTabs(): void {
  const tabs = document.querySelectorAll<HTMLButtonElement>('.customise-tab');
  if (tabs.length === 0) return;

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetPanel = tab.getAttribute('data-tab');
      if (!targetPanel) return;

      // Update active tab
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');

      // Show/hide panels
      const panels = document.querySelectorAll<HTMLElement>('.customise-tab-panel');
      panels.forEach((panel) => {
        if (panel.getAttribute('data-tab-panel') === targetPanel) {
          panel.style.display = '';
        } else {
          panel.style.display = 'none';
        }
      });
    });
  });
}

/**
 * Brand image uploaders with drag-and-drop and progress bar.
 */
function initBrandUploaders(): void {
  const dropzones = document.querySelectorAll<HTMLElement>('.brand-dropzone');

  dropzones.forEach((zone) => {
    const uploadUrl = zone.getAttribute('data-upload-url');
    const acceptAttr = zone.getAttribute('data-accept') || 'image/*';
    const fileInput = zone.querySelector<HTMLInputElement>('input[type="file"]');
    if (!uploadUrl || !fileInput) return;

    // Click to open file picker
    zone.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      fileInput.click();
    });

    // File selected
    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files[0]) {
        uploadBrandFile(zone, uploadUrl, fileInput.files[0]);
      }
    });

    // Drag and drop
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('brand-dropzone-active');
    });

    zone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      zone.classList.remove('brand-dropzone-active');
    });

    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('brand-dropzone-active');
      if (e.dataTransfer && e.dataTransfer.files[0]) {
        const file = e.dataTransfer.files[0];
        if (!isFileAccepted(file, acceptAttr)) {
          showDropzoneError(zone, 'Invalid file type');
          return;
        }
        uploadBrandFile(zone, uploadUrl, file);
      }
    });
  });
}

function isFileAccepted(file: File, accept: string): boolean {
  return accept.split(',').some((token) => {
    const t = token.trim();
    if (t.startsWith('.')) return file.name.toLowerCase().endsWith(t.toLowerCase());
    if (t.endsWith('/*')) return file.type.startsWith(t.slice(0, -1));
    return file.type === t;
  });
}

function uploadBrandFile(zone: HTMLElement, url: string, file: File): void {
  const progressContainer = zone.querySelector<HTMLElement>('.brand-dropzone-progress');
  const progressFill = zone.querySelector<HTMLElement>('.brand-dropzone-progress-fill');
  if (!progressContainer || !progressFill) return;

  // Clear any existing errors
  zone.querySelectorAll('.brand-dropzone-error').forEach((el) => el.remove());

  // Show progress
  progressContainer.style.display = 'block';
  progressFill.style.width = '0%';
  zone.classList.add('brand-dropzone-uploading');

  const formData = new FormData();
  formData.append('file', file);

  const xhr = new XMLHttpRequest();

  xhr.upload.addEventListener('progress', (e) => {
    if (e.lengthComputable) {
      const percent = (e.loaded / e.total) * 100;
      progressFill.style.width = percent + '%';
    }
  });

  xhr.addEventListener('load', () => {
    zone.classList.remove('brand-dropzone-uploading');
    if (xhr.status >= 200 && xhr.status < 300) {
      try {
        const data = JSON.parse(xhr.responseText);
        if (data.url) {
          updateDropzonePreview(zone, data.url);
          progressContainer.style.display = 'none';
          progressFill.style.width = '0%';
        } else if (data.error) {
          showDropzoneError(zone, data.error);
        }
      } catch {
        showDropzoneError(zone, 'Upload failed');
      }
    } else {
      try {
        const data = JSON.parse(xhr.responseText);
        showDropzoneError(zone, data.error || 'Upload failed');
      } catch {
        showDropzoneError(zone, 'Upload failed');
      }
    }
  });

  xhr.addEventListener('error', () => {
    zone.classList.remove('brand-dropzone-uploading');
    showDropzoneError(zone, 'Upload failed');
  });

  xhr.open('POST', url);
  xhr.send(formData);
}

function updateDropzonePreview(zone: HTMLElement, imageUrl: string): void {
  const cacheBustedUrl = imageUrl + '?t=' + Date.now();
  let preview = zone.querySelector<HTMLElement>('.brand-dropzone-preview');
  const empty = zone.querySelector<HTMLElement>('.brand-dropzone-empty');

  if (preview) {
    // Update existing preview image
    const img = preview.querySelector<HTMLImageElement>('img');
    if (img) {
      img.src = cacheBustedUrl;
    }
  } else {
    // Create preview, hide empty state
    if (empty) empty.style.display = 'none';
    preview = document.createElement('div');
    preview.className = 'brand-dropzone-preview';

    const isFavicon = zone.getAttribute('data-upload-url')?.includes('favicon');
    const img = document.createElement('img');
    img.src = cacheBustedUrl;
    img.alt = isFavicon ? 'Current favicon' : 'Current logo';
    img.className = isFavicon ? 'brand-preview-favicon' : 'brand-preview-image';
    preview.appendChild(img);
    zone.insertBefore(preview, zone.querySelector('.brand-dropzone-progress'));
  }

  // Show the remove button if it was hidden
  const removeForm = zone.parentElement?.querySelector<HTMLElement>('.brand-remove-form');
  if (removeForm) {
    removeForm.style.display = '';
  } else {
    // Create the remove button if it doesn't exist yet
    const isFavicon = zone.getAttribute('data-upload-url')?.includes('favicon');
    const removeAction = isFavicon ? '/admin/settings/favicon/remove' : '/admin/settings/logo/remove';
    const form = document.createElement('form');
    form.method = 'post';
    form.action = removeAction;
    form.className = 'brand-remove-form';
    const btn = document.createElement('button');
    btn.type = 'submit';
    btn.className = 'btn btn-secondary btn-sm';
    btn.textContent = 'Remove';
    form.appendChild(btn);
    zone.parentElement?.appendChild(form);
  }
}

function showDropzoneError(zone: HTMLElement, message: string): void {
  const progressContainer = zone.querySelector<HTMLElement>('.brand-dropzone-progress');
  if (progressContainer) progressContainer.style.display = 'none';

  const errorEl = document.createElement('div');
  errorEl.className = 'brand-dropzone-error';
  errorEl.textContent = message;
  zone.appendChild(errorEl);
  setTimeout(() => errorEl.remove(), 3000);
}
