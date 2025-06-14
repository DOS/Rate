"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdornmentError = exports.AdornmentSuccess = void 0;
const lucide_react_1 = require("lucide-react");
const AdornmentSuccess = () => {
    return (<span>
      <lucide_react_1.CheckIcon height="1.5rem" width="1.5rem"/>
    </span>);
};
exports.AdornmentSuccess = AdornmentSuccess;
const AdornmentError = () => {
    return (<span>
      <lucide_react_1.CrossIcon height="1.5rem" width="1.5rem"/>
    </span>);
};
exports.AdornmentError = AdornmentError;
