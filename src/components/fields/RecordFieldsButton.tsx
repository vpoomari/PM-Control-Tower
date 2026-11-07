"use client";
// PM CONTROL TOWER — RecordFieldsButton
// One-line row action for any module table: opens the "Custom fields" sheet for
// that record. Drop it into a module's actions column:
//
//   render: (r) => <RecordFieldsButton moduleKey="risk" recordId={r.id} label={r.code} />

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import RecordFieldsSheet from "./RecordFieldsSheet";

export default function RecordFieldsButton({
  moduleKey, recordId, label, onSaved, className,
}: {
  moduleKey: string;
  recordId: string;
  label?: string;
  onSaved?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost" size="icon"
        className={className ?? "h-7 w-7 text-slate-400 hover:text-blue-600"}
        title={label ? `Custom fields for ${label}` : "Custom fields"}
        aria-label={label ? `Custom fields for ${label}` : "Custom fields"}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
      >
        <Sparkles className="h-3.5 w-3.5" />
      </Button>
      <RecordFieldsSheet
        moduleKey={moduleKey} recordId={recordId} recordLabel={label}
        open={open} onOpenChange={setOpen} onSaved={onSaved}
      />
    </>
  );
}
