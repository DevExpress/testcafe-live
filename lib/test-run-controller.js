const EventEmitter = require('events');

const testcafe = require('testcafe');

const TestRun = testcafe.embeddingUtils.TestRun;

const liveTestRunStorage = Symbol('live-test-run-storage');

const testRunCtorFactory = function (callbacks, command) {
    const { created, started, done } = callbacks;
    const { registerStopHandler }    = command;

    return class DebugRun extends TestRun {
        constructor (test, browserConnection, screenshotCapturer, warningLog, opts) {
            super(test, browserConnection, screenshotCapturer, warningLog, opts);

            this[liveTestRunStorage] = { test, stopping: false, stop: false, isInRoleInitializing: false };

            created(this, test);

            this.injectable.scripts.push('/testcafe-live.js');

            registerStopHandler(this, () => {
                this[liveTestRunStorage].stop = true;
            });
        }

        start () {
            started(this);
            super.start.apply(this, arguments);
        }

        _useRole (...args) {
            this[liveTestRunStorage].isInRoleInitializing = true;

            return super._useRole.apply(this, args)
                .then(res => {
                    this[liveTestRunStorage].isInRoleInitializing = false;

                    return res;
                })
                .catch(err => {
                    this[liveTestRunStorage].isInRoleInitializing = false;

                    throw err;
                });
        }

        executeCommand (command, callsite, forced) {
            // NOTE: don't close the page and the session when the last test in the queue is done
            if (command.type === 'test-done' && !forced) {
                done(this, this[liveTestRunStorage].stop).then(() => {
                    this.executeCommand(command, callsite, true);
                });

                this.executeCommand({ type: 'unlock-page' }, null);

                return Promise.resolve();
            }

            if (this[liveTestRunStorage].stop && !this[liveTestRunStorage].stopping &&
                !this[liveTestRunStorage].isInRoleInitializing) {
                this[liveTestRunStorage].stopping = true;

                return Promise.reject(new Error('Test run aborted'));
            }

            return super.executeCommand(command, callsite);
        }
    };
};

const TEST_STATE = {
    created: 'created',
    running: 'running',
    done:    'done'
};

const TEST_RUN_STATE = {
    created:        'created',
    running:        'running',
    waitingForDone: 'waiting-for-done',
    done:           'done'
};

module.exports = class TestRunController extends EventEmitter {
    constructor () {
        super();

        this.RUN_FINISHED_EVENT = 'run-finished-event';
        this.RUN_STOPPED_EVENT  = 'run-stopped-event';
        this.RUN_STARTED_EVENT  = 'run-started-event';

        this.testWrappers      = [];
        this.testRunWrappers   = [];
        this.expectedTestCount = 0;
        this._testRunCtor      = null;
    }

    get TestRunCtor () {
        if (!this._testRunCtor)
            this._testRunCtor = testRunCtorFactory({
                created: testRun => this._onTestRunCreated(testRun),
                started: testRun => this._onTestRunStarted(testRun),
                done:    (testRun, forced) => this._onTestRunDone(testRun, forced)
            }, {
                registerStopHandler: (testRun, handler) => {
                    this._getWrappers(testRun).testRunWrapper.stop = () => handler();
                }
            });

        return this._testRunCtor;
    }

    _getTestWrapper (test) {
        return this.testWrappers.filter(w => w.test === test)[0];
    }

    _getWrappers (testRun) {
        const test            = testRun[liveTestRunStorage].test;
        const testWrapper     = this._getTestWrapper(test);
        const testRunWrappers = testWrapper.testRunWrappers;
        const testRunWrapper  = testRunWrappers.filter(w => w.testRun === testRun)[0];

        return { testRunWrapper, testWrapper };
    }

    _onTestRunCreated (testRun) {
        const test = testRun[liveTestRunStorage].test;

        let testWrapper = this._getTestWrapper(test);

        if (!testWrapper) {
            testWrapper = {
                test,
                state:           TEST_STATE.created,
                testRunWrappers: []
            };

            this.testWrappers.push(testWrapper);
        }

        testWrapper.testRunWrappers.push({ testRun, state: TEST_RUN_STATE.created, finish: null, stop: null });
    }

    _onTestRunStarted (testRun) {
        if (!this.testWrappers.filter(w => w.state !== TEST_RUN_STATE.created).length)
            this.emit(this.RUN_STARTED_EVENT, {});

        const { testRunWrapper, testWrapper } = this._getWrappers(testRun);

        testRunWrapper.state = TEST_RUN_STATE.running;
        testWrapper.state    = TEST_STATE.running;
    }

    _onTestRunDone (testRun, forced) {
        const { testRunWrapper, testWrapper } = this._getWrappers(testRun);

        testRunWrapper.state = TEST_RUN_STATE.waitingForDone;

        const waitingTestRunCount = testWrapper.testRunWrappers.filter(w => w.state === TEST_RUN_STATE.created).length;
        const runningTestRunCount = testWrapper.testRunWrappers.filter(w => w.state === TEST_RUN_STATE.running).length;

        const waitForOtherTestRuns = runningTestRunCount || waitingTestRunCount && !forced;

        if (!waitForOtherTestRuns) {
            testWrapper.state = TEST_STATE.done;

            //check other active tests
            setTimeout(() => {
                const hasTestsToRun = this.testWrappers.length < this.expectedTestCount ||
                                      !!this.testWrappers.filter(w => w.state === TEST_STATE.created).length;

                if (!forced && hasTestsToRun)
                    testWrapper.testRunWrappers.forEach(w => w.finish());
                else
                    this.emit(forced ? this.RUN_STOPPED_EVENT : this.RUN_FINISHED_EVENT);
            }, 0);
        }

        return new Promise(resolve => {
            testRunWrapper.finish = () => {
                testRunWrapper.finish = null;
                testRunWrapper.state  = TEST_RUN_STATE.done;
                resolve();
            };
        });
    }

    run (testCount) {
        const pendingRunsResolvers = [];

        this.expectedTestCount = testCount;

        this.testWrappers.forEach(testWrapper => {
            testWrapper.testRunWrappers.forEach(testRunWrapper => {
                if (testRunWrapper.finish)
                    pendingRunsResolvers.push(testRunWrapper.finish);
            });
        });

        this.testWrappers = [];

        pendingRunsResolvers.forEach(r => r());
    }

    stop () {
        const runningTestWrappers = this.testWrappers.filter(w => w.state === TEST_RUN_STATE.running);

        runningTestWrappers.forEach(testWrapper => {
            testWrapper.testRunWrappers.forEach(testRunWrapper => testRunWrapper.stop());
        });
    }
};
