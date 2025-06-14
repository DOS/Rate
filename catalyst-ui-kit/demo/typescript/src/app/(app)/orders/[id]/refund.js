'use client';
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefundOrder = void 0;
const button_1 = require("@/components/button");
const checkbox_1 = require("@/components/checkbox");
const dialog_1 = require("@/components/dialog");
const fieldset_1 = require("@/components/fieldset");
const input_1 = require("@/components/input");
const select_1 = require("@/components/select");
const react_1 = require("react");
function RefundOrder({ amount, ...props }) {
    let [isOpen, setIsOpen] = (0, react_1.useState)(false);
    return (<>
      <button_1.Button type="button" onClick={() => setIsOpen(true)} {...props}/>
      <dialog_1.Dialog open={isOpen} onClose={setIsOpen}>
        <dialog_1.DialogTitle>Refund payment</dialog_1.DialogTitle>
        <dialog_1.DialogDescription>
          The refund will be reflected in the customer’s bank account 2 to 3 business days after processing.
        </dialog_1.DialogDescription>
        <dialog_1.DialogBody>
          <fieldset_1.FieldGroup>
            <fieldset_1.Field>
              <fieldset_1.Label>Amount</fieldset_1.Label>
              <input_1.Input name="amount" defaultValue={amount} placeholder="$0.00" autoFocus/>
            </fieldset_1.Field>
            <fieldset_1.Field>
              <fieldset_1.Label>Reason</fieldset_1.Label>
              <select_1.Select name="reason" defaultValue="">
                <option value="" disabled>
                  Select a reason&hellip;
                </option>
                <option value="duplicate">Duplicate</option>
                <option value="fraudulent">Fraudulent</option>
                <option value="requested_by_customer">Requested by customer</option>
                <option value="other">Other</option>
              </select_1.Select>
            </fieldset_1.Field>
            <checkbox_1.CheckboxField>
              <checkbox_1.Checkbox name="notify"/>
              <fieldset_1.Label>Notify customer</fieldset_1.Label>
              <fieldset_1.Description>An email notification will be sent to this customer.</fieldset_1.Description>
            </checkbox_1.CheckboxField>
          </fieldset_1.FieldGroup>
        </dialog_1.DialogBody>
        <dialog_1.DialogActions>
          <button_1.Button plain onClick={() => setIsOpen(false)}>
            Cancel
          </button_1.Button>
          <button_1.Button onClick={() => setIsOpen(false)}>Refund</button_1.Button>
        </dialog_1.DialogActions>
      </dialog_1.Dialog>
    </>);
}
exports.RefundOrder = RefundOrder;
