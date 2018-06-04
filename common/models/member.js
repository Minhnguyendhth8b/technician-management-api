'use strict';
const async = require('async');
const validator = require('validator');

const MEMBER_TYPES = {
    USER: 1,
    MANAGER: 2,
    ADMIN: 3
}

const MALE = 1;
const FEMALE = 2;
const DEFAULT_SESSION_EXPIRED = 3600 * 999;
const PATTERN_STRING = "0123456789AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz";

module.exports = function(Member) {

    Member.definition.rawProperties.type.default = 
        Member.definition.rawProperties.type.default = () => {
        return [MEMBER_TYPES.USER];
    }
    
    Member.definition.rawProperties.lastLogin.default = 
        Member.definition.rawProperties.lastLogin.default = () => {
        return null;
    }

    Member.definition.rawProperties.created.default =
      Member.definition.properties.created.default = () => {
        return new Date();
    };

    Member.definition.rawProperties.modified.default =
      Member.definition.properties.modified.default = () => {
        return new Date();
    };
    
    Member.definition.rawProperties.dateOfBirth.default =
        Member.definition.properties.dateOfBirth.default = () => {
            return null;
    };
    
    // Update "modified" property and generate verify token if create new Member.
    Member.observe('before save', (ctx, next) => {
      // Create new user.
      if (ctx.instance) {
        if (!ctx.instance.emailVerified) {
          ctx.instance.verificationToken = Member.generateVerificationToken();
        }
      }

      // Update current Member.
      if (ctx.currentInstance) {
        ctx.currentInstance.modified = new Date();
      }

      next();
    });

    Member.beforeRemote('login', (ctx, unused, next) => {
        const { credentials } = ctx.args;
        if (!credentials) {
            return next(new Error('Missing credentials'));
        }

        const { username, password, longitude, latitude, socketId } = credentials;
        if (!username || !password || !longitude || !latitude || !socketId) {
            return next(new Error('Missing parameters'));
        }

        next();
    });

    Member.afterRemote('login', async (ctx, modelInstant, next) => {
        const { credentials } = ctx.args;
        if (!credentials) {
            return next(new Error('Missing credentials'));
        }

        const { username, password, longitude, latitude, socketId } = credentials;
        const { userId } = modelInstant;
        if (!userId) {
            return next(new Error('Something wrong'));
        }

        const user = await Member.findById(userId);
        try {
            const updatedUser = await user.updateAttributes({
                socketId: socketId,
                lastPosition: {
                    longitude: longitude,
                    latitude: latitude
                },
                lastLogin: new Date()
            });
        } catch (e) {
            return next(new Error(e));
        }

        
    })

    Member.generateVerificationToken = () => {
      let text = "";
      for (let i = 0; i < 128; i++) {
        text += PATTERN_STRING.charAt(Math.floor(Math.random() * PATTERN_STRING.length));
      }
      return text;
    };

    Member.updatePosition = (options, next) => {
        const { currentMember } = options;
        if (!currentMember) {
            return next(new Error('Permission denied'));
        }

        
    }

    Member.getAllStaffLocations = async (id, options, next) => {
        const { currentMember } = options;
        if (!currentMember) {
            return next(new Error('Permission denied'));
        }

        const { type } = currentMember;
        if (type.indexOf(MEMBER_TYPES.MANAGER) === -1) {
            return next(new Error('Permission denied'));
        }

        const staffs = await Member.find({
            where: {
                and: [
                    { type: 1 },
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
                lastLogin: true,
                modified: true
            }
        });

        return next(null, staffs);
    }

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
    }

    Member.setup();
};
