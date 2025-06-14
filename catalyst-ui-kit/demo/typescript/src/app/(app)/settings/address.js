'use client';
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Address = void 0;
const input_1 = require("@/components/input");
const listbox_1 = require("@/components/listbox");
const data_1 = require("@/data");
const react_1 = require("react");
function Address() {
    let countries = (0, data_1.getCountries)();
    let [country, setCountry] = (0, react_1.useState)(countries[0]);
    return (<div className="grid grid-cols-2 gap-6">
      <input_1.Input aria-label="Street Address" name="address" placeholder="Street Address" defaultValue="147 Catalyst Ave" className="col-span-2"/>
      <input_1.Input aria-label="City" name="city" placeholder="City" defaultValue="Toronto" className="col-span-2"/>
      <listbox_1.Listbox aria-label="Region" name="region" placeholder="Region" defaultValue="Ontario">
        {country.regions.map((region) => (<listbox_1.ListboxOption key={region} value={region}>
            <listbox_1.ListboxLabel>{region}</listbox_1.ListboxLabel>
          </listbox_1.ListboxOption>))}
      </listbox_1.Listbox>
      <input_1.Input aria-label="Postal code" name="postal_code" placeholder="Postal Code" defaultValue="A1A 1A1"/>
      <listbox_1.Listbox aria-label="Country" name="country" placeholder="Country" by="code" value={country} onChange={(country) => setCountry(country)} className="col-span-2">
        {countries.map((country) => (<listbox_1.ListboxOption key={country.code} value={country}>
            <img className="w-5 sm:w-4" src={country.flagUrl} alt=""/>
            <listbox_1.ListboxLabel>{country.name}</listbox_1.ListboxLabel>
          </listbox_1.ListboxOption>))}
      </listbox_1.Listbox>
    </div>);
}
exports.Address = Address;
