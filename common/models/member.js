'use strict';
const app = require('../../server/server');
const request = require('request');
const async = require('async');

const MEMBER_TYPES = {
  USER: 1,
  MANAGER: 2,
  ADMIN: 3
};

const MALE = 1;
const FEMALE = 2;
const DEFAULT_SESSION_EXPIRED = 3600 * 999;
const PATTERN_STRING = "0123456789AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz";
const TOKEN = 'a83cbd127e616bcb63a4eb84e8c93643';

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
      // Have the body in here
      const foundUser = JSON.parse(isExist);
      const { UserId, FullName, Phone, Email } = foundUser;
      if(!UserId) return next(new Error('Vui lòng liên hệ với người quản trị để được đăng kí tài khoản sử dụng ứng dụng'));
      if (Email) credentials.email = Email;
      if (FullName && FullName !== '') credentials.fullName = FullName;
      if (UserId) credentials.userId = UserId;
      if (Phone && typeof Phone === 'string' && Phone !== '') credentials.phone = Phone;
      credentials.type = [1];
      Member.create(credentials, next);
    })
  };

  function verifyCredentials(credentials, callback) {
    const url = `http://api.phanmemsuachuabaohanh.com/api/Product/GetUser?usr=${credentials.usr}&psw=${credentials.pwd}&token=${TOKEN}`
    request(url, function (error, response, body) {
      if (error) return callback(error);
      if (body !== "null") {
        return callback(null, body);
      }
      return callback(null, false);
    })
  }

  function getRepairById(repairId, next) {
    const url = `http://api.phanmemsuachuabaohanh.com/api/Product/Get?id=${repairId}&PageIndex=1&PageSize=50&token=${TOKEN}`;
    request(url, function(err, response, body) {
      if(err) return next(err);
      return next(null, typeof body === 'object' && body.length > 0 ? body : null)
    })
  }

  Member.dieuphoi = (userId, pscId, token, next) => {
    if (token !== TOKEN) return next(new Error('Vui lòng nhập mã xác thực hợp lệ'));
    const { Notification } = Member.app.models;
    async.parallel([
      (cb) => Member.findOne({where: {userId: userId}}, cb),
      (cb) => getRepairById(pscId, cb)
    ], (err, results) => {
      if(err) return next(err);
      const [found, psc] = results;
      if(!found) return next(new Error('Kỹ thuật viên chưa đăng kí sử dụng ứng dụng'));
      // if(!psc) return next(new Error('Phiếu sửa chữa không tồn tại trong hệ thống'))
      const { device, fullName, id } = found;
      let sentence = `Bạn nhận được một điều phối sửa chữa mới với mã phiếu sửa chữa: ${pscId}`;
      if(psc[0]) {
        const {Address, Phone, CustomerName} = psc[0];
        sentence = `Bạn nhận được một điều phối sửa chữa mới cho khách hàng ${CustomerName} - ${Phone} với địa chỉ: ${Address}`;
      }
      Notification.create({
        title: 'Một đơn điều phối mới ',
        data: {
          memberId: id,
          sentence: sentence,
          psc: psc[0] ? psc[0] : null
        },
        device: device
      }, next);
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

    Member.remoteMethod('dieuphoi', {
      accepts: [
        {
          arg: 'userId', type: 'any',
          description: 'User Id', required: true,
          http: { source: 'query' }
        },
        {
          arg: 'psc', type: 'any',
          description: 'Phiếu sửa chữa', required: true,
          http: { source: 'query' }
        },
        {
          arg: 'token', type: 'string',
          description: 'Mã xác thực', required: true,
          http: { source: 'query' }
        }
      ],
      description: 'Get Location of all staffs',
      http: { verb: 'GET', path: '/dieuphoi' },
      returns: { arg: 'data', type: 'object', root: true },
    });
  };

  Member.setup();
};
