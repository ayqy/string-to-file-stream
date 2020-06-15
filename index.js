'use strict';

const { Buffer } = require('buffer');
const { Readable } = require('stream');
const util = require('util');

const kMinPoolSpace = 128;

let pool;
// It can happen that we expect to read a large chunk of data, and reserve
// a large chunk of the pool accordingly, but the read() call only filled
// a portion of it. If a concurrently executing read() then uses the same pool,
// the "reserved" portion cannot be used, so we allow it to be re-used as a
// new pool later.
const poolFragments = [];

function allocNewPool(poolSize) {
  if (poolFragments.length > 0)
    pool = poolFragments.pop();
  else
    pool = Buffer.allocUnsafe(poolSize);
  pool.used = 0;
}

function ReadStream(input, options) {
  if (!(this instanceof ReadStream))
    return new ReadStream(input, options);

  // a little bit bigger buffer and water marks by default
  options = Object.assign(options || {});
  if (options.highWaterMark === undefined)
    options.highWaterMark = 64 * 1024;

  // for backwards compat do not emit close on destroy.
  options.emitClose = false;

  Readable.call(this, options);

  this.input = Buffer.from(input || '', options.encoding || 'utf8');
  // fake current file position
  this.input._position = 0;
  // path will be ignored when fd is specified, so it can be falsy
  // https://github.com/nodejs/node/blob/v10.16.3/lib/internal/url.js#L1384
  this.path = options.path || 'no-this-file.txt';
  this.fd = options.fd === undefined ? null : options.fd;
  this.flags = options.flags === undefined ? 'r' : options.flags;
  this.mode = options.mode === undefined ? 0o666 : options.mode;

  this.start = options.start || 0;
  this.end = options.end;
  this.autoClose = options.autoClose === undefined ? true : options.autoClose;
  this.pos = undefined;
  this.bytesRead = 0;
  this.closed = false;

  if (this.start !== undefined) {
    if (typeof this.start !== 'number' || Number.isNaN(this.start)) {
      throw new Error(`The start must be a number. Received type ${typeof this.start}`);
    }
    if (this.end === undefined) {
      this.end = this.input.byteLength - 1;
    } else if (typeof this.end !== 'number' || Number.isNaN(this.end)) {
      throw new Error(`The end must be a number. Received type ${typeof this.end}`);
    }

    if (this.start > this.end) {
      const errVal = `{start: ${this.start}, end: ${this.end}}`;
      throw new Error(`The value of "start" is out of range. It must be <= "end". Received ${errVal}`);
    }

    this.pos = this.start;
  }

  // Backwards compatibility: Make sure `end` is a number regardless of `start`.
  // TODO(addaleax): Make the above typecheck not depend on `start` instead.
  // (That is a semver-major change).
  if (typeof this.end !== 'number')
    this.end = Infinity;
  else if (Number.isNaN(this.end))
    throw new Error(`The end must be a number, Received type ${typeof this.end}`);

  if (typeof this.fd !== 'number')
    this.open();

  this.on('end', function() {
    if (this.autoClose) {
      this.destroy();
    }
  });
}
util.inherits(ReadStream, Readable);

ReadStream.prototype.open = function() {
  // fake open file async
  setTimeout((fd = Infinity) => {
    // fake file descriptor
    this.fd = fd;
    this.emit('open', fd);
    this.emit('ready');
    // start the flow of data.
    this.read();
  }, 0);
};

ReadStream.prototype._read = function(n) {
  if (typeof this.fd !== 'number') {
    return this.once('open', function() {
      this._read(n);
    });
  }

  if (this.destroyed)
    return;

  if (!pool || pool.length - pool.used < kMinPoolSpace) {
    // discard the old pool.
    allocNewPool(this.readableHighWaterMark);
  }

  // Grab another reference to the pool in the case that while we're
  // in the thread pool another read() finishes up the pool, and
  // allocates a new one.
  const thisPool = pool;
  let toRead = Math.min(pool.length - pool.used, n);
  const start = pool.used;

  if (this.pos !== undefined)
    toRead = Math.min(this.end - this.pos + 1, toRead);
  else
    toRead = Math.min(this.end - this.bytesRead + 1, toRead);

  // already read everything we were supposed to read!
  // treat as EOF.
  if (toRead <= 0)
    return this.push(null);

  // the actual read.
  // fake read file content
  this._fakeReadFile(this.fd, pool, pool.used, toRead, this.pos, (bytesRead) => {
    let b = null;
    // Now that we know how much data we have actually read, re-wind the
    // 'used' field if we can, and otherwise allow the remainder of our
    // reservation to be used as a new pool later.
    if (start + toRead === thisPool.used && thisPool === pool)
      thisPool.used += bytesRead - toRead;
    else if (toRead - bytesRead > kMinPoolSpace)
      poolFragments.push(thisPool.slice(start + bytesRead, start + toRead));

    if (bytesRead > 0) {
      this.bytesRead += bytesRead;
      b = thisPool.slice(start, start + bytesRead);
    }

    this.push(b);
  });

  // move the pool positions, and internal position for reading.
  if (this.pos !== undefined)
    this.pos += toRead;
  pool.used += toRead;
};

// https://nodejs.org/dist/latest-v10.x/docs/api/fs.html#fs_fs_read_fd_buffer_offset_length_position_callback
ReadStream.prototype._fakeReadFile = function(_, buffer, offset, length, position, cb) {
  position = position || this.input._position;
  // fake read file async
  setTimeout(() => {
    let bytesRead = 0;
    if (position < this.input.byteLength) {
      bytesRead = this.input.copy(buffer, offset, position, position + length);
      this.input._position += bytesRead;
    }
    cb(bytesRead);
  }, 0);
};

ReadStream.prototype._destroy = function(err, cb) {
  if (typeof this.fd !== 'number') {
    this.once('open', closeFsStream.bind(null, this, cb, err));
    return;
  }

  closeFsStream(this, cb, err);
  this.fd = null;
};

function closeFsStream(stream, cb, err) {
  setTimeout(() => {
    stream.closed = true;
    stream.emit('close');
  }, 0);
}

ReadStream.prototype.close = function(cb) {
  this.destroy(null, cb);
};

Object.defineProperty(ReadStream.prototype, 'pending', {
  get() { return this.fd === null; },
  configurable: true
});


/**
 * @typedef {Object} FileStreamOptions
 * @property {string} [flags = 'r']
 * @property {string} [encoding = 'utf8'] String encoding, 'utf8' by default.
 * @property {number} [fd = null]
 * @property {number} [mode = 0o666]
 * @property {number} [autoClose = true]
 * @property {number} [start = 0] Read bytes from specified position, start counting at 0.
 * @property {number} [end] Byte length of the input string.
 * @property {number} [highWaterMark = 64 * 1024]
 * @property {string} [path = 'no-this-file.txt'] Fake file path, which can be relative or absolute path, null by default.
 */

/**
 * Create file stream from a string.
 * @param {*} str The input string.
 * @param {FileStreamOptions} options Other options, including 'encoding', 'path' etc.
 * @return {fs.ReadStream} https://nodejs.org/dist/latest-v10.x/docs/api/fs.html#fs_class_fs_readstream
 */
function string2fileStream(str, options) {
  return new ReadStream(str, options);
}

module.exports = string2fileStream;
