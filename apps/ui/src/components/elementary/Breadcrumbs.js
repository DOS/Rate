"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Breadcrumbs = void 0;
const utils_1 = require("@/lib/utils");
const AppLink_1 = __importDefault(require("@/components/elementary/AppLink"));
function Breadcrumbs({ breadcrumbs, className }) {
    if (!breadcrumbs || breadcrumbs.length === 0) {
        return null;
    }
    return (<div className={(0, utils_1.cn)("max-w-screen-default mx-auto w-full", className)}>
      <div>
        {breadcrumbs.map((breadcrumb, index) => (<span key={breadcrumb.fullPath}>
            {index !== 0 && (<span className={(0, utils_1.cn)("mx-2 inline-block text-black")}>/</span>)}

            {index !== breadcrumbs.length - 1 ? (<AppLink_1.default href={breadcrumb.fullPath} className="p-0">
                <span className={(0, utils_1.cn)("tracking-sm inline-block text-xs leading-[18px] text-black md:text-sm md:leading-[21px]")}>
                  {breadcrumb.title}
                </span>
              </AppLink_1.default>) : (<span className={(0, utils_1.cn)("tracking-sm inline-block text-xs leading-[18px] break-words text-black md:text-sm md:leading-[21px]")} style={{
                    wordBreak: "break-word",
                    overflowWrap: "break-word",
                    display: "inline",
                }}>
                {breadcrumb.title}
              </span>)}
          </span>))}
      </div>
    </div>);
}
exports.Breadcrumbs = Breadcrumbs;
