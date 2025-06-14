"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Initializer = void 0;
const react_1 = require("react");
const pluginId_1 = require("../pluginId");
const Initializer = ({ setPlugin }) => {
    const ref = (0, react_1.useRef)(setPlugin);
    (0, react_1.useEffect)(() => {
        ref.current(pluginId_1.PLUGIN_ID);
    }, []);
    return null;
};
exports.Initializer = Initializer;
