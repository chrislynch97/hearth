export interface EmptyLineProps {
    children: string;
}

/** Holds a line's worth of height where a list has nothing in it, so the two
 *  columns of a pot card stay level. */
export const EmptyLine = ({ children }: EmptyLineProps) => (
    <p className="flex h-7 items-center px-1 text-xs text-text-faint">
        {children}
    </p>
);
