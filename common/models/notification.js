/* eslint-disable camelcase */
'use strict';
const async = require('async');
const FCM = require('fcm-push');
const app = require('../../server/server');
const nodemailer = require('nodemailer');
const NOTIFICATION_DEVICE_OS_IOS = 'iOS';
const NOTIFICATION_DEVICE_OS_ANDROID = 'Android';
const NOTIFICATION_DEVICE_OS = [NOTIFICATION_DEVICE_OS_IOS, NOTIFICATION_DEVICE_OS_ANDROID];

module.exports = function(Notification) {
  Notification.prefixError = 'NOT_';

  Notification.observe('before save', function(ctx, next) {
    if (ctx.instance) {
      ctx.instance.modified = new Date();
    } else {
      ctx.data.modified = new Date();
    }
    next();
  });

  Notification.observe('after save', (ctx, next) => {
    if (ctx.isNewInstance) {
      if (typeof ctx.instance.type === 'string' && ctx.instance.type === 'all') {
        Notification.app.models.Member.find({
          where: {
            username: {
              neq: 'admin'
            }
          },
          "fields": {
            "device": true
          }
        }, function (err, devices) {
          if (err) {
            next();
          } else {
            let d = [];
            let listRegistrationIds = [];
            if(devices && devices.length) {
              for(let i = 0; i < devices.length; i++) {
                console.log(devices[i].device.registrationId);
                console.log(listRegistrationIds);
                console.log(d);
                if(devices[i].device && typeof devices[i].device.registrationId === 'string' && devices[i].device.registrationId !== '' && listRegistrationIds.indexOf(devices[i].device.registrationId) === -1) {
                  d.push(devices[i]);
                  listRegistrationIds.push(devices[i].device.registrationId);
                }
              }
            }

            if (d && d.length) {
              const q = async.queue(function (task, callback) {
                Notification.push(task, callback);
              }, 2);
              const item = d.map(device => {
                ctx.instance.device = device.device;
                return ctx.instance;
              });
              q.push(item, function (err) {
                console.log('finished processing notification');
              })

              q.drain = function () {
                console.log('All notifications are pushed');
              }
            }
            next();
          }
        })
      } else {
        Notification.push(ctx.instance, next);
      }
    } else {
      next();
    }
  });

  Notification.seen = (options, next) => {
    const {currentMember, currentStore} = options;
    Notification.updateAll({
      receiver: currentMember.id.toString(),
    }, {status: 1}, next);
  };

  Notification.push = (item, callback) => {
    if (item.device && item.device.registrationId) {
      let fcm = new FCM(app.get('firebase').serverKey);
      let message = {
        to: 'registration_token_or_topics',
        collapse_key: 'your_collapse_key',
        data: {
          your_custom_data_key: 'your_custom_data_value',
        },
        notification: {
          title: 'Title of your push notification',
          body: 'Body of your push notification',
        },
      };

      message.to = item.device.registrationId;
      message.notification.body = item.data.sentence;
      message.notification.title = item.title;
      message.data = item.data;
      switch (item.device.os) {
        case 'Android':
        case 'iOS':
        default:
          fcm.send(message, (err, response) => {
            if (err) {
              console.log(err);
              callback();
            } else {
              console.log(response);
              callback();
            }
          });
      }
    } else {
      callback();
    }
  };

  Notification.readNotification = (id, options, next) => {
    Notification.findById(id, (err, notification) => {
      if (err || !notification) {
        return next(new Error('Notification not found'));
      }
      notification.updateAttributes({
        status: 1,
      }, next);
    });
  };

  Notification.getAllNotifications = (options, next) => {
    const {currentMember} = options;
    if(!currentMember) return next(new Error('AUTHORIZATION_REQUIRED'));

    const {id} = currentMember;
    Notification.find({
      where: {
        or: [
          {
            "data.memberId": id.toString()
          },
          {
            type: 'all'
          }
        ]
      },
      order: 'modified DESC',
      limit: 30
    }, next);
  }

  Notification.sendEmail = (name, phoneNumber, email, web, project, next) => {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'minhnguyendhth11b@gmail.com',
        pass: 'nguyenhoangminh'
      }
    });

    const mailOptions = {
      from: 'youremail@gmail.com',
      to: app.get('email'),
      subject: 'Mày vừa nhận được một lần điền form từ dự án ' + project,
      html: `<h3>Khách hàng: ${name}</h3> <h3>Số điện thoại : ${phoneNumber}</h3> <h3>Email là: ${email}</h3>`
    };

    transporter.sendMail(mailOptions, function(error, info){
      if (error) {
        return next(error);
      } else {
        return next(null, info);
      }
    });
  }

  Notification.setup = () => {
    Notification.remoteMethod(
      'seen',
      {
        accessType: 'WRITE',
        accepts: [
          {arg: 'options', type: 'object', http: 'optionsFromRequest'},
        ],
        description: 'User read notifications',
        http: {verb: 'PUT', path: '/seen'},
        returns: {arg: 'data', type: 'object', root: true},
      }
    );

    Notification.remoteMethod(
      'getAllNotifications',
      {
        accessType: 'WRITE',
        accepts: [
          {arg: 'options', type: 'object', http: 'optionsFromRequest'},
        ],
        description: 'Get all notifications',
        http: {verb: 'GET', path: '/all'},
        returns: {arg: 'data', type: 'object', root: true},
      }
    );

    Notification.remoteMethod(
      'readNotification',
      {
        accessType: 'WRITE',
        accepts: [
          {arg: 'id', type: 'string', required: true},
          {arg: 'options', type: 'object', http: 'optionsFromRequest'},
        ],
        description: 'User read single notification',
        http: {verb: 'PUT', path: '/:id/seen'},
        returns: {arg: 'data', type: 'object', root: true},
      }
    );

    Notification.remoteMethod(
      'sendEmail',
      {
        accessType: 'WRITE',
        accepts: [
          {arg: 'name', type: 'string', required: true},
          {arg: 'phoneNumber', type: 'string', required: false},
          {arg: 'email', type: 'string', required: false},
          {arg: 'web', type: 'string', required: false},
          {arg: 'project', type: 'string', required: false},
        ],
        description: 'User read single notification',
        http: {verb: 'GET', path: '/sendEmail'},
        returns: {arg: 'data', type: 'object', root: true},
      }
    );
  };
  Notification.setup();
};
