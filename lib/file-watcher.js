const EventEmitter = require('events');
const fs           = require('fs');

const LOCK_CACHE_TIMEOUT = 200;

module.exports = class FileWatcher extends EventEmitter {
    constructor (files) {
        super();

        this.FILE_CHANGED_EVENT = 'file-changed';

        this.watchers    = {};
        this.lockedFiles = {};

        files.forEach(f => this.addFile(f));
    }

    _onChanged (file) {
        if (this.lockedFiles[file])
            return;

        this.lockedFiles[file] = true;

        const cache = require.cache;
        let parent  = cache[file];

        while (parent &&
               Object.keys(this.watchers).filter(item => item === parent.id).length > 0 &&
               parent.id.indexOf('node_modules') < 0) {
            cache[parent.id] = null;

            parent = parent.parent;
        }

        setTimeout(() => this.lockedFiles[file] = void 0, LOCK_CACHE_TIMEOUT);

        this.emit(this.FILE_CHANGED_EVENT, { file });
    }

    addFile (file) {
        if (!this.watchers[file] && file.indexOf('node_modules') < 0) {
            this.watchers[file] = fs.watch(file, () => {
                this._onChanged(file);
            });
        }
    }
};
