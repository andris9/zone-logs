'use strict';

const msgpack = require('msgpack-js');
const log = require('npmlog');

module.exports.get = (db, queueId, callback) => {
    let returned = false;
    let response = [];

    let stream = db.createReadStream({
        gt: 'id ' + queueId + ' ',
        lt: 'id ' + queueId + ' ~',
        keys: true,
        values: true,
        valueEncoding: {
            decode: val => val,
            encode: val => val,
            buffer: true
        }
    });

    stream.on('data', data => {
        if (returned) {
            return;
        }
        let value;
        try {
            value = msgpack.decode(data.value);
            value.time = Math.round(parseInt((data.key || '').split(' ')[2].substr(0, 14), 16) / 0x1000);
            response.push(value);
        } catch (E) {
            log.error('DB', '%s DECODEFAIL error="%s" encoded=%s', queueId, E.message, data.value.toString('base64'));
        }
    }).once('error', err => {
        if (returned) {
            return;
        }
        returned = true;
        callback(err);
    }).on('end', () => {
        if (returned) {
            return;
        }
        returned = true;
        callback(null, response);
    });
};

module.exports.find = (db, messageId, callback) => {
    let seen = new Set();
    let response = [];

    messageId = (messageId || '').toString().toLowerCase().replace(/[<>\s]/g, '').trim();

    let search = (direction, done) => {

        let returned = false;
        let key = messageId;

        if (direction === 'r') {
            key = Array.from(messageId).reverse().join('');
        }

        let stream = db.createReadStream({
            gte: 'mid ' + key,
            lte: 'mid ' + key + '~',
            keys: true,
            values: true,
            limit: 100
        });

        stream.on('data', data => {
            if (returned) {
                return;
            }
            let keyparts = (data.key || '').toString().trim().split(' ');
            let matchMessageId = keyparts[1];
            if (keyparts[2] === 'r') {
                matchMessageId = Array.from(matchMessageId).reverse().join('');
            }
            let queueId = data.value;

            if (!seen.has(queueId)) {
                seen.add(queueId);
                response.push({
                    id: queueId,
                    messageId: '<' + matchMessageId + '>'
                });
            }
        }).once('error', err => {
            if (returned) {
                return;
            }
            returned = true;
            done(err);
        }).on('end', () => {
            if (returned) {
                return;
            }
            returned = true;
            done(null);
        });
    };

    search('l', err => {
        if (err) {
            return callback(err);
        }
        search('r', err => {
            if (err) {
                return callback(err);
            }
            response = response.sort((a, b) => a.id.localeCompare(b.id));
            return callback(null, response);
        });
    });
};

module.exports.insert = (db, queueId, payload, callback) => {
    let index = db.indexer.get();
    let ops = [{
        type: 'put',
        key: 'log ' + index,
        value: queueId
    }, {
        type: 'put',
        key: 'id ' + queueId + ' ' + index,
        value: payload
    }];

    db.batch(ops, err => {
        if (err) {
            log.error('DB', 'DBERR %s message=%s error=%s', queueId, payload.toString('base64'), err.message);
            return callback(err);
        }
        callback();
    });
};

module.exports.remove = (db, latestIndex, callback) => {

    let limit = 1000;

    let listOps = done => {
        let returned = false;
        let response = [];

        let stream = db.createReadStream({
            gt: 'log ',
            lt: 'log ' + latestIndex + ' ~',
            keys: true,
            values: true,
            limit
        });

        stream.on('data', data => {
            if (returned || db.closing || !data || !data.key) {
                return;
            }

            let dataparts = (data.value || '').toString().split('~');

            let id = dataparts[0];
            let messageId = dataparts[1];

            let index = data.key.split(' ')[1];
            let curOps = [];

            curOps.push({
                type: 'del',
                key: data.key
            });

            if (id) {
                curOps.push({
                    type: 'del',
                    key: 'id ' + id + ' ' + index
                });
            }

            if (messageId) {
                curOps.push({
                    type: 'del',
                    key: 'mid ' + messageId + ' l ' + index
                });
                let reversedMessageId = Array.from(messageId).reverse().join('');
                curOps.push({
                    type: 'del',
                    key: 'mid ' + reversedMessageId + ' r ' + index
                });
            }

            response.push(curOps);

        }).once('error', err => {
            if (returned) {
                return;
            }
            returned = true;
            callback(err);
        }).on('end', () => {
            if (returned) {
                return;
            }
            returned = true;
            done(null, response);
        });
    };

    let deleteBatch = () => {
        listOps((err, opslist) => {
            if (err) {
                return callback(err);
            }
            if (!opslist.length) {
                return callback(null, 0);
            }
            log.info('DB', 'Clearing batch of %s', opslist.length);
            let pos = 0;
            let deleteNext = () => {
                if (db.closing) {
                    return callback(null, pos);
                }
                if (pos >= opslist.length) {
                    if (opslist.length < limit) {
                        return callback(null, pos);
                    }
                    return setImmediate(deleteBatch);
                }
                let ops = opslist[pos++];
                db.batch(ops, err => {
                    if (err) {
                        return callback(err);
                    }
                    setImmediate(deleteNext);
                });
            };
            setImmediate(deleteNext);
        });
    };

    deleteBatch();
};

module.exports.updateMessageId = (db, queueId, realMessageId, callback) => {

    let messageId = (realMessageId || '').toString().toLowerCase().replace(/[<>\s]/g, '').trim();
    if (!messageId) {
        return callback();
    }

    let reversedMessageId = Array.from(messageId).reverse().join('');

    let index = db.indexer.get();
    let ops = [
        // insert values
        {
            type: 'put',
            key: 'mid ' + messageId + ' l ' + index,
            value: queueId
        },
        {
            type: 'put',
            key: 'mid ' + reversedMessageId + ' r ' + index,
            value: queueId
        },
        {
            type: 'put',
            key: 'log ' + index,
            value: '~' + messageId
        }
    ];

    db.batch(ops, err => {
        if (err) {
            log.error('DB', 'DBERR %s message-id=%s error=%s', queueId, realMessageId, err.message);
            return callback(err);
        }
        callback();
    });

    callback();
};
