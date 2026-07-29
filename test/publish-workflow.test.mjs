import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = path.join(
  root,
  '.github',
  'workflows',
  'publish-community-media.yml'
);

test('workflow fails explicitly before secrets or writes on a non-default branch', async () => {
  const workflow = await fs.readFile(workflowPath, 'utf8');

  assert.match(workflow, /guard:\s*\n\s+runs-on: ubuntu-latest/);
  assert.match(workflow, /permissions: \{\}/);
  assert.match(workflow, /expected_ref="refs\/heads\/\$\{DEFAULT_BRANCH\}"/);
  assert.match(workflow, /if \[\[ "\$\{REQUESTED_REF\}" != "\$\{expected_ref\}" \]\]; then/);
  assert.match(workflow, /Website publication is restricted[\s\S]+exit 1/);
  assert.match(workflow, /sanitize:\s*\n\s+needs: guard/);
  assert.match(workflow, /publish:\s*\n\s+needs:\s*\n\s+- guard\s*\n\s+- sanitize/);
  assert.match(workflow, /deploy:\s*\n\s+needs:\s*\n\s+- guard\s*\n\s+- publish/);
});

test('publisher rebuilds from latest branch and emits the committed SHA', async () => {
  const workflow = await fs.readFile(workflowPath, 'utf8');

  assert.match(workflow, /concurrency:\s*\n\s+group: luminox-community-media-publisher/);
  assert.match(workflow, /git fetch --no-tags origin/);
  assert.match(workflow, /git reset --hard "\$\{remote_ref\}"/);
  assert.match(workflow, /for attempt in 1 2 3/);
  assert.match(workflow, /published_sha=\$\{published_sha\}/);
  assert.match(workflow, /node tools\/verify-community-artifact\.mjs[\s\S]+PUBLICATION_WORKFLOW_RUN_NUMBER/);
});

test('a normal commit between publish and deploy does not suppress the exact publication deploy', async () => {
  const workflow = await fs.readFile(workflowPath, 'utf8');

  assert.match(
    workflow,
    /ref: \$\{\{ needs\.publish\.outputs\.published_sha \}\}/
  );
  assert.match(
    workflow,
    /PUBLISHED_SHA: \$\{\{ needs\.publish\.outputs\.published_sha \}\}/
  );
  assert.match(
    workflow,
    /node tools\/select-community-deployment-revision\.mjs[\s\S]+"\$\{PUBLISHED_SHA\}"[\s\S]+"\$\{latest_sha\}"/
  );
  assert.match(workflow, /git archive "\$\{DEPLOYMENT_SHA\}"/);
  assert.doesNotMatch(workflow, /git archive HEAD/);
  assert.doesNotMatch(workflow, /should_deploy=false/);
  assert.doesNotMatch(workflow, /if: steps\.freshness/);
});

test('out-of-order deploys select a newer recorded publication instead of rolling Pages back', async () => {
  const workflow = await fs.readFile(workflowPath, 'utf8');

  assert.match(workflow, /group: luminox-pages-deploy/);
  assert.match(
    workflow,
    /Deploying the exact newer publication[\s\S]+out-of-order rollback/
  );
  assert.match(
    workflow,
    /deployment_sha=\$\{deployment_sha\}.*GITHUB_OUTPUT/
  );
});
