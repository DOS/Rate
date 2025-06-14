"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Tooltip = void 0;
const tooltip_1 = require("@/components/ui/tooltip");
function Tooltip({ children, content, contentProps }) {
    return (<tooltip_1.TooltipProvider>
      <tooltip_1.Tooltip>
        <tooltip_1.TooltipTrigger asChild>{children}</tooltip_1.TooltipTrigger>
        <tooltip_1.TooltipContent {...contentProps}>{content}</tooltip_1.TooltipContent>
      </tooltip_1.Tooltip>
    </tooltip_1.TooltipProvider>);
}
exports.Tooltip = Tooltip;
