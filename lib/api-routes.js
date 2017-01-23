'use strict';

const log = require('npmlog');
const model = require('./model');

module.exports = (api, db) => {
    api.get('/', (req, res, next) => {
        res.setHeader('content-type', 'text/plain; charset=utf-8');
        res.send(db.db.getProperty('leveldb.stats'));
        return next();
    });

    api.get('/get/:id', (req, res, next) => {
        let id = req.params.id;
        let seq = false;

        if (id.lastIndexOf('.') >= 0) {
            seq = id.substr(id.lastIndexOf('.') + 1);
            id = id.substr(0, id.lastIndexOf('.'));
        }

        model.get(db, id, (err, entries) => {
            if (err) {
                log.error('DB', '%s error=%s', id, err.message);
                res.json(500, {
                    id,
                    error: err.message
                });
            } else {
                if (!entries || !entries.length) {
                    res.json(404, {
                        id,
                        error: 'No entries found for this ID'
                    });
                }

                res.json(200, {
                    id,
                    entries: !seq ? entries : entries.filter(entry => !entry.seq || entry.seq === seq)
                });
            }
            return next();
        });
    });

    api.get('/find', (req, res, next) => {
        let messageId = req.query.messageId;
        model.find(db, messageId, (err, entries) => {
            if (err) {
                log.error('DB', '%s error=%s', messageId, err.message);
                res.json(500, {
                    messageId,
                    error: err.message
                });
            } else {
                if (!entries || !entries.length) {
                    res.json(404, {
                        messageId,
                        error: 'No entries found for this Message-ID'
                    });
                }

                res.json(200, {
                    messageId,
                    entries
                });
            }
            return next();
        });
    });

    api.get('/keys', (req, res) => {
        res.setHeader('content-type', 'text/plain; charset=utf-8');

        let returned = false;
        let start = Date.now();
        let stream = db.createKeyStream();
        let counter = 0;

        stream.on('data', key => {
            if (returned) {
                return;
            }
            counter++;
            res.write(key + '\n');
        }).once('error', err => {
            if (returned) {
                return;
            }
            returned = true;
            res.end('[' + err.message + ']');
        }).on('end', () => {
            if (returned) {
                return;
            }
            returned = true;
            res.end('Listed ' + counter + ' keys in ' + ((Date.now() - start) / 1000) + 's.');
        });
    });
};
