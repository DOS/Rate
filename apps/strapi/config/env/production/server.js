"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cron_tasks_1 = __importDefault(require("../../cron-tasks"));
exports.default = ({ env }) => ({
    proxy: true,
    url: env("APP_URL"), // Sets the public URL of the application.
    app: {
        keys: env.array("APP_KEYS"),
    },
    webhooks: {
        populateRelations: env.bool("WEBHOOKS_POPULATE_RELATIONS", false),
    },
    cron: {
        enabled: env.bool("CRON_ENABLED", false),
        tasks: cron_tasks_1.default,
    },
});
