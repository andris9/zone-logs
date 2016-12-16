'use strict';

module.exports = {
    ident: 'zone-logs',

    log: {
        // silly, verbose, info, error
        level: 'info',
        // log to syslog if true, otherwise to console
        syslog: false
    },

    db: {
        // Leveldb folder location. Created if it does not exist
        path: './data',

        options: {
            createIfMissing: true,
            compression: true,
            blockSize: 4096,
            writeBufferSize: 60 * 1024 * 1024
        }
    },

    server: {
        protocol: 'udp4',
        host: '0.0.0.0',
        port: 31239
    },

    api: {
        host: '0.0.0.0',
        port: 5388
    }
};
