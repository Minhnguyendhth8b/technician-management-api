'use strict';
module.exports = (app) => {
    app.remotes().phases
        .addBefore('invoke', 'options-from-request')
        .use((ctx, next) => {
            if (!ctx.args.options || !ctx.args.options.accessToken) return next();
            const Member = app.models.Member;
            Member.findById(ctx.args.options.accessToken.userId, (err, member) => {
                if (err) return next(err);
                ctx.args.options.currentMember = member;
                next();
            });
        });
}