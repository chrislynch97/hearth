import type { ReactNode } from "react";

export interface AuthFormProps {
    onSubmit: () => void;
    children: ReactNode;
}

/** A real form so Enter and password managers work. `noValidate` because each
 *  screen words its own errors. */
export const AuthForm = ({ onSubmit, children }: AuthFormProps) => (
    <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
        }}
    >
        {children}
    </form>
);
