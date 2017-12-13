const origStrOutWrite = process.stdout.write;

module.exports = class BaseLogger {
    constructor () {
        this.testingStarted = false;
        this.aborted        = false;
        this.running        = false;

        process.stdout.write = (...args) => this._onStdoutWrite(...args);

        this.MESSAGES = {
            intro: `
TestCafe Live watches the files and reruns
the tests once you've saved your changes.
                    
You can use the following keys in the terminal:
'ctrl+s' - stop current running;
'ctrl+r' - restart running;
'ctrl+w' - turn off/on files watching;
'ctrl+c' - close browsers and terminate the process.

`,

            sourceChanged:        'Sources are changed and test run is starting...',
            testRunStarting:      'Test run is starting...',
            testRunStarted:       'Test run in progress...',
            testRunStopping:      'Current test run stopping...',
            testRunFinished:      'Make changes in the source files or press ctrl+r to restart test run.',
            fileWatchingEnabled:  'File watching enabled. Save changes in your files to run tests.',
            fileWatchingDisabled: 'File watching disabled.',
            nothingToStop:        'There are no run tests at the moment.',
            testCafeStopping:     'Stopping TestCafe Live...'
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

        this._status(this.MESSAGES.testRunFinished);
    }

    stopRunning () {
        this._status(this.MESSAGES.testRunStopping);
    }

    nothingToStop () {
        this._status(this.MESSAGES.nothingToStop);
    }

    toggleWatching (enable) {
        if (enable)
            this._status(this.MESSAGES.fileWatchingEnabled);
        else
            this._status(this.MESSAGES.fileWatchingDisabled);
    }

    exit () {
        this._status(this.MESSAGES.testCafeStopping);
    }
};
