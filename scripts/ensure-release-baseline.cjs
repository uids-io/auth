#!/usr/bin/env node
/**
 * Ensure git has a semver tag baseline so semantic-release will not assume 1.0.0
 * while npm is already ahead.
 *
 * - OK if v{npm latest} exists, or highest v*.*.* tag > npm latest.
 * - In GitHub Actions, if package.json version > npm latest but v{package} is
 *   missing, create and push that tag (so manual tag push is not required).
 *   Prefer HEAD^ when it exists so the current commit can still be a releasable
 *   fix/feat after the baseline tag.
 * - GitHub rejects GITHUB_TOKEN tag pushes when the tagged commit's tree
 *   contains .github/workflows/*. If push fails for that reason, retag on the
 *   nearest ancestor without .github/workflows (or set RELEASE_GIT_TOKEN PAT).
 */

'use strict';

const { readFileSync } = require('fs');
const { execFileSync, execSync } = require('child_process');
const { join } = require('path');
const semver = require('semver');

const PKG_NAME = '@advcomm/uids-io-auth';
const pkgPath = join(__dirname, '..', 'package.json');
const pkgVersion = JSON.parse(readFileSync(pkgPath, 'utf8')).version;

function npmLatest() {
  try {
    return execSync(`npm view ${PKG_NAME} version`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

function gitTagVersions() {
  let out;
  try {
    out = execSync('git tag -l', { encoding: 'utf8' });
  } catch {
    return [];
  }
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((t) => /^v\d+\.\d+\.\d+/.test(t))
    .map((t) => t.slice(1))
    .filter((v) => semver.valid(v));
}

function tagRefExists(tag) {
  try {
    execSync(`git rev-parse -q --verify "refs/tags/${tag}"`, {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function baselineRefForNewTag() {
  try {
    execFileSync('git', ['rev-parse', '-q', 'HEAD^'], { stdio: 'ignore' });
    return execFileSync('git', ['rev-parse', 'HEAD^'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
  }
}

/** True if this commit's tree has a .github/workflows directory (any workflow file). */
function commitHasWorkflowsDir(ref) {
  try {
    const kind = execFileSync(
      'git',
      ['cat-file', '-t', `${ref}:.github/workflows`],
      { encoding: 'utf8' },
    ).trim();
    return kind === 'tree';
  } catch {
    return false;
  }
}

/** Walk parents until a commit without .github/workflows, or null (e.g. not found). */
function nearestAncestorWithoutWorkflows(startRef) {
  let ref = startRef;
  for (let i = 0; i < 5000; i++) {
    if (!commitHasWorkflowsDir(ref)) {
      return ref;
    }
    try {
      ref = execFileSync('git', ['rev-parse', `${ref}^`], {
        encoding: 'utf8',
      }).trim();
    } catch {
      return null;
    }
  }
  return null;
}

function isGithubWorkflowTokenReject(stderr) {
  return (
    /create or update workflow/i.test(stderr) ||
    /workflows[`']? permission/i.test(stderr)
  );
}

function pushTag(tag) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) {
    console.error(
      'Cannot push tag: set GITHUB_TOKEN and GITHUB_REPOSITORY (GitHub Actions).',
    );
    process.exit(1);
  }
  const url = `https://x-access-token:${token}@github.com/${repo}.git`;
  try {
    execFileSync('git', ['push', url, tag], {
      stdio: ['ignore', 'inherit', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (e) {
    const stderr = e.stderr ? e.stderr.toString() : '';
    const err = new Error(stderr || e.message || 'git push failed');
    err.stderr = stderr;
    err.status = e.status;
    throw err;
  }
}

const registry = npmLatest();
if (!registry || !semver.valid(registry)) {
  console.log(
    `${PKG_NAME}: not on npm or invalid version; skip baseline ensure.`,
  );
  process.exit(0);
}

if (tagRefExists(`v${registry}`)) {
  console.log(`OK: tag v${registry} exists (npm latest ${registry}).`);
  process.exit(0);
}

const versions = gitTagVersions();
const highest = versions.sort(semver.rcompare)[0];
if (highest && semver.gt(highest, registry)) {
  console.log(
    `OK: git baseline v${highest} is above npm ${registry} (e.g. new major line).`,
  );
  process.exit(0);
}

if (
  semver.valid(pkgVersion) &&
  semver.gt(pkgVersion, registry) &&
  !tagRefExists(`v${pkgVersion}`) &&
  process.env.GITHUB_ACTIONS === 'true'
) {
  const preferredRef = baselineRefForNewTag();
  const tag = `v${pkgVersion}`;
  const tagMessage = `chore: baseline tag for semantic-release (${pkgVersion} > npm ${registry})`;

  execFileSync('git', [
    'config',
    'user.email',
    '41898282+github-actions[bot]@users.noreply.github.com',
  ]);
  execFileSync('git', ['config', 'user.name', 'github-actions[bot]']);

  console.log(
    `Creating baseline ${tag} at ${preferredRef.slice(0, 7)}… (package.json ${pkgVersion} > npm ${registry})`,
  );
  execFileSync('git', ['tag', '-a', tag, '-m', tagMessage, preferredRef], {
    stdio: 'inherit',
  });

  try {
    pushTag(tag);
  } catch (e) {
    const stderr = e.stderr || '';
    if (!isGithubWorkflowTokenReject(stderr)) {
      console.error(stderr || e.message);
      process.exit(e.status || 1);
    }
    execFileSync('git', ['tag', '-d', tag], { stdio: 'inherit' });
    const safeRef = nearestAncestorWithoutWorkflows(preferredRef);
    if (!safeRef || safeRef === preferredRef) {
      console.error(
        'GitHub rejected the tag push (commits under .github/workflows need a PAT).\n' +
          'Add repo secret RELEASE_GIT_TOKEN (classic: repo + workflow scopes) and re-run,\n' +
          'or push the baseline tag manually from a machine with a suitable token.',
      );
      process.exit(1);
    }
    console.log(
      `Retry ${tag} at ${safeRef.slice(0, 7)}… (ancestor without .github/workflows; GITHUB_TOKEN cannot tag workflow commits).`,
    );
    execFileSync('git', ['tag', '-a', tag, '-m', tagMessage, safeRef], {
      stdio: 'inherit',
    });
    pushTag(tag);
  }

  console.log(`Pushed ${tag}. semantic-release will use this as last release.`);
  process.exit(0);
}

console.error(
  `semantic-release would treat this branch as first release (1.0.0) but npm has ${registry}.\n` +
    `Fix one of:\n` +
    `  - git tag v${registry} <sha> && git push origin v${registry}\n` +
    `  - Set package.json version > ${registry} (e.g. 2.0.0) and let CI create the tag (requires GITHUB_ACTIONS).\n` +
    `  - Or git tag v2.0.0 <sha> && git push origin v2.0.0`,
);
process.exit(1);
