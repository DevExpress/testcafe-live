'use strict';

(function () {
    function getDriver (callback) {
        var interval = window.setInterval(function () {
            var testCafeDriver = window['%testCafeDriverInstance%'];

            if (testCafeDriver) {
                window.clearInterval(interval);
                callback(testCafeDriver);
            }
        }, 50);
    }

    // NOTE: enable interaction with a page when the last test is completed
    var UNLOCK_PAGE_FLAG = 'testcafe-live|driver|unlock-page-flag';

    // TestCafe > 0.18.5 required
    getDriver(function (testCafeDriver) {
        var testCafeCore = window['%testCafeCore%'];
        var hammerhead   = window['%hammerhead%'];

        testCafeDriver.setCustomCommandHandlers('unlock-page', function () {
            testCafeCore.disableRealEventsPreventing();

            testCafeDriver.contextStorage.setItem(UNLOCK_PAGE_FLAG, true);

            return hammerhead.Promise.resolve();
        });

        var chain = testCafeDriver.contextStorage ? hammerhead.Promise.resolve() : testCafeDriver.readyPromise;

        chain.then(function () {
            if (testCafeDriver.contextStorage.getItem(UNLOCK_PAGE_FLAG))
                testCafeCore.disableRealEventsPreventing();
        });
    });
})();