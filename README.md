# TestCafe Live

See instant feedback when working on tests.

## What is it?

TestCafe Live provides a service that keeps the TestCafe process and browsers opened the whole time you are
working on tests. Changes you make in code immediately restart the tests. That is, TestCafe Live allows you to see test results instantly.

![TestCafe Live Demo](https://raw.githubusercontent.com/DevExpress/testcafe-live/master/media/testcafe-live-twitter.gif)

Watch [the full review on YouTube](https://www.youtube.com/watch?v=RWQtB6Xv01Q).

## Install

TestCafe Live is a CLI tool. To start using it, you need to install both `testcafe` and `testcafe-live`:

```sh
npm install testcafe testcafe-live -g
```

If you have already installed the `testcafe` module (version `0.18.0` or higher) you can install only `testcafe-live`:

```sh
npm install testcafe-live -g
```

This installs modules on your machine [globally](https://docs.npmjs.com/getting-started/installing-npm-packages-globally).

If necessary, you can add these modules locally to your project:

```sh
cd <your-project-dir>
npm install testcafe testcafe-live --save-dev
```

If you have installed `testcafe-live` locally to your project, add an npm script to `package.json` to run tests:

```json
"scripts": {
  "testcafe-live": "testcafe-live chrome tests/"
},
```

```sh
npm run testcafe-live
```

## How to use

Run tests with `testcafe-live` in the same way as you do with `testcafe`:

```sh
testcafe-live chrome tests/
```

Use [standard `testcafe` arguments](https://devexpress.github.io/testcafe/documentation/using-testcafe/command-line-interface.html) to run tests with `testcafe-live`. It opens the required browsers, run tests
there, shows the reports and waits for your further actions.

TestCafe Live watches files that you pass as the `src` argument and files that are required in them. Once you make changes in files and save them, TestCafe Live immediately reruns your tests.

When the tests are done, browsers stay on the last opened page so you can work with it and explore it by using the browser's developer tools.

### Commands

- ctrl+s - stop current test run;
- ctrl+r - restart current test run;
- ctrl+w - turn off/on files watching;
- ctrl+c - close opened browsers and terminate the process.

## Features

- TestCafe Live watches files with tests and helper modules rerunning the tests once changes are saved;
- You can explore the tested page in the same browser when tests are finished;
- If tests authenticate into your web application using [User Roles](https://devexpress.github.io/testcafe/documentation/test-api/authentication/user-roles.html), you do not need to execute login actions every test run, it saves your working time;
- Use the same API as TestCafe;
- CLI interface allows you to stop test runs, restart them and pause file watching;
- You can use TestCafe Live with any browsers (local, remote, mobile or headless).

## Why TestCafe Live is a separate repository

TestCafe Live is developed by the TestCafe Team as an addition to the main TestCafe module. Keeping it a separate project provides many benefits:

- We can deliver new functionality once it's ready regardless of the TestCafe release cycle;
- We can get feedback early and make new releases as fast as necessary to provide the best experience for developers;
- We can try experimental features that may be added to TestCafe later and get early feedback about them.

### Will this functionality be released in the main TestCafe tool

We will decide when we have more feedback and when we consider TestCafe Live finished and stable. Since TestCafe is a test runner it is possible
that `live` mode will exist as an additional tool.

## Tips and Tricks

### Which path should I pass as the `src` argument

You can pass either a path to a file with tests or a path to a directory.

If you specify a single file, `testcafe-live` will watch changes in it. Additionally, it will watch changes in files that are required from this file. Once you save changes in this file or in one of the required files, tests are rerun.

```sh
testcafe-live chrome tests/test.js
```

You can also pass a path to a directory where your files with tests are stored.

```sh
testcafe-live chrome tests/
```

TestCafe will watch all files in this directory and all files that are required from there and restart all tests once one of them is changed.

### I have lots of tests but would like to restart only one

When you work on a particular test, just add the `.only` call for it:

```
test.only('Current test', async t => {});
```

Once you are done with it and ready to run the whole suite, just remove the `.only` directive and save the file.

### Should I use TestCafe Live or TestCafe for CI

TestCafe Live is designed to work with tests locally. So use the main `testcafe` module for CI.

### How avoid performing authentication actions every run

If you test a page with a login form, you need to enter credentials at the beginning of each test. TestCafe provides [User Roles](https://devexpress.github.io/testcafe/documentation/test-api/authentication/user-roles.html) to impove your experience here.

At first, create a user role with authentication steps in a separate file and export it:

```js
// roles.js

import { Role, t } from 'testcafe';

export loggedUser = Role('http://mysite/login-page', async t => {
  await t
    .typeText('#login-input', 'my-login')
    .typeText('#password-input', 'my-input')
    .click('#submit-btn');
}, { preserveUrl: true });
```

Import the role into a file with tests and use it in the `beforeEach` function:

```js
// test.js
import { loggedUser } from './roles.js';

fixture `Check logged user`
    .page `http://mysite/profile`
    .beforeEach(async t => {
      await t.useRole(loggedUser);
    });
    
test('My test with logged user', async t => {
    // perform any action here as a logged user
});
```

When you run tests with TestCafe Live for the first time, role initialization steps will be executed and your tests will run with an authorized user profile. If you change the test file, the next run will skip role initialization and just load the page with saved
credentials. If you change code in a role, it will be 'refreshed' and role initialization steps will be executed at the next run.

### I'd like to make changes in several files before running tests

Just focus your terminal and press `ctrl+p`. TestCafe Live will not run tests until your press `ctrl+r`.

## Feedback

Report issues and leave proposals regarding this 'live' mode in this repository. Please address all issues about TestCafe to the main [TestCafe repository](https://github.com/DevExpress/testcafe/issues).
If you like this mode please let us know. We will be glad to hear your proposals on how to make it more convinient.
Feel free to share your experience with other developers.

## Author

Developer Express Inc. ([https://devexpress.com](https://devexpress.com))
