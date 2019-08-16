const { Writable } = require('stream');
const assert = require('assert');
const string2fileStream = require('../index.js');

const input = 'success';

describe('Methods', () => {
  describe(`#pipe`, () => {
    it(`should pipe as normal stream`, (done) => {
      const s = string2fileStream(input);
      const outStream = new Writable({
        write(chunk, encoding, callback) {
          assert.equal(chunk.toString(), input);
          done();
          callback();
        }
      });
      s.pipe(outStream);
    });
  });
});

describe('Events', () => {
  describe(`#on('data')`, () => {
    it(`should return '${input}' when the value is '${input}'`, (done) => {
      const s = string2fileStream(input);
      s.on('data', (chunk) => {
        assert.equal(chunk.toString(), input);
        done();
      });
    });
  });
});
