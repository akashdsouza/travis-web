import { test } from 'qunit';
import moduleForAcceptance from 'travis/tests/helpers/module-for-acceptance';
import dashboardPage from 'travis/tests/pages/dashboard';
import jobPage from 'travis/tests/pages/job';

const repoId = 100;

const repositoryTemplate = {
  id: repoId,
  slug: 'killjoys/living-a-feminist-life'
};

moduleForAcceptance('Acceptance | home/with repositories', {
  beforeEach() {
    const currentUser = server.create('user', {
      name: 'Sara Ahmed',
      login: 'feministkilljoy'
    });

    signInUser(currentUser);

    // create active repo
    const repository = server.create('repository', repositoryTemplate);

    this.branch = repository.createBranch({
      name: 'primary'
    });

    server.create('repository', {
      slug: 'killjoys/queer-phenomenology'
    });

    // create active repo
    server.create('repository', {
      slug: 'killjoys/willful-subjects'
    });

    server.create('repository', {
      slug: 'other/other',
      skipPermissions: true
    });
  }
});

test('the home page shows the repositories', (assert) => {
  dashboardPage.visit();

  andThen(() => {
    assert.equal(dashboardPage.sidebarRepositories().count, 3, 'expected three repositories in the sidebar');
    assert.equal(dashboardPage.sidebarRepositories(0).name, 'killjoys/willful-subjects');
    assert.equal(dashboardPage.sidebarRepositories(1).name, 'killjoys/queer-phenomenology');
    assert.equal(dashboardPage.sidebarRepositories(2).name, 'killjoys/living-a-feminist-life');
  });
});

// Create some mock data for both the API and Pusher

const commitTemplate = {
  id: 100,
  sha: 'acab',
  branch: 'primary',
  message: 'Add new chapter',
  committed_at: '2016-12-02T22:02:34Z',
  author_name: 'Sara Ahmed',
  author_email: 'sara@example.com'
};

const buildTemplate = {
  id: 100,
  repository_id: repositoryTemplate.id,
  number: 15,
  pull_request: false,
  event_type: 'push'
};

Object.assign(buildTemplate, commitTemplate);

const buildCreated = Object.assign({}, buildTemplate);
buildCreated.state = 'created';

const buildStarted = Object.assign({}, buildTemplate);
buildStarted.state = 'started';

repositoryTemplate.default_branch = {
  name: 'primary',
  last_build_id: buildTemplate.id
};

const repositoryWithNewBuild = Object.assign({}, repositoryTemplate);
repositoryWithNewBuild.current_build_id = buildTemplate.id;

const jobTemplate = {
  id: 100,
  repository_id: repoId,
  repository_slug: repositoryTemplate.slug,
  build_id: buildTemplate.id,
  commit_id: commitTemplate.id,
  number: '15.1'
};

function generateJobWithState(state) {
  const job = Object.assign({}, jobTemplate);
  job.state = state;
  return job;
}

const jobCreated = generateJobWithState('created');
const jobQueued = generateJobWithState('queued');
const jobReceived = generateJobWithState('received');
const jobStarted = generateJobWithState('started');

buildTemplate.job_ids = [jobTemplate.id];

const jobLog0 = {
  id: jobTemplate.id,
  number: 0,
  final: false,
  _log: '\u001B[0K\u001B[33;1mThe first line'
};

const jobLog1 = {
  id: jobTemplate.id,
  number: 1,
  final: false,
  _log: 'another log line'
};

test('Pusher events change the main display', function (assert) {
  dashboardPage.visit();

  andThen(() => {
    assert.equal(dashboardPage.repoTitle, 'killjoys / willful-subjects', 'expected the displayed repository to be the newer one with no builds');

    this.branch.createBuild(buildCreated);
    server.create('job', jobCreated);

    this.application.pusher.receive('job:created', jobCreated);
    this.application.pusher.receive('build:created', {
      build: buildCreated,
      commit: commitTemplate,
      repository: repositoryTemplate
    });

    this.application.pusher.receive('job:queued', jobQueued);
    this.application.pusher.receive('job:received', jobReceived);

    // This is necessary to have the log fetch not fail and put the log in an error state.
    server.create('log', { id: jobTemplate.id });

    // After this line, the displayed repository should change, because it will
    // now have a new current_build_id, and therefore be sorted first.
    this.application.pusher.receive('build:started', {
      build: buildStarted,
      commit: commitTemplate,
      repository: repositoryWithNewBuild
    });
  });

  andThen(() => {
    assert.equal(dashboardPage.repoTitle, 'killjoys / living-a-feminist-life', 'the displayed repository should have changed');
  });

  andThen(() => {
    this.application.pusher.receive('job:started', jobStarted);
    this.application.pusher.receive('job:log', jobLog1);
    this.application.pusher.receive('job:log', jobLog0);
  });

  andThen(() => {
    assert.equal(jobPage.logLines(0).text, 'The first line');
    assert.ok(jobPage.logLines(0).isYellow, 'expected the first line to be yello');
  });
});
