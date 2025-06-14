"use client";
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppFilePicker = void 0;
const react_1 = require("react");
const react_icons_1 = require("@radix-ui/react-icons");
const lucide_react_1 = require("lucide-react");
const next_intl_1 = require("next-intl");
const utils_1 = require("@/lib/utils");
const Tooltip_1 = require("@/components/elementary/Tooltip");
const AppFormLabel_1 = require("@/components/forms/AppFormLabel");
const form_1 = require("@/components/ui/form");
const use_toast_1 = require("@/components/ui/use-toast");
// TODO: refactor this to react-hook-form field with Zod validation
// eg.: https://claritydev.net/blog/react-hook-form-multipart-form-data-file-uploads
function AppFilePicker({ selectedFile, setSelectedFile, tabIndex, validTypes = [], containerClassName, fieldClassName, label, required, }) {
    const [isDraggingOver, setIsDraggingOver] = (0, react_1.useState)(false);
    const fileInputRef = (0, react_1.useRef)(null);
    const t = (0, next_intl_1.useTranslations)("comps.fileInput");
    const { toast } = (0, use_toast_1.useToast)();
    const setFile = (file) => {
        if (file === null || validTypes.includes(file.type)) {
            setSelectedFile(file);
        }
        else {
            toast({
                variant: "destructive",
                title: t("wrongFileType"),
                description: t("validFileTypes", {
                    validFileTypes: validTypes
                        .map((type) => (type.includes("/") ? type.split("/").pop() : type))
                        .join(", "),
                }),
            });
        }
    };
    const handleFileInputChange = (e) => {
        const file = e.target.files?.[0] || null;
        setFile(file);
    };
    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDraggingOver(true);
    };
    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDraggingOver(false);
    };
    const handleDrop = (e) => {
        e.preventDefault();
        setIsDraggingOver(false);
        const file = e.dataTransfer.files[0];
        if (file) {
            setFile(file);
        }
    };
    const openFileInput = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };
    const removeSelectedFile = () => {
        setFile(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };
    return (<form_1.FormItem className={containerClassName}>
      <AppFormLabel_1.AppFormLabel label={label} required={required}/>

      <div className={(0, utils_1.cn)(fieldClassName, "w-full rounded-lg border-2", {
            "bg-gray-100": isDraggingOver,
            "cursor-pointer": !selectedFile,
        })} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
        <input type="file" accept=".csv" onChange={handleFileInputChange} className="hidden" ref={fileInputRef}/>
        <div className="flex size-full items-center justify-center">
          {selectedFile ? (<div>
              <div className="flex w-full items-center justify-between gap-5">
                <span className="flex items-center gap-1">
                  <lucide_react_1.PaperclipIcon size={16}/> {selectedFile.name}
                </span>
                <Tooltip_1.Tooltip contentProps={{ side: "left" }} content={t("removeFile")}>
                  <button type="button" tabIndex={tabIndex} onClick={(e) => {
                e.preventDefault();
                removeSelectedFile();
            }}>
                    <react_icons_1.Cross1Icon />
                  </button>
                </Tooltip_1.Tooltip>
              </div>
            </div>) : (<button type="button" tabIndex={tabIndex} onClick={(e) => {
                e.preventDefault();
                openFileInput();
            }} className="size-full text-sm text-gray-500">
              {t("dragAndDrop")}
            </button>)}
        </div>
      </div>
    </form_1.FormItem>);
}
exports.AppFilePicker = AppFilePicker;
