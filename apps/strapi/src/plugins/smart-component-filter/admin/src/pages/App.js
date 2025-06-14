"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin_1 = require("@strapi/strapi/admin");
const react_router_dom_1 = require("react-router-dom");
const HomePage_1 = require("./HomePage");
const App = () => {
    return (<react_router_dom_1.Routes>
      <react_router_dom_1.Route index element={<HomePage_1.HomePage />}/>
      <react_router_dom_1.Route path="*" element={<admin_1.Page.Error />}/>
    </react_router_dom_1.Routes>);
};
exports.default = App;
