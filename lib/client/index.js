'use strict';

(function () {
    // NOTE: enable interaction with a page when the last test is completed
    window.setTimeout(function () {
        const UNLOCK_PAGE_FLAG = 'testcafe-live|driver|unlock-page-flag';

        const testCafeDriver = window['%testCafeDriverInstance%'];
        const testCafeCore   = window['%testCafeCore%'];
        const hammerhead     = window['%hammerhead%'];

        if (testCafeDriver.contextStorage.getItem(UNLOCK_PAGE_FLAG))
            testCafeCore.disableRealEventsPreventing();

        testCafeDriver.setCustomCommandHandlers('unlock-page', function () {
            testCafeCore.disableRealEventsPreventing();

            testCafeDriver.contextStorage.setItem(UNLOCK_PAGE_FLAG, true);

            return hammerhead.Promise.resolve();
        });
    });
})();