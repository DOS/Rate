"use client";
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("react");
const crypto_1 = require("@/lib/crypto");
const navigation_1 = require("@/lib/navigation");
/**
 * This component reloads the application when an update from Strapi is reported. This is useful for the sidebar preview
 * in case of Growth or EE plans.
 */
function StrapiPreviewWindowChangeListener({ hashedAllowedReloadOrigin, // to avoid bundling strapi URL, we pass this as a hash from SSR parent
 }) {
    const router = (0, navigation_1.useRouter)();
    (0, react_1.useEffect)(() => {
        const handleMessage = async (message) => {
            if (
            /**
             * Filters events emitted through the postMessage() API
             *
             * The origin is checked based on a hashed value to avoid sharing the strapi URL to client-side bundle.
             *  */
            message.data.type === "strapiUpdate" && // The order is important -> keep the cheap operations at the beginning of this statement
                (await (0, crypto_1.hashStringSHA256)(message.origin)) === hashedAllowedReloadOrigin) {
                router.refresh();
            }
        };
        window.addEventListener("message", handleMessage);
        return () => {
            window.removeEventListener("message", handleMessage);
        };
    }, []);
    return null;
}
exports.default = StrapiPreviewWindowChangeListener;
