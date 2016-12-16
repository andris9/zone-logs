'use strict';

const config = require('config');
const dgram = require('dgram');
const msgpack = require('msgpack-js');
const client = dgram.createSocket(config.server.protocol);
const log = require('npmlog');

let message = {
    a: 123,
    b: 'tere tere',
    u: '☹️',
    id: 'aaa'
};

let payload = msgpack.encode(message);
//payload = Buffer.from('aaa');
client.send(payload, config.server.port, config.server.host || 'localhost', err => {
    if (err) {
        log.error('UDP', err);
    } else {
        log.info('UDP', 'Message sent');
    }
    client.close(() => {
        log.info('UDP', 'Connection closed');
    });
});
