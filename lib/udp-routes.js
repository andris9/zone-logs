'use strict';

const log = require('npmlog');
const msgpack = require('msgpack-js');
const SeqIndex = require('seq-index');

module.exports = (server, db) => {
    let indexer = new SeqIndex();

    server.on('message', (payload, rinfo) => {
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

        let id = message.id;
        let index = indexer.get();
        let ops = [{
            type: 'put',
            key: 'log ' + index + ' ' + id,
            value: id
        }, {
            type: 'put',
            key: 'id ' + id + ' ' + index,
            value: payload
        }];

        log.info('UDP', 'LOGMSG %s from=%s:%s size=%s', id, rinfo.address, rinfo.port, payload.length);

        db.batch(ops, err => {
            if (err) {
                log.error('UDP', 'DBERR %s message=%s error=%s', id, JSON.stringify(message), err.message);
            }
        });
    });
};
