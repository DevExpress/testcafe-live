const PlainLogger    = require('./plain');
const UpdatingLogger = require('./updating');

module.exports = process.env.EXPERIMENTAL_TESTCAFE_LOG ? new UpdatingLogger() : new PlainLogger();
