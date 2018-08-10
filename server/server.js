var loopback = require('loopback');
var boot = require('loopback-boot');

var app = module.exports = loopback();

// Bootstrap the application, configure models, datasources and middleware.
// Sub-apps like REST API are mounted via boot scripts.
boot(app, __dirname);

app.start = function () {
  // start the web server
  return app.listen(function () {
    app.emit('started');
    console.log('Web server listening at: %s', app.get('url'));
  });
};

// start the server if `$ node server.js`
if (require.main === module) {
  //app.start();
  app.io = require('socket.io')(app.start());
  const clients = {};
  app.io.on('connection', function (socket) {
    socket.on('chat message', function (msg) {
      console.log('message: ' + msg);
      app.io.emit('chat message', msg);
    });
    socket.on('disconnect', function () {
      console.log(socket.id);
      app.models.Member.findOne({
        where: {
          socketId: socket.id
        }
      }, (err, found) => {
        if(found) {
          app.io.emit('user-disconnect', {
            socketId: socket.id,
            userId: found.id.toString(),
            lastActivity: new Date()
          })
          found.updateAttributes({
            lastActivity: new Date(),
            status: 'OFFLINE'
          }, () => {});
        }
      })
    });

    socket.on('staff-move', function (position) {
      app.io.emit('watch-staff-move', position);
    })
  });
}
