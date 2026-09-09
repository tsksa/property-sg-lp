import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('final checkout preparation repairs later squash dates without redating unchanged pages', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sitemap-build-'));
  const run = (cmd, args, env = {}) => execFileSync(cmd, args, {
    cwd, encoding: 'utf8', env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    fs.mkdirSync(path.join(cwd, 'scripts'));
    for (const file of ['prepare-sitemap.mjs', 'refresh-sitemap-lastmod.mjs']) {
      fs.copyFileSync(new URL(`../scripts/${file}`, import.meta.url), path.join(cwd, 'scripts', file));
    }
    fs.writeFileSync(path.join(cwd, 'index.html'), 'original');
    fs.writeFileSync(path.join(cwd, 'unchanged.html'), 'unchanged');
    fs.writeFileSync(path.join(cwd, 'sitemap.xml'), '<urlset><url><loc>https://joetay.com/</loc><lastmod>2020-01-01</lastmod></url><url><loc>https://joetay.com/unchanged.html</loc><lastmod>2020-01-01</lastmod></url></urlset>');
    run('git', ['init']);
    run('git', ['config', 'user.name', 'Test']);
    run('git', ['config', 'user.email', 'test@example.invalid']);
    const commit = date => {
      run('git', ['add', '.']);
      run('git', ['commit', '-m', 'fixture'], { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });
    };
    commit('2020-01-01T12:00:00Z');
    fs.writeFileSync(path.join(cwd, 'index.html'), 'squashed change');
    commit('2020-01-03T12:00:00Z');
    assert.throws(() => run(process.execPath, ['scripts/refresh-sitemap-lastmod.mjs', '--check']));
    run(process.execPath, ['scripts/prepare-sitemap.mjs']);
    const xml = fs.readFileSync(path.join(cwd, 'sitemap.xml'), 'utf8');
    assert.match(xml, /joetay.com\/<\/loc><lastmod>2020-01-03/);
    assert.match(xml, /unchanged.html<\/loc><lastmod>2020-01-01/);
    run(process.execPath, ['scripts/prepare-sitemap.mjs']);
    assert.equal(fs.readFileSync(path.join(cwd, 'sitemap.xml'), 'utf8'), xml);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('CI and Netlify prepare the sitemap before validation and publication', () => {
  const workflow = fs.readFileSync(new URL('../.github/workflows/validate.yml', import.meta.url), 'utf8');
  assert.ok(workflow.indexOf('run: node scripts/prepare-sitemap.mjs') < workflow.indexOf('run: npm run check'));
  assert.match(fs.readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8'), /command = "node scripts\/prepare-sitemap.mjs"/);
});
