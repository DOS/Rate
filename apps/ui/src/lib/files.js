"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openBlobInNewTab = exports.downloadBlob = void 0;
const downloadBlob = (blob, fileName) => {
    const fileUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = fileUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
exports.downloadBlob = downloadBlob;
const openBlobInNewTab = (blob) => {
    const file = window.URL.createObjectURL(blob);
    window.open(file, "_blank");
};
exports.openBlobInNewTab = openBlobInNewTab;
