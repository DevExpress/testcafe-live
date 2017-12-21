const BaseLogger = require('./base');

module.exports = class PlainLogger extends BaseLogger {
    constructor () {
        super();
    }

    _onStdoutWrite (msg) {
        if (msg.indexOf('Error: Test run aborted') > -1) {
            this.aborted = true;
            this._write('Test run aborted');
        }
        else
            this._write(msg);
    }

    _status (msg) {
        if (msg === this.MESSAGES.testRunStarted)
            return;

        this._write('\n' + msg + '\n');
    }
};
