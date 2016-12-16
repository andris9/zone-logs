'use strict';

const log = require('npmlog');
const msgpack = require('msgpack-js');

module.exports = (api, db) => {
    api.get('/', (req, res, next) => {
        /*
        res.json(200, {
            db: db.db.getProperty('leveldb.stats')
        });
        */
        res.setHeader('content-type', 'text/plain; charset=utf-8');
        res.send(db.db.getProperty('leveldb.stats'));
        return next();
    });

    api.get('/get/:id', (req, res, next) => {
        let id = req.params.id;

        get(id, (err, entries) => {
            if (err) {
                log.error('DB', '%s error=%s', id, err.message);
                res.json(500, {
                    id,
                    error: err.message
                });
            } else {
                res.json(200, {
                    id,
                    entries
                });
            }
            return next();
        });
    });


    function get(id, callback) {
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
                response.push({
                    key: data.key,
                    value
                });
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
    }

};
