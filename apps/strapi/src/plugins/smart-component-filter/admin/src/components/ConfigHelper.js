"use strict";
// Configuration Helper Script for Smart Component Filter
// Copy and paste this into browser console to configure components
Object.defineProperty(exports, "__esModule", { value: true });
exports.SmartComponentFilterHelper = void 0;
class SmartComponentFilterHelper {
    static listAllComponents(components) {
        // List all available components for configuration
        // Group components by category
        const componentsByCategory = components.reduce((acc, component) => {
            if (!acc[component.category]) {
                acc[component.category] = [];
            }
            acc[component.category].push(component);
            return acc;
        }, {});
        return componentsByCategory;
    }
    static saveConfiguration(componentUIDs) {
        try {
            const config = {
                allowedComponents: componentUIDs,
                timestamp: new Date().toISOString()
            };
            localStorage.setItem('smart-component-filter-config', JSON.stringify(config));
            return true;
        }
        catch (error) {
            return false;
        }
    }
    static getCurrentConfiguration() {
        try {
            const configStr = localStorage.getItem('smart-component-filter-config');
            if (configStr) {
                const config = JSON.parse(configStr);
                return config;
            }
            else {
                return null;
            }
        }
        catch (error) {
            return null;
        }
    }
    static clearConfiguration() {
        try {
            localStorage.removeItem('smart-component-filter-config');
            return true;
        }
        catch (error) {
            return false;
        }
    }
    static help() {
        return `
Smart Component Filter Configuration Helper

Available methods:
- SmartComponentFilter.listAllComponents() - Show all available components
- SmartComponentFilter.saveConfiguration(['component.uid1', 'component.uid2']) - Save allowed components
- SmartComponentFilter.getCurrentConfiguration() - Show current config
- SmartComponentFilter.clearConfiguration() - Clear saved config
- SmartComponentFilter.help() - Show this help

Example usage:
const components = SmartComponentFilter.listAllComponents();
SmartComponentFilter.saveConfiguration(['contact.basic', 'info.bank-info']);
    `;
    }
}
exports.SmartComponentFilterHelper = SmartComponentFilterHelper;
// Global access
window.SmartComponentFilter = SmartComponentFilterHelper;
// Configuration helper loaded
exports.default = {};
