import type { ReactNode } from "react";

export interface FormFooterProps {
    /** Anything that isn't saving, like a delete, on the far side from it. */
    aside?: ReactNode;
    /** The submit button. */
    children: ReactNode;
}

/** The foot of a form in a sheet: the same row a dialog's footer has, with the
 *  submit stacking on top on a phone, where the thumb is. */
export const FormFooter = ({ aside, children }: FormFooterProps) => (
    <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {aside && (
            <div className="flex flex-wrap gap-2 has-[[data-confirming]]:w-full max-sm:[&>*]:flex-1">
                {aside}
            </div>
        )}
        <div className="flex sm:ml-auto">{children}</div>
    </div>
);
