const origStrOutWrite = process.stdout.write;

module.exports = class BaseLogger {
    constructor () {
        this.testingStarted = false;
        this.aborted        = false;
        this.running        = false;
        this.watching       = true;

        process.stdout.write = (...args) => this._onStdoutWrite(...args);

        this.MESSAGES = {
            intro: `
TestCafe Live watches the files and reruns
the tests once you've saved your changes.
                    
You can use the following keys in the terminal:
'ctrl+s' - stop current test run;
'ctrl+r' - restart current test run;
'ctrl+w' - turn off/on watching;
'ctrl+c' - close browsers and terminate the process.

`,

            sourceChanged:              'Sources have been changed. Test run is starting...',
            testRunStarting:            'Test run is starting...',
            testRunStarted:             'Test run in progress...',
            testRunStopping:            'Current test run is stopping...',
            testRunFinishedWatching:    'Make changes in the source files or press ctrl+r to restart test run.',
            testRunFinishedNotWatching: 'Press ctrl+r to restart test run.',
            fileWatchingEnabled:        'File watching enabled. Save changes in your files to run tests.',
            fileWatchingDisabled:       'File watching disabled.',
            nothingToStop:              'There are no tests running at the moment.',
            testCafeStopping:           'Stopping TestCafe Live...'
        };
    }

    _write (msg) {
        origStrOutWrite.call(process.stdout, msg);
    }

    _onStdoutWrite () {
        throw new Error('Not implemented');
    }

    _report () {
        throw new Error('Not implemented');
    }

    _status () {
        throw new Error('Not implemented');
    }

    intro () {
        this._write(this.MESSAGES.intro);
    }

    runTests (sourcesChanged) {
        this.testingStarted = true;
        this.aborted        = false;

        if (sourcesChanged)
            this._status(this.MESSAGES.sourceChanged);
        else
            this._status(this.MESSAGES.testRunStarting);
    }

    testsStarted () {
        this.running = true;

        this._status(this.MESSAGES.testRunStarted);
    }

    testsFinished () {
        this.running = false;

        this._status(this.watching ? this.MESSAGES.testRunFinishedWatching : this.MESSAGES.testRunFinishedNotWatching);
    }

    stopRunning () {
        this._status(this.MESSAGES.testRunStopping);
    }

    nothingToStop () {
        this._status(this.MESSAGES.nothingToStop);
    }

    toggleWatching (enable) {
        this.watching = enable;

        if (enable)
            this._status(this.MESSAGES.fileWatchingEnabled);
        else
            this._status(this.MESSAGES.fileWatchingDisabled);
    }

    exit () {
        this._status(this.MESSAGES.testCafeStopping);
    }
};
