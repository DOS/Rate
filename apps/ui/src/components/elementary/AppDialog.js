"use client";
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppDialog = exports.useDialogContext = void 0;
const react_1 = require("react");
const next_intl_1 = require("next-intl");
const utils_1 = require("@/lib/utils");
const dialog_1 = require("@/components/ui/dialog");
const DialogContext = (0, react_1.createContext)({
    closeModal: () => { },
    // eslint-disable-next-line no-unused-vars
    setConfirmDialogClose: (_) => { },
    confirmClose: false,
});
const useDialogContext = () => {
    return (0, react_1.useContext)(DialogContext);
};
exports.useDialogContext = useDialogContext;
function AppDialog({ Props: triggerButton, header, children, footerChildren, dialogContentClassName, confirmDialogClose, dialogCloseCallback, }) {
    const t = (0, next_intl_1.useTranslations)("comps.dialog");
    const [open, setOpen] = (0, react_1.useState)(false);
    const [confirmClose, setConfirmClose] = (0, react_1.useState)(confirmDialogClose ?? false);
    const providerValue = (0, react_1.useMemo)(() => ({
        closeModal: () => setOpen(false),
        confirmClose,
        setConfirmDialogClose: (value) => {
            setConfirmClose(value);
        },
    }), [confirmClose]);
    const handleOpenChange = (open) => {
        if (!!confirmClose && open === false && !confirm(t("confirmClose"))) {
            return;
        }
        if (open === false && !!dialogCloseCallback) {
            dialogCloseCallback();
        }
        setConfirmClose(confirmDialogClose ?? false);
        setOpen(open);
    };
    return (<dialog_1.Dialog open={open} onOpenChange={handleOpenChange}>
      <dialog_1.DialogTrigger asChild>{triggerButton}</dialog_1.DialogTrigger>
      <dialog_1.DialogContent className={(0, utils_1.cn)("max-h-screen overflow-auto", dialogContentClassName)}>
        <dialog_1.DialogHeader className="mb-4">
          <dialog_1.DialogTitle className="text-2xl font-semibold">
            {header.title}
          </dialog_1.DialogTitle>
          {header.description && (<dialog_1.DialogDescription className="text-justify">
              {header.description}
            </dialog_1.DialogDescription>)}
        </dialog_1.DialogHeader>
        <DialogContext.Provider value={providerValue}>
          {children}
        </DialogContext.Provider>
        {footerChildren && (<dialog_1.DialogFooter className="mt-4">{footerChildren}</dialog_1.DialogFooter>)}
      </dialog_1.DialogContent>
    </dialog_1.Dialog>);
}
exports.AppDialog = AppDialog;
