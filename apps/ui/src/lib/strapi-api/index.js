"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrivateStrapiClient = exports.PublicStrapiClient = void 0;
const private_1 = require("./private");
const public_1 = require("./public");
exports.PublicStrapiClient = new public_1.PublicClient();
exports.PrivateStrapiClient = new private_1.PrivateClient();
