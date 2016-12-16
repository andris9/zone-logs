'use strict';

const config = require('config');
const log = require('npmlog');
const syslog = require('modern-syslog');
const server = require('./lib/server');

if (config.ident) {
    process.title = config.ident;
}

if (config.log.syslog && syslog) {
    syslog.open(config.ident, syslog.option.LOG_PID, syslog.level.LOG_INFO);

    let logger = data => {
        data.messageRaw[0] = '(' + data.prefix + ') ' + data.messageRaw[0];
        return data.messageRaw;
    };

    switch (log.level) {
        /* eslint-disable no-fallthrough */
        case 'silly':
            log.on('log.silly', data => syslog.debug(...logger(data)));
        case 'verbose':
            log.on('log.verbose', data => syslog.info(...logger(data)));
        case 'info':
            log.on('log.info', data => syslog.notice(...logger(data)));
        case 'http':
            log.on('log.http', data => syslog.note(...logger(data)));
        case 'warn':
            log.on('log.warn', data => syslog.warn(...logger(data)));
        case 'error':
            log.on('log.error', data => syslog.error(...logger(data)));
            /* eslint-enable no-fallthrough */
    }

    log.level = 'silent'; // disable normal log stream
} else {
    log.level = config.log.level;
}

server((err, done) => {
    if (err) {
        return process.exit(1);
    }

    let stopping = false;
    let stopTimer = false;
    let stop = code => {
        if (stopping) {
            log.info('Process', 'Force closing...');
            return stopTimer = setTimeout(() => {
                process.exit(code || 0);
            }, 20);
        }
        stopping = true;
        clearTimeout(stopTimer);
        stopTimer = setTimeout(() => {
            clearTimeout(stopTimer);
            log.info('Process', 'Force closing...');
            stopTimer = setTimeout(() => {
                process.exit(code || 0);
            }, 20);
        }, 3000);
        log.info('Process', 'Closing...');
        done(() => {
            log.info('Process', 'Server closed');
            process.exit(code || 0);
        });
    };

    process.on('SIGINT', () => stop());
    process.on('SIGTERM', () => stop());

    process.on('uncaughtException', err => {
        log.error('Process', 'Uncaught exception');
        log.error('Process', err);
        stop(4);
    });

});
