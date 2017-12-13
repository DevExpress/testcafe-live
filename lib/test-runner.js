'use strict';

const fs                 = require('fs');
const path               = require('path');
const EventEmitter       = require('events');
const Module             = require('module');
const createTestCafe     = require('testcafe/lib');
const remotesWizard      = require('testcafe/lib/cli/remotes-wizard');
const liveRunCtorFactory = require('./live-run-ctor-factory');

const CLIENT_JS = fs.readFileSync(path.join(__dirname, './client/index.js'));

const getReporterFactory = (onTaskStarted, onTestDone) => {
    return () => {
        return {
            reportTaskStart (startTime, userAgents, testCount) {
                onTaskStarted(testCount);
            },

            reportFixtureStart () {
            },

            reportTestDone () {
                onTestDone();
            },

            reportTaskDone () {
            }
        };
    };
};


const originalRequire = Module.prototype.require;

module.exports = class TestRunner extends EventEmitter {
    constructor (tcArguments) {
        super();

        /* EVENTS */
        this.TEST_RUN_STARTED            = 'test-run-started';
        this.TEST_RUN_DONE_EVENT         = 'test-run-done';
        this.REQUIRED_MODULE_FOUND_EVENT = 'require-module-found';

        this.opts              = tcArguments.opts;
        this.port1             = this.opts.ports && this.opts.ports[0];
        this.port2             = this.opts.ports && this.opts.ports[1];
        this.externalProxyHost = this.opts.proxy;

        this.remoteCount = tcArguments.remoteCount;
        this.concurrency = tcArguments.concurrency || 1;
        this.browsers    = tcArguments.browsers;
        this.src         = tcArguments.src;
        this.filter      = tcArguments.filter;

        this.reporters = this.opts.reporters.map(r => {
            return {
                name:      r.name,
                outStream: r.outFile ? fs.createWriteStream(r.outFile) : void 0
            };
        });

        this.testCafe      = null;
        this.closeTestCafe = null;
        this.tcRunner      = null;
        this.runnableConf  = null;

        this.reporterFactory = getReporterFactory(testCount => this._onTaskStarted(testCount), () => this._onTestFinished());

        this.activeTestCount             = 0;
        this.testRunDonePromiseResolvers = [];
        this.stopping                    = false;
        this.testRunPromise              = null;
    }

    _mockRequire () {
        const runner = this;

        Module.prototype.require = function (filePath) {
            const filename = Module._resolveFilename(filePath, this, false);

            if (path.isAbsolute(filename) || /^\.\.?[/\\]/.test(filename))
                runner.emit(runner.REQUIRED_MODULE_FOUND_EVENT, { filename });

            return originalRequire.apply(this, arguments);
        };
    }

    _restoreRequire () {
        Module.prototype.require = function () {
            return originalRequire.apply(this, arguments);
        };
    }

    _onTaskStarted (testCount) {
        this.activeTestCount = testCount;
        this.emit(this.TEST_RUN_STARTED, {});
    }

    _onTestFinished () {
        if (--this.activeTestCount)
            this._resolveAllTestRunPromises();
    }

    _handleTestRunCommand () {
        return !this.stopping;
    }

    _handleTestRunDone () {
        return new Promise(resolve => {
            this.testRunDonePromiseResolvers.push(resolve);
        });
    }

    _resolveAllTestRunPromises () {
        this.testRunDonePromiseResolvers.forEach(r => r());
    }

    init () {
        return createTestCafe(this.opts.hostname, this.port1, this.port2)
            .then(tc => {
                this.testCafe = tc;

                const origTestCafeClose = this.testCafe.close;

                this.closeTestCafe  = () => origTestCafeClose.call(this.testCafe);
                this.testCafe.close = () => new Promise(() => {
                });

                return remotesWizard(this.testCafe, this.remoteCount, this.opts.qrCode);
            })
            .then(remoteBrowsers => {
                this.browsers = this.browsers.concat(remoteBrowsers);
            });
    }

    _createTCRunner () {
        const runner = this.testCafe.createRunner()
            .embeddingOptions({
                TestRunCtor: liveRunCtorFactory(() => this._handleTestRunDone(), () => this._handleTestRunCommand()),
                assets:      [
                    {
                        path: '/testcafe-live.js',
                        info: { content: CLIENT_JS, contentType: 'application/x-javascript' }
                    }
                ]
            });

        runner.proxy.closeSession = () => {
        };

        runner
            .useProxy(this.externalProxyHost)
            .src(this.src)
            .browsers(this.browsers)
            .concurrency(this.concurrency)
            .filter(this.filter)
            .screenshots(this.opts.screenshots, this.opts.screenshotsOnFails)
            .startApp(this.opts.app, this.opts.appInitDelay);

        if (this.reporters.length)
            this.reporters.forEach(r => runner.reporter(r.name, r.outStream));
        else
            runner.reporter('spec');

        runner.reporter(this.reporterFactory, null);

        // HACK: TestCafe doesn't call `cleanUp` for compilers if test compiling is failed.
        // So, we force it here.
        // TODO: fix it in TestCafe
        const origBootstrapperGetTests = runner.bootstrapper._getTests;

        runner.bootstrapper._getTests = () => {
            let bsError   = null;
            const sources = runner.bootstrapper.sources;

            this._mockRequire();

            return origBootstrapperGetTests.apply(runner.bootstrapper)
                .then(res => {
                    this._restoreRequire();

                    return res;
                })
                .catch(err => {
                    this._restoreRequire();

                    bsError = err;

                    runner.bootstrapper.sources = [path.join(__dirname, './empty-test.js')];

                    return origBootstrapperGetTests.apply(runner.bootstrapper)
                        .then(() => {
                            runner.bootstrapper.sources = sources;

                            throw bsError;
                        });
                });
        };


        return runner.bootstrapper
            .createRunnableConfiguration()
            .then(runnableConf => {
                const browserSet = runnableConf.browserSet;

                browserSet.origDispose = browserSet.dispose;

                browserSet.dispose = () => Promise.resolve();

                runner.bootstrapper.createRunnableConfiguration = () => Promise.resolve(runnableConf);

                return { runner, runnableConf };
            });
    }

    _runTests (tcRunner, runnableConf) {
        return tcRunner.bootstrapper
            ._getTests()
            .then(tests => {
                runnableConf.tests = tests;

                return tcRunner.run(this.opts);
            });
    }

    run () {
        let runError = null;

        this._resolveAllTestRunPromises();

        if (!this.tcRunner) {
            this.testRunPromise = this
                ._createTCRunner()
                .then(res => {
                    this.tcRunner     = res.runner;
                    this.runnableConf = res.runnableConf;

                    return this._runTests(res.runner, res.runnableConf);
                })
                .catch(err => {
                    this.tcRunner     = null;
                    this.runnableConf = null;

                    runError = err;
                });
        }
        else {
            this.testRunPromise = this
                ._runTests(this.tcRunner, this.runnableConf)
                .catch(err => {
                    runError = err;
                });
        }

        this.testRunPromise
            .then(() => {
                this.testRunPromise = null;

                if (this.stopping)
                    return;

                this.emit(this.TEST_RUN_DONE_EVENT, { err: runError });
            });
    }

    stop () {
        if (!this.testRunPromise)
            return Promise.resolve();

        this.stopping = true;

        return this.testRunPromise
            .then(() => {
                this.stopping = false;
            });
    }

    exit () {
        let chain = Promise.resolve();

        if (this.runnableConf)
            chain = chain.then(() => this.runnableConf.browserSet.origDispose());

        return chain
            .then(() => this.closeTestCafe());
    }
};
