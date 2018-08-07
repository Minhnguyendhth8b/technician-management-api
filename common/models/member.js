'use strict';
const app = require('../../server/server');
const request = require('request');

const MEMBER_TYPES = {
  USER: 1,
  MANAGER: 2,
  ADMIN: 3
};

const MALE = 1;
const FEMALE = 2;
const DEFAULT_SESSION_EXPIRED = 3600 * 999;
const PATTERN_STRING = "0123456789AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz";

module.exports = function (Member) {

  Member.definition.rawProperties.type.default =
    Member.definition.rawProperties.type.default = () => {
      return [MEMBER_TYPES.USER];
    };

  Member.definition.rawProperties.lastLogin.default =
    Member.definition.rawProperties.lastLogin.default = () => {
      return null;
    };

  Member.definition.rawProperties.created.default =
    Member.definition.properties.created.default = () => {
      return new Date();
    };

  Member.definition.rawProperties.modified.default =
    Member.definition.properties.modified.default = () => {
      return new Date();
    };

  // Update "modified" property and generate verify token if create new Member.
  Member.observe('before save', (ctx, next) => {
    // Update current Member.
    if (ctx.currentInstance) {
      ctx.currentInstance.modified = new Date();
    }

    next();
  });

  Member.register = (credentials, next) => {
    const { username, password, phone, socketId, lastPositions, firstName, lastName, device } = credentials;
    if (!username || !password || !socketId || !lastPositions || !firstName || !lastName || !device) {
      return next(new Error('Vui lòng nhập đầy đủ thông tin'));
   }

    const c = {
      usr: username,
      pwd: password
    };

    verifyCredentials(c, function (err, isExist) {
      if (err) return next(err);
      if (!isExist) return next(new Error('Vui lòng đăng kí tài khoản trên trang quản trị trước khi sử dụng ứng dụng'));
      Member.create(credentials, next);
    })
  };

  function verifyCredentials(credentials, callback) {
    const url = `http://api.phanmemsuachuabaohanh.com/api/Product/GetUser?usr=${credentials.usr}&psw=${credentials.pwd}&token=a83cbd127e616bcb63a4eb84e8c93643`
    request(url, function (error, response, body) {
      if (error) return callback(error);
      if (body !== "null") {
        return callback(null, true);
      }
      return callback(null, false);
    })
  }

  Member.beforeRemote('login', (ctx, unused, next) => {
    const { credentials } = ctx.args;
    if (!credentials) {
      return next(new Error('Missing credentials'));
    }

    const { username, password, socketId } = credentials;
    if (!username || !password || !socketId) {
      return next(new Error('Missing parameters'));
    }

    next();
  });

  Member.afterRemote('login', (ctx, modelInstant, next) => {
    const {
      credentials
    } = ctx.args;
    if (!credentials) {
      return next(new Error('Missing credentials'));
    }

    const {
      socketId
    } = credentials;
    const {
      userId
    } = modelInstant;
    if (!userId) {
      return next(new Error('Something wrong'));
    }
    Member.findById(userId, function (err, user) {
      if (err || !user) return next(new Error('user not found'));
      if (user.type && user.type.indexOf(2) === -1) {
        app.io.emit('staff-login', userId);
      }
      user.updateAttributes({
        socketId: socketId,
        isLogin: true,
        lastLogin: new Date()
      }, next);
    });
  });

  Member.afterRemote('logout', (ctx, modelInstant, next) => {
    if (ctx.req.accessToken && ctx.req.accessToken.userId) {
      Member.findById(ctx.req.accessToken.userId, function (err, user) {
        if (err || !user) next();
        app.io.emit('user-logout', ctx.req.accessToken.userId);
        user.updateAttributes({
          isLogin: false,
        }, next);
      })
    }
  });

  Member.generateVerificationToken = () => {
    let text = "";
    for (let i = 0; i < 128; i++) {
      text += PATTERN_STRING.charAt(Math.floor(Math.random() * PATTERN_STRING.length));
    }
    return text;
  };

  Member.getAllStaffLocations = (id, options, next) => {
    const { currentMember } = options;
    if (!currentMember) {
      return next(new Error('Permission denied'));
    }

    const { type } = currentMember;
    if (type.indexOf(MEMBER_TYPES.MANAGER) === -1) {
      return next(new Error('Permission denied'));
    }
    Member.find({
      where: {
        and: [{
          type: 1
        },
          {
            type: {
              nin: [2, 3]
            }
          }
        ]
      },
      fields: {
        id: true,
        firstName: true,
        lastName: true,
        lastPosition: true,
        isLogin: true,
        lastLogin: true,
        modified: true,
        device: true,
      }
    }, function (err, staff) {
      if (err) return next(err);
      return next(null, staff);
    });
  };

  Member.setup = () => {
    Member.remoteMethod('getAllStaffLocations', {
      accepts: [
        {
          arg: 'id', type: 'any',
          description: 'User Id', required: true,
          http: { source: 'path' }
        },
        { arg: 'options', type: 'object', http: 'optionsFromRequest' }
      ],
      description: 'Get Location of all staffs',
      http: { verb: 'GET', path: '/:id/staff/locations' },
      returns: { arg: 'data', type: 'object', root: true },
    });

    Member.remoteMethod('register', {
      accepts: [
        {
          arg: 'credentials', type: 'any',
          description: 'Credentials to create an account', required: true,
          http: { source: 'body' }
        },
      ],
      description: 'Register an account to use in this app',
      http: { verb: 'POST', path: '/register' },
      returns: { arg: 'data', type: 'object', root: true },
    });
  };

  Member.setup();
};
