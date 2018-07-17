'use strict';
const async = require('async');
module.exports = function(Conversation) {

	Conversation.getRecentConversations = async (options, next) => {
        try {
            const {currentMember} = options;
            if(!currentMember) {
                return next(new Error('PERMISSION_DENIED'));
            }

            const userId = currentMember.id;
            if(!userId || userId === '') {
                return next(new Error('Acess Token is expired'));
            }
            const user = await Conversation.app.models.Member.findById(userId);
            if(!user) {
                return next(new Error('User not found'));
            }
            const conversations = await Conversation.find({
                where: {
                    participants: userId
                },
                include: 'messages'
            });
            return next(null, conversations);
        }catch(e) {
            return next(e);
        }
	}

	Conversation.setup = () => {
        Conversation.remoteMethod('getRecentConversations', {
            accepts: [
                { arg: 'options', type: 'object', http: 'optionsFromRequest' }
            ],
            description: 'Get Location of all staffs',
            http: { verb: 'GET', path: '/:id/recents' },
            returns: { arg: 'data', type: 'object', root: true },
        })
	};
};
