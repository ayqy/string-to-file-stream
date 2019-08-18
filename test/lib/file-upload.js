const http = require('http');
const formidable = require('formidable');
const fs = require('fs');

const server = http.createServer(function (req, res) {
  if (req.url === '/fileupload') {
    const form = new formidable.IncomingForm();
    form.parse(req, function (err, fields, files) {
      const content = fs.readFileSync(files.filetoupload.path, 'utf-8');
      res.write(JSON.stringify({
        filename: files.filetoupload.name,
        content
      }));
      res.end();
    });
  }
  else {
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.write('<form action="fileupload" method="post" enctype="multipart/form-data">');
    res.write('<input type="file" name="filetoupload"><br>');
    res.write('<input type="submit">');
    res.write('</form>');
    return res.end();
  }
}).listen(8123, () => {
  process.send('SERVER_READY');
});
