'use strict';

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
};
