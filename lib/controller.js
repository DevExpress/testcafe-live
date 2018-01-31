'use strict';

const EventEmitter = require('events');
const TestRunner   = require('./test-runner');
const FileWatcher  = require('./file-watcher');
const logger       = require('./logger');

class Controller extends EventEmitter {
    constructor () {
        super();

        this.REQUIRED_MODULE_FOUND_EVENT = 'require-module-found';

        this.testRunner = null;
        this.src        = null;

        this.running        = false;
        this.restarting     = false;
        this.watchingPaused = false;
        this.stopping       = false;
    }

    init (tcArguments) {
        this._initFileWatching(tcArguments.src);

        this.testRunner = new TestRunner(tcArguments, logger);

        this.testRunner.on(this.testRunner.TEST_RUN_STARTED, () => logger.testsStarted());

        this.testRunner.on(this.testRunner.TEST_RUN_DONE_EVENT, e => {
            if (!this.restarting)
                logger.testsFinished();

            this.running = false;

            if (e.err)
                console.log(`ERROR: ${e.err}`);
        });

        this.testRunner.on(this.testRunner.REQUIRED_MODULE_FOUND_EVENT, e => {
            this.emit(this.REQUIRED_MODULE_FOUND_EVENT, e);
        });

        this.testRunner.init()
            .then(() => {
                logger.intro();
                this._runTests();
            });
    }

    _initFileWatching (src) {
        const fileWatcher = new FileWatcher(src);

        this.on(this.REQUIRED_MODULE_FOUND_EVENT, e => fileWatcher.addFile(e.filename));

        fileWatcher.on(fileWatcher.FILE_CHANGED_EVENT, () => {
            if (!this.watchingPaused)
                this._sourcesChanged();
        });
    }

    _sourcesChanged () {
        if (this.running)
            return;

        this._runTests(true);
    }

    _runTests (sourceChanged) {
        logger.runTests(sourceChanged);

        this.running = true;
        this.testRunner.run();
    }

    toggleWatching () {
        this.watchingPaused = !this.watchingPaused;

        logger.toggleWatching(!this.watchingPaused);
    }

    stop () {
        if (!this.testRunner || !this.running) {
            logger.nothingToStop();

            return Promise.resolve();
        }

        logger.stopRunning();

        return this.testRunner.stop()
            .then(() => {
                this.running = false;
            });
    }

    restart () {
        if (this.restarting)
            return;

        if (!this.running)
            this._runTests();
        else {
            this.restarting = true;

            this.stop().then(() => {
                logger.testsFinished();

                this.restarting = false;
                this.running    = false;

                this._runTests();
            });
        }
    }

    exit () {
        if (this.stopping)
            return Promise.resolve();

        logger.exit();

        this.stopping = true;

        return this.testRunner ? this.testRunner.exit() : Promise.resolve();
    }
}

module.exports = new Controller();
