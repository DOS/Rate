"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const design_system_1 = require("@strapi/design-system");
const SimpleInput = ({ attribute, disabled, intlLabel, labelAction, name, onChange, required, value = '' }) => {
    const handleChange = (e) => {
        onChange({
            target: {
                name,
                value: e.target.value,
                type: 'text'
            },
        });
    };
    return (<design_system_1.Field.Root name={name} id={name} required={required}>
      <design_system_1.Field.Label action={labelAction}>
        {intlLabel?.defaultMessage || name}
      </design_system_1.Field.Label>
      <design_system_1.TextInput name={name} placeholder="Enter component list..." value={value || ''} onChange={handleChange} disabled={disabled}/>
    </design_system_1.Field.Root>);
};
exports.default = SimpleInput;
