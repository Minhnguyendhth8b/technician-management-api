'use strict';
const async = require('async');
module.exports = function(Conversation) {

	Conversation.getRecentConversations = async (userId, next) => {
        try {
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

	};
};
