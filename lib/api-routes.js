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
                res.json(200, {
                    id,
                    entries: !seq ? entries : entries.filter(entry => !entry.seq || entry.seq === seq)
                });
            }
            return next();
        });
    });
};
