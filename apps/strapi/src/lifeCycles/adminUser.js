"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAdminUserSubscriber = void 0;
const registerAdminUserSubscriber = async ({ strapi, }) => {
    strapi.db.lifecycles.subscribe({
        models: ["admin::user"],
        async afterCreate(event) {
            await sendEmail(strapi, event);
        },
    });
};
exports.registerAdminUserSubscriber = registerAdminUserSubscriber;
/**
 * Send email after registration to admin strapi panel.
 * Email is sent:
 *  - if the admin is created from the admin panel
 */
const sendEmail = async (strapi, event) => {
    const { email, registrationToken } = event.result ?? {};
    if (registrationToken && email) {
        const html = `<h2>Welcome to our team!</h2> <h3>We have created an administrator account for you</h3><p>
           To access the administration panel, click <a href="${process.env.APP_URL}/admin/auth/register?registrationToken=${registrationToken}" target="_blank">here</a>.
         </p>`;
        try {
            await strapi.plugins["email"].services.email.send({
                to: email,
                subject: "Strapi invitation to the administration panel",
                html,
            });
        }
        catch (e) {
            // TODO: handle error
            console.log(e);
        }
    }
};
