"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyRecaptcha = void 0;
const env_mjs_1 = require("@/env.mjs");
const verificationUrl = "https://www.google.com/recaptcha/api/siteverify";
const verifyRecaptcha = async (token) => {
    "use server";
    if (!token || !env_mjs_1.env.RECAPTCHA_SECRET_KEY) {
        return false;
    }
    try {
        const response = await fetch(verificationUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                secret: env_mjs_1.env.RECAPTCHA_SECRET_KEY,
                response: token,
            }).toString(),
            cache: "no-store",
        });
        const data = await response.json();
        // reCAPTCHA v3 returns a score (0.0 - 1.0), usually accept > 0.5
        return data.success && data.score >= 0.5;
    }
    catch (error) {
        return false;
    }
};
exports.verifyRecaptcha = verifyRecaptcha;
