const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'text/html'});
  res.end('<h1>Test Server Working!</h1><p>If you can see this, localhost is working.</p>');
});

server.listen(3000, '127.0.0.1', () => {
  console.log('Test server running at http://127.0.0.1:3000/');
});

server.on('error', (err) => {
  console.error('Server error:', err);
});