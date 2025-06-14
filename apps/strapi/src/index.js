"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const adminUser_1 = require("./lifeCycles/adminUser");
const populateDeep_1 = require("./lifeCycles/populateDeep");
const user_1 = require("./lifeCycles/user");
exports.default = {
    /**
     * An asynchronous register function that runs before
     * your application is initialized.
     *
     * This gives you an opportunity to extend code.
     */
    register( /*{ strapi }*/) { },
    /**
     * An asynchronous bootstrap function that runs before
     * your application gets started.
     *
     * This gives you an opportunity to set up your data model,
     * run jobs, or perform some special logic.
     */
    bootstrap({ strapi }) {
        (0, adminUser_1.registerAdminUserSubscriber)({ strapi });
        (0, user_1.registerUserSubscriber)({ strapi });
        (0, populateDeep_1.registerPopulateDeepSubscriber)({ strapi });
    },
};
