'use strict';

const config = require('config');
const dgram = require('dgram');
const mkdirp = require('mkdirp');
const log = require('npmlog');
const restify = require('restify');
const levelup = require('levelup');
const leveldown = require('leveldown-basho-andris');
const apiRoutes = require('./api-routes.js');

module.exports = callback => {

    mkdirp(config.db.path, err => {
        if (err) {
            log.error('DB', err);
            return callback(err);
        }

        let returned = false;
        let dbopts = {};
        Object.keys(config.db.options || {}).forEach(key => {
            dbopts[key] = config.db.options[key];
        });
        dbopts.db = leveldown;

        const db = levelup(config.db.path, dbopts);

        db.once('error', err => {
            if (returned) {
                return log.error('Queue', err);
            }
            returned = true;
            callback(err);
        });

        db.once('closing', () => {
            log.info('DB', 'Closing database...');
        });

        db.once('closed', () => {
            log.info('DB', 'Database closed');
        });

        db.on('ready', () => {
            if (returned) {
                log.error('DB', 'Managed to open database but it was already errored');
                return db.close();
            }
            log.info('DB', 'Opened database at "%s"', config.db.path);

            const server = dgram.createSocket(config.server.protocol);

            server.once('error', err => {
                db.close(() => server.close());
                if (returned) {
                    return log.error('UDP', err);
                }
                returned = true;
                callback(err);
            });

            server.once('close', () => {
                log.info('UDP', 'Closed server');
            });

            server.on('message', (msg, rinfo) => {
                log.info('UDP', 'Message %s from %s:%s', JSON.stringify(msg), rinfo.address, rinfo.port);
            });

            server.bind(config.server.port, config.server.host, () => {
                if (returned) {
                    log.error('UDP', 'Managed to open server but it was already errored');
                    return db.close(() => server.close());
                }

                let address = server.address();
                log.info('UDP', 'Server listening on %s:%s', address.address, address.port);

                const api = restify.createServer();

                api.use(restify.queryParser());
                api.use(restify.gzipResponse());
                api.use(restify.bodyParser({
                    mapParams: true
                }));

                api.pre((request, response, next) => {
                    log.verbose('HTTP', request.url);
                    next();
                });

                api.once('error', err => {
                    if (returned) {
                        return log.error('API', err);
                    }
                    returned = true;
                    return callback(err);
                });

                api.once('close', () => {
                    log.info('API', 'Closed server');
                });

                apiRoutes(api, db);

                api.listen(config.api.port, config.api.host, () => {
                    if (returned) {
                        log.error('API', 'Managed to open server but it was already errored');
                        return db.close(() => server.close(() => api.close()));
                    }
                    returned = true;
                    let address = api.address();
                    log.info('API', 'Server listening on %s:%s', address.address, address.port);
                    callback(null, done => db.close(() => server.close(() => api.close(done))));
                });
            });
        });
    });
};
