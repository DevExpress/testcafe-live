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
        this._initFileWatching(tcArguments.resolvedFiles);

        this.testRunner = new TestRunner(tcArguments, logger);

        this.testRunner.on(this.testRunner.TEST_RUN_STARTED, () => logger.testsStarted());

        this.testRunner.on(this.testRunner.TEST_RUN_DONE_EVENT, e => {
            this.running = false;
            if (!this.restarting) {
                logger.testsFinished();
            }
            if (e.err) {
                console.log(`ERROR: ${e.err}`);
            }
        });

        this.testRunner.on(this.testRunner.REQUIRED_MODULE_FOUND_EVENT, e => {
            this.emit(this.REQUIRED_MODULE_FOUND_EVENT, e);
        });

        return this.testRunner.init()
            .then(() => logger.intro(tcArguments))
            .then(() => this._runTests());
    }

    _initFileWatching (src) {
        const fileWatcher = new FileWatcher(src);

        this.on(this.REQUIRED_MODULE_FOUND_EVENT, e => fileWatcher.addFile(e.filename));

        fileWatcher.on(fileWatcher.FILE_CHANGED_EVENT, () => this._runTests(true));
    }

    _runTests (sourceChanged) {
        if (this.watchingPaused || this.running) {
            return;
        }
        this.running = true;
        this.restarting = false;
        logger.runTests(sourceChanged);
        return this.testRunner.run();
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
                this.restarting = false;
                this.running = false;
            });
    }

    restart () {
        if (this.restarting) {
            return Promise.resolve();
        }
        this.restarting = true;
        if (this.running) {
            return this.stop()
                .then(() => logger.testsFinished())
                .then(() => this._runTests());
        }

        return this._runTests();   
        
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
