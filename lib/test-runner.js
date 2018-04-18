'use strict';

const fs                = require('fs');
const path              = require('path');
const EventEmitter      = require('events');
const Module            = require('module');
const createTestCafe    = require('testcafe');
const remotesWizard     = require('testcafe/lib/cli/remotes-wizard');
const TestRunController = require('./test-run-controller');

const CLIENT_JS = fs.readFileSync(path.join(__dirname, './client/index.js'));

const originalRequire = Module.prototype.require;

module.exports = class TestRunner extends EventEmitter {
    constructor (tcArguments) {
        super();

        /* EVENTS */
        this.TEST_RUN_STARTED            = 'test-run-started';
        this.TEST_RUN_DONE_EVENT         = 'test-run-done';
        this.TEST_RUN_STOPPED            = 'test-run-stopped';
        this.REQUIRED_MODULE_FOUND_EVENT = 'require-module-found';

        this.opts              = tcArguments.opts;
        this.port1             = this.opts.ports && this.opts.ports[0];
        this.port2             = this.opts.ports && this.opts.ports[1];
        this.externalProxyHost = this.opts.proxy;
        this.serverOptions     = {
            ssl:  Boolean(this.opts.ssl),
            key:  String(this.opts.certificate && this.opts.certificate.key),
            cert: String(this.opts.certificate && this.opts.certificate.cert),
        };

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

        this.activeTestCount             = 0;
        this.testRunDonePromiseResolvers = [];
        this.stopping                    = false;
        this.tcRunnerTaskPromise         = null;

        this.testRunController = new TestRunController();

        this.testRunController.on(this.testRunController.RUN_STARTED_EVENT, () => this.emit(this.TEST_RUN_STARTED, {}));
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
        if (this.stopping)
            this.emit(this.TEST_RUN_STOPPED);

        return new Promise(resolve => {
            this.testRunDonePromiseResolvers.push(resolve);
        });
    }

    _resolveAllTestRunPromises () {
        this.testRunDonePromiseResolvers.forEach(r => r());
    }

    init () {
        return createTestCafe(this.opts.hostname, this.port1, this.port2, this.serverOptions)
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
                TestRunCtor: this.testRunController.TestRunCtor,
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

                this.testRunController.run(tests.filter(t => !t.skip).length);
                this.tcRunnerTaskPromise = tcRunner.run(this.opts);

                return this.tcRunnerTaskPromise;
            });
    }

    run () {
        let runError = null;

        let testRunPromise = null;

        if (!this.tcRunner) {
            testRunPromise = this
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
            testRunPromise = this
                ._runTests(this.tcRunner, this.runnableConf)
                .catch(err => {
                    runError = err;
                });
        }

        testRunPromise
            .then(() => {
                this.tcRunnerTaskPromise = null;

                if (this.stopping)
                    return;

                this.emit(this.TEST_RUN_DONE_EVENT, { err: runError });
            });
    }

    stop () {
        if (!this.tcRunnerTaskPromise)
            return Promise.resolve();

        return new Promise(resolve => {
            this.testRunController.once(this.testRunController.RUN_STOPPED_EVENT, () => {
                this.stopping = false;
                resolve();

                this.emit(this.TEST_RUN_DONE_EVENT, {});
            });

            this.stopping = true;
            this.testRunController.stop();
            this.tcRunnerTaskPromise.cancel();
        });
    }

    exit () {
        if (this.tcRunnerTaskPromise)
            this.tcRunnerTaskPromise.cancel();

        let chain = Promise.resolve();

        if (this.runnableConf)
            chain = chain.then(() => this.runnableConf.browserSet.origDispose());

        return chain
            .then(() => this.closeTestCafe());
    }
};
