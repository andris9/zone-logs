'use strict';

const log = require('npmlog');
const msgpack = require('msgpack-js');
const model = require('./model');

module.exports = (server, db) => {
    server.on('message', (payload, rinfo) => {
        if (db.closing) {
            // drop message
            return;
        }
        let message;
        try {
            message = msgpack.decode(payload);
        } catch (E) {
            log.info('UDP', 'INVALIDMSG from=%s:%s encoded="%s"', rinfo.address, rinfo.port, payload.toString('base64'));
            return;
        }

        if (!message.id) {
            log.info('UDP', 'INVALIDMSG from=%s:%s message=%s', rinfo.address, rinfo.port, JSON.stringify(message));
            return;
        }

        model.insert(db, message.id, payload, err => {
            if (err) {
                log.info('UDP', 'LOGFAIL %s from=%s:%s size=%s', message.id, rinfo.address, rinfo.port, payload.length);
                return;
            }
            log.verbose('UDP', 'LOGMSG %s from=%s:%s size=%s', message.id, rinfo.address, rinfo.port, payload.length);

            if (['DROP', 'QUEUED', 'NOQUEUE'].includes(message.action) && message['message-id']) {
                model.updateMessageId(db, message.id, message['message-id'], err => {
                    if (err) {
                        log.info('UDP', 'LOGFAIL %s from=%s:%s size=%s', message.id, rinfo.address, rinfo.port, payload.length);
                    }
                });
            }
        });
    });
};
