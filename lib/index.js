'use strict';

const CLIArgumentParser = require('testcafe/lib/cli/argument-parser');
const exitHook          = require('async-exit-hook');
const keypress          = require('keypress');
const controller        = require('./controller');

const tcArguments = new CLIArgumentParser();

exitHook(cb => {
    controller.exit()
        .then(cb);
});

tcArguments.parse(process.argv)
    .then(() => controller.init(tcArguments));


// Listen commands
keypress(process.stdin);

process.stdin.on('keypress', function (ch, key) {
    if (key && key.ctrl) {
        if (key.name === 's')
            controller.stop();

        else if (key.name === 'r')
            controller.restart();

        else if (key.name === 'c')
            controller.exit().then(() => process.exit(0));

        else if (key.name === 'w')
            controller.toggleWatching();
    }
});

if (process.stdout.isTTY)
    process.stdin.setRawMode(true)
