const querystring = require('querystring');
const BaseLogger = require('./base');

const logUpdate = require('log-update-async-hook');

// NOTE: clear the cache to don't use the same scope with TestCafe.
// Otherwise it can lead to log updating mutual influence.
delete require.cache[require.resolve('log-update-async-hook')];


const ansiEscapesCodeRe = /%1B%5B(\d*[A-KSTsun]|\d*%3B\d*H)/g;

module.exports = class UpdatingLogger extends BaseLogger {
    constructor() {
        super();

        this.appUpdatedLog = '';
        this.currentReport = '';
        this.statusMsg = '';
        this.writing = false;
        this.aborted = false;
        this.running = false;
    }

    _onStdoutWrite(msg) {
        if (this.writing || !this.testingStarted)
            this._write(msg);
        else {
            const escapedMsg = querystring.escape(msg);

            if (msg.indexOf('Error: Test run aborted') > -1) {
                this.aborted = true;
                this.currentReport = '';
            }
            else if (ansiEscapesCodeRe.test(escapedMsg) || /DEBUGGER PAUSE:|DEBUGGER PAUSE ON FAILED TEST:/.test(msg))
                this.appUpdatedLog = querystring.unescape(escapedMsg.replace(ansiEscapesCodeRe, ''));
            else
                this.currentReport += msg.toString();

            this._log();
        }
    }

    _status(msg) {
        this.statusMsg = msg;
        this._log();
    }

    _log() {
        this.writing = true;

        logUpdate(this._generateMsg());

        this.writing = false;
    }

    _generateMsg() {
        let separator = '\n-----------------------------\n\n';

        let appUpdatedLog = this.appUpdatedLog && this.running ? `
                /* TESTCAFE LOG AREA */
                ${this.appUpdatedLog}
            ` : '';

        let report = '';

        if (this.aborted) {
            report = `
                /* TEST RUN REPORT AREA */
                Test run aborted.
                `;
        }
        else {
            report = this.currentReport ? `
            /* TEST RUN REPORT AREA */
            ${this.currentReport}
            
            ` : '';
        }

        const status = `
                /* CURRENT STATUS */
                ${this.statusMsg}
            `;

        return separator + report + appUpdatedLog + status;
    }

    runTests(sourcesChanged) {
        this.currentReport = '';

        super.runTests(sourcesChanged);
    }

    testsFinished() {
        this.appUpdatedLog = null;

        super.testsFinished();
    }
};
