## Target

Create a file stream from a string.

That is:

```js
string2fileStream('string-content') === fs.createReadStream(/* path to a text file with content 'string-content' */)
```

## Implementation

Rewrite [<fs.ReadStream>](https://nodejs.org/dist/latest-v10.x/docs/api/fs.html#fs_class_fs_readstream), and **replace all file operations with equivalent string operations.**

## Installation & Usage

```bash
npm install string-to-file-stream --save
```

Then, follow your intuitive feelings:

```js
const string2fileStream = require('string-to-file-stream');
const assert = require('assert');

const input = 'Oh, my great data!';
const s = string2fileStream(input);
s.on('data', (chunk) => {
  assert.equal(chunk.toString(), input);
});
```

Or the more useful example, upload a fake file:

```js
const string2fileStream = require('string-to-file-stream');
const FormData = require('form-data');

const formData = new FormData();
formData.append('filetoupload', string2fileStream('my-string-data', { path: 'no-this-file.txt' }));
form.submit('http://127.0.0.1:8123/fileupload', function(err, res) {
  console.log(res.statusCode);
});
```

See [Test Cases](https://github.com/ayqy/string-to-file-stream/blob/master/test/test.js) for more details.

## API Details

```js
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
```

P.S.Above option fileds without description are the same as `options` for [fs.createReadStream(path[, options])](https://nodejs.org/dist/latest-v10.x/docs/api/fs.html#fs_fs_createreadstream_path_options).

## Contribution

```bash
git clone https://github.com/ayqy/string-to-file-stream.git
cd string-to-file-stream
npm install
npm test
```

## License

MIT
