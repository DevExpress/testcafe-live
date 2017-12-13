'use strict';

const testcafe = require('testcafe/lib');

const TestRun = testcafe.embeddingUtils.TestRun;

module.exports = function (handleTestDoneFn, handleTestCommandFn) {
    return class DebugRun extends TestRun {
        constructor (test, browserConnection, screenshotCapturer, warningLog, opts) {
            super(test, browserConnection, screenshotCapturer, warningLog, opts);

            this.suspending           = false;
            this.isInRoleInitializing = false;

            this.injectable.scripts.push('/testcafe-live.js');
        }

        _useRole (...args) {
            this.isInRoleInitializing = true;

            return super._useRole.apply(this, args)
                .then(res => {
                    this.isInRoleInitializing = false;

                    return res;
                })
                .catch(err => {
                    this.isInRoleInitializing = false;

                    throw err;
                });
        }

        executeCommand (command, callsite, forced) {
            // NOTE: don't close the page and the session when the last test in the queue is done
            if (command.type === 'test-done' && !forced) {
                handleTestDoneFn().then(() => {
                    this.executeCommand(command, callsite, true);
                });

                this.executeCommand({ type: 'unlock-page' }, null);

                return Promise.resolve();
            } else if (!this.suspending && !this.isInRoleInitializing && !handleTestCommandFn()) {
                this.suspending = true;

                return Promise.reject(new Error('Test run aborted'));
            }

            return super.executeCommand(command, callsite);
        }
    };
};
