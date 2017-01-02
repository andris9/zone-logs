'use strict';

const msgpack = require('msgpack-js');
const log = require('npmlog');

module.exports.get = (db, id, callback) => {
    let returned = false;
    let response = [];

    let stream = db.createReadStream({
        gt: 'id ' + id + ' ',
        lt: 'id ' + id + ' ~',
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
            response.push(value);
        } catch (E) {
            log.error('DB', '%s DECODEFAIL error="%s" encoded=%s', id, E.message, data.value.toString('base64'));
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

module.exports.insert = (db, id, payload, callback) => {
    let index = db.indexer.get();
    let ops = [{
        type: 'put',
        key: 'log ' + index + ' ' + id,
        value: id
    }, {
        type: 'put',
        key: 'id ' + id + ' ' + index,
        value: payload
    }];

    db.batch(ops, err => {
        if (err) {
            log.error('DB', 'DBERR %s message=%s error=%s', id, payload.toString('base64'), err.message);
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

            let id = data.value;
            let index = data.key.split(' ')[1];

            response.push([{
                type: 'del',
                key: data.key
            }, {
                type: 'del',
                key: 'id ' + id + ' ' + index
            }]);
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
