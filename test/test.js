const { Writable } = require('stream');
const assert = require('assert');
const childProcess = require('child_process');
const FormData = require('form-data');
const path = require('path');
const string2fileStream = require('../index.js');
const isFileStream = require('is-file-stream');

const input = 'success';

describe('Type', () => {
  describe(`#isFileStream(fakeFileStream)`, () => {
    it(`should be true like exactly FileStream by default`, () => {
      const fakeFileStream = string2fileStream(input);
      assert.equal(isFileStream(fakeFileStream), true);
    });
  });
});

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

describe('Complex Scenarios', () => {
  let server;
  before(() => {
    server = childProcess.fork(path.resolve(__dirname, './lib/file-upload.js'));
  });

  describe(`upload file`, () => {
    it(`should upload and parse successfully`, (done) => {
      const file = {
        filename: 'no-this-file.txt',
        content: 'my-string-data'
      };
      const formData = new FormData();
      formData.append('filetoupload', string2fileStream(file.content, { path: file.filename }));
      // waiting server ready
      server.on('message', (msg) => {
        if (msg === 'SERVER_READY') {
          formData.submit('http://127.0.0.1:8123/fileupload', function(err, res) {
            assert.equal(err, null);
            assert.equal(res.statusCode, 200);
            res.on('data', function (chunk) {
              const data = JSON.parse(chunk.toString());
              assert.equal(data.filename, file.filename);
              assert.equal(data.content, file.content);
              done();
            });
          });
        }
      });
    });
  });

  after(() => {
    server.kill();
  });
});
