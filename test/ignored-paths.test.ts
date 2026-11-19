/**
 * Tests for the per-app "Ignored paths" setting: pattern matching and how a
 * webhook entry is filtered, rebuilt or skipped.
 *
 * Run with: npm test  (node --test, native TypeScript — no extra deps).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIgnorePatterns,
  normalizeIgnorePatterns,
  compileIgnorePatterns,
  isPathIgnored,
  applyIgnoredPaths,
} from '../src/services/ignored-paths.ts';

const LARAVEL = compileIgnorePatterns(['tests/', 'app/Console/Commands/']);

function matches(pattern: string, path: string): boolean {
  return isPathIgnored(path, compileIgnorePatterns([pattern]));
}

test('parses one pattern per line, dropping blanks and comments', () => {
  assert.deepEqual(
    parseIgnorePatterns('  tests/ \r\n\n# console commands\napp/Console/Commands\n'),
    ['tests/', 'app/Console/Commands'],
  );
  assert.deepEqual(parseIgnorePatterns(null), []);
  assert.equal(normalizeIgnorePatterns('\n tests/ \n\n *.md\n'), 'tests/\n*.md');
});

test('a directory pattern matches everything beneath it, only at the root', () => {
  assert.ok(matches('tests/', 'tests/Feature/FooTest.php'));
  assert.ok(matches('tests/', 'tests/TestCase.php'));
  assert.ok(!matches('tests/', 'tests'));
  assert.ok(!matches('tests/', 'app/tests.php'));
  assert.ok(!matches('app/Console/Commands/', 'app/Console/Kernel.php'));
  assert.ok(matches('app/Console/Commands/', 'app/Console/Commands/SendEmails.php'));
  assert.ok(matches('/app/Console/Commands', 'app/Console/Commands/Sub/X.php'));
});

test('a bare name matches at any depth; an anchored path only at the root', () => {
  assert.ok(matches('tests', 'tests/FooTest.php'));
  assert.ok(matches('tests', 'packages/api/tests/FooTest.php'));
  assert.ok(matches('*.md', 'README.md'));
  assert.ok(matches('*.md', 'docs/guide/setup.md'));
  assert.ok(!matches('*.md', 'README.mdx'));
  assert.ok(!matches('app/Console', 'src/app/Console/X.php'));
});

test('* stays within a folder, ** spans folders, ? is one character', () => {
  assert.ok(matches('app/*.php', 'app/Foo.php'));
  assert.ok(!matches('app/*.php', 'app/Http/Foo.php'));
  assert.ok(matches('app/**/*.php', 'app/Http/Controllers/Foo.php'));
  assert.ok(matches('app/**/*.php', 'app/Foo.php'));
  assert.ok(matches('**/Tests/', 'src/Domain/Tests/UnitTest.php'));
  assert.ok(matches('docs/**', 'docs/a/b/c.md'));
  assert.ok(matches('v?.txt', 'v1.txt'));
  assert.ok(!matches('v?.txt', 'v10.txt'));
});

test('regex metacharacters in patterns are literal', () => {
  assert.ok(matches('config/app.php', 'config/app.php'));
  assert.ok(!matches('config/app.php', 'config/appXphp'));
  assert.ok(matches('(legacy)/', '(legacy)/x.js'));
});

const commits = [
  { sha: 'c4', subject: 'Only command', files: ['app/Console/Commands/X.php'] },
  { sha: 'c3', subject: 'Only tests', files: ['tests/BarTest.php'] },
  { sha: 'c2', subject: 'Fix Foo with test', files: ['app/Http/Foo.php', 'tests/FooTest.php'] },
  { sha: 'c1', subject: 'Add Foo feature', files: ['app/Http/Foo.php'] },
];
const autoEntry = {
  title: 'Only command',
  content: commits.map((c) => `- ${c.subject}`).join('\n'),
  commit_sha: 'c4',
  commits,
};

test('drops ignored commits and rebuilds title, content and commit SHA', () => {
  const result = applyIgnoredPaths(autoEntry, LARAVEL);
  assert.deepEqual(result, {
    skip: false,
    title: 'Fix Foo with test',
    content: '- Fix Foo with test\n- Add Foo feature',
    commit_sha: 'c2',
    ignoredCommits: 2,
  });
});

test('a commit that also touches non-ignored files still counts', () => {
  const result = applyIgnoredPaths({ ...autoEntry, commits: [commits[2]] }, LARAVEL);
  assert.equal(result.skip, false);
  assert.equal(result.ignoredCommits, 0);
});

test('skips the entry when every commit is ignored', () => {
  const result = applyIgnoredPaths({ ...autoEntry, commits: commits.slice(0, 2) }, LARAVEL);
  assert.deepEqual(result, { skip: true, ignoredCommits: 2 });
});

test('keeps an explicit title that is not an ignored commit subject', () => {
  const result = applyIgnoredPaths({ ...autoEntry, title: 'March update' }, LARAVEL);
  assert.equal(result.skip, false);
  if (!result.skip) assert.equal(result.title, 'March update');
});

test('leaves entries untouched without patterns or commit data', () => {
  const plain = { title: 'Manual', content: 'Body', commit_sha: 'abc' };
  assert.deepEqual(applyIgnoredPaths(plain, LARAVEL), { skip: false, ...plain, ignoredCommits: 0 });
  assert.deepEqual(applyIgnoredPaths(autoEntry, []), {
    skip: false,
    title: autoEntry.title,
    content: autoEntry.content,
    commit_sha: autoEntry.commit_sha,
    ignoredCommits: 0,
  });
});

test('commits without file data are never ignored, and junk is tolerated', () => {
  const result = applyIgnoredPaths(
    {
      title: 'Merge',
      content: '- Merge\n- Only tests',
      commits: [
        { sha: 'm1', subject: 'Merge', files: [] },
        'not a commit',
        { sha: 'c3', subject: 'Only tests', files: ['tests/A.php', 42] },
      ],
    },
    LARAVEL,
  );
  assert.deepEqual(result, {
    skip: false,
    title: 'Merge',
    content: '- Merge',
    commit_sha: undefined,
    ignoredCommits: 1,
  });
});
