#!/usr/bin/env node
/**
 * Fail `npm publish` when package.json version is not strictly greater than
 * the latest version on the npm registry (avoids duplicate or stale publishes).
 *
 * Skips (exit 0) when `npm view` fails (offline / private fork / unpublished name).
 */

'use strict';

const { readFileSync } = require('fs');
const { execSync } = require('child_process');
const { join } = require('path');
const semver = require('semver');

const PKG_NAME = '@advcomm/uids-io-auth';
const pkgPath = join(__dirname, '..', 'package.json');
const local = JSON.parse(readFileSync(pkgPath, 'utf8')).version;

if (
  process.env.npm_config_dry_run === 'true' ||
  process.env.SKIP_REGISTRY_VERSION_CHECK === '1'
) {
  console.warn(
    `${PKG_NAME}: skipping registry version check (dry run or SKIP_REGISTRY_VERSION_CHECK=1).`
  );
  process.exit(0);
}

if (!semver.valid(local)) {
  console.error(`Invalid semver in package.json: ${local}`);
  process.exit(1);
}

let registry;
try {
  registry = execSync(`npm view ${PKG_NAME} version`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
} catch {
  console.warn(
    `${PKG_NAME}: registry lookup failed (offline or not published yet). Skipping version gate.`
  );
  process.exit(0);
}

if (!semver.valid(registry)) {
  console.warn(
    `${PKG_NAME}: unexpected registry version "${registry}". Skipping version gate.`
  );
  process.exit(0);
}

if (semver.eq(local, registry)) {
  console.error(
    `Refusing publish: ${local} is already the latest on npm.\n` +
      `Bump with: npm version patch|minor|major\n` +
      `Then: git push --follow-tags && npm publish`
  );
  process.exit(1);
}

if (semver.lt(local, registry)) {
  console.error(
    `Refusing publish: package.json (${local}) is behind npm (${registry}).\n` +
      `Pull the latest tag or set version > ${registry}.\n` +
      `If this is semantic-release: add missing git tag v${registry} on main ` +
      `(SR uses tags for the baseline, not the registry).`
  );
  process.exit(1);
}

console.log(
  `Version gate OK: publishing ${local} (npm latest was ${registry})`
);
